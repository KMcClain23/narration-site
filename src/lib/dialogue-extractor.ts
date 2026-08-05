import Anthropic from "@anthropic-ai/sdk";
import { sanitiseClaudeJson } from "@/lib/sanitize-claude-json";
import { findMatch } from "@/lib/dialogue-match";

const anthropic = new Anthropic({ maxRetries: 4 });

// Validated in testing — keep this wording.
const SYSTEM_PROMPT = `You are extracting structural data from a novel chapter for an audiobook
narrator's prep tool.

Return ONLY valid JSON, no markdown fences, no preamble. Schema:
{
  "characters": ["Name1", "Name2"],
  "summary": "1-2 sentence chapter summary, no spoilers beyond this chapter",
  "dialogue": [{"speaker": "Name", "text": "exact verbatim spoken text
    INCLUDING the surrounding quotation marks, copied character-for-character
    from the source, including curly quotes if present"}]
}

Rules:
- "characters" = every named character who speaks OR is clearly present/
  referenced as a person in this chapter.
- "dialogue" = every line of spoken dialogue in the chapter, in order.
  Attribute each to the specific speaking character by name (not
  "narrator", not pronouns) using context, dialogue tags, and
  conversational flow.
- The "text" field must be copyable EXACTLY as it appears in the source
  (same quote characters, same punctuation) so it can be located via
  string search. Do not paraphrase or normalize.
- If a chapter is written in first person, the narrator's own spoken
  dialogue should still be attributed to their actual name if known from
  context, otherwise "Narrator".`;

export interface DialogueSpanResult {
  speaker: string;
  text: string;
  matched: boolean;
  start: number;
  end: number;
}

export interface ExtractResult {
  characters: string[];
  summary: string;
  dialogueSpans: DialogueSpanResult[];
}

interface RawExtraction {
  characters?: unknown;
  summary?: unknown;
  dialogue?: unknown;
}

function parseExtraction(raw: string): RawExtraction {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to sanitised attempt
  }
  // Let this one throw if still invalid — caller treats parse failure as a
  // hard error for this chapter (it stays resumable: summary stays null).
  return JSON.parse(sanitiseClaudeJson(cleaned));
}

/**
 * Runs the Claude extraction call for one chapter's raw_text, then locates
 * each returned dialogue line inside that text.
 *
 * Matching always scans forward from a running cursor that only advances on
 * a successful match — never from index 0 — so that repeated short lines
 * ("Okay." said twice) resolve to their correct, later occurrence instead of
 * all collapsing onto the first one. A line that can't be found from the
 * cursor gets one more attempt via a whole-chapter fallback search (from
 * index 0) purely so the correction UI has *some* offset to jump to; that
 * fallback never advances the cursor and never counts as matched.
 *
 * knownCharacters is the rolling list of names already seen in earlier
 * chapters of the same manuscript, appended to the prompt so Claude reuses
 * established spellings instead of reinventing them chapter to chapter.
 */
export async function extractChapter(rawText: string, knownCharacters: string[]): Promise<ExtractResult> {
  const system = knownCharacters.length
    ? `${SYSTEM_PROMPT}\n\nCharacters already identified in earlier chapters of this manuscript: ${knownCharacters.join(", ")}. If any of them appear again in this chapter, use these exact names — don't invent new spellings or nicknames for them.`
    : SYSTEM_PROMPT;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    // 4000 (the original spec value) was silently truncating mid-JSON on a
    // dialogue-dense chapter of "A Cowboys Runaway" — confirmed via the
    // stop_reason log below (max_tokens twice in a row, two different
    // "unterminated JSON" parse errors that were really the same truncation).
    // Raised with real headroom rather than nudging it up again next time.
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: rawText }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  // Same lesson as manuscript-parser's chapter-detection call: log stop_reason
  // so a dialogue-heavy chapter that blows through max_tokens shows up in
  // logs instead of silently dropping trailing dialogue entries.
  console.log(`[dialogue-extractor] stop_reason=${msg.stop_reason} output_tokens=${msg.usage.output_tokens} raw_len=${raw.length}`);

  const parsed = parseExtraction(raw);

  const characters = Array.isArray(parsed.characters)
    ? parsed.characters
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim())
    : [];

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) throw new Error("Claude returned no summary");

  const dialogueRaw = Array.isArray(parsed.dialogue) ? parsed.dialogue : [];

  let cursor = 0;
  const dialogueSpans: DialogueSpanResult[] = dialogueRaw
    .filter(
      (d): d is { speaker: string; text: string } =>
        !!d && typeof d.speaker === "string" && typeof d.text === "string" && d.text.length > 0
    )
    .map((d) => {
      const speaker = d.speaker.trim();
      const primary = findMatch(rawText, d.text, cursor);
      if (primary) {
        cursor = primary.end;
        return { speaker, text: d.text, matched: true, start: primary.start, end: primary.end };
      }
      const fallback = findMatch(rawText, d.text, 0);
      return { speaker, text: d.text, matched: false, start: fallback?.start ?? 0, end: fallback?.end ?? 0 };
    });

  return { characters, summary, dialogueSpans };
}
