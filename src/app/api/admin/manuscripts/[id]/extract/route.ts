import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractChapter } from "@/lib/dialogue-extractor";
import { nextCharacterColor } from "@/lib/character-colors";

export const maxDuration = 60;

const TAG = "[extract v2]";

/**
 * How many times a chapter may be picked up before it is given up on.
 *
 * The count is incremented *before* the Claude call, not after it, which is
 * the whole point: an invocation killed mid-flight never reaches any error
 * handling, so the only durable evidence it ran at all is a write that
 * happened first.
 */
const MAX_ATTEMPTS = 3;

/**
 * Queue the next chapter.
 *
 * `after()` rather than a bare unawaited fetch. A promise left floating when
 * the handler returns has no guarantee of completing on a serverless runtime —
 * the invocation is frozen or torn down once the response is sent, and the
 * request to the next chapter may never leave the process. That is silent: the
 * chapter that just finished is saved correctly, nothing errors, and the chain
 * simply stops. `after()` tells the platform work is still outstanding and to
 * keep the invocation alive for it.
 */
function queueNextChapter(manuscriptId: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
  after(async () => {
    try {
      await fetch(`${baseUrl}/api/admin/manuscripts/${manuscriptId}/extract`, { method: "POST" });
    } catch (e) {
      console.error(`${TAG} failed to queue next chapter for ${manuscriptId}`, e);
    }
  });
}

// POST: processes exactly one chapter — the lowest order_index still awaiting
// extraction — then queues itself for the next. Deliberately stateless between
// calls: "next chapter to do" is derived from the chapters table each time, so
// an interrupted chain resumes from wherever it left off with no separate job
// or progress row.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // "Still to do" is: no summary, no recorded failure, and not already over
  // its retry budget. Each condition exists because of a way the chain
  // previously stalled — a completed chapter being re-selected, a failed one
  // being retried forever, and an invocation that died silently leaving a
  // chapter that could never be got past.
  const { data: chapter, error: chapterError } = await supabaseAdmin
    .from("chapters")
    .select("id, order_index, raw_text, extraction_attempts")
    .eq("manuscript_id", id)
    .is("summary", null)
    .is("extraction_error", null)
    .lt("extraction_attempts", MAX_ATTEMPTS)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (chapterError) return NextResponse.json({ error: chapterError.message }, { status: 500 });

  if (!chapter) {
    // Nothing selectable. That is either genuinely finished, or everything
    // left has exhausted its retries — worth distinguishing in the log,
    // because the second case means chapters are missing from the book.
    const { count: stuck } = await supabaseAdmin
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("manuscript_id", id)
      .is("summary", null)
      .is("extraction_error", null)
      .gte("extraction_attempts", MAX_ATTEMPTS);

    if (stuck && stuck > 0) {
      // Give them a visible reason rather than leaving them indistinguishable
      // from unprocessed chapters forever.
      await supabaseAdmin
        .from("chapters")
        .update({
          extraction_error: `Gave up after ${MAX_ATTEMPTS} attempts — the extraction call did not complete (likely exceeded the ${maxDuration}s function limit).`,
        })
        .eq("manuscript_id", id)
        .is("summary", null)
        .is("extraction_error", null)
        .gte("extraction_attempts", MAX_ATTEMPTS);
      console.warn(`${TAG} ${stuck} chapter(s) of ${id} exhausted their retry budget`);
    }

    console.log(`${TAG} manuscript ${id} complete`);
    return NextResponse.json({ done: true, exhausted: stuck ?? 0 });
  }

  // Recorded before any slow work, so an invocation that dies partway through
  // still leaves proof it happened.
  const attempt = (chapter.extraction_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("chapters")
    .update({ extraction_attempts: attempt })
    .eq("id", chapter.id);

  console.log(`${TAG} chapter ${chapter.order_index} of ${id}, attempt ${attempt}/${MAX_ATTEMPTS}, ${chapter.raw_text?.length ?? 0} chars`);

  try {
    const { data: existingCharacters, error: charFetchError } = await supabaseAdmin
      .from("characters")
      .select("id, name")
      .eq("manuscript_id", id);
    if (charFetchError) throw new Error(charFetchError.message);

    const characterMap = new Map<string, string>();
    (existingCharacters ?? []).forEach((c) => characterMap.set(c.name, c.id));
    let colorCount = characterMap.size;

    const result = chapter.raw_text?.trim()
      ? await extractChapter(chapter.raw_text, Array.from(characterMap.keys()))
      : { characters: [], summary: "(no extractable text)", dialogueSpans: [] };

    // Every name Claude surfaced — whether via "characters" or only as a
    // dialogue speaker — gets a roster row, matched or not: Phase 5's
    // correction UI needs the character to already exist to reassign an
    // unmatched span to it.
    const allNames = new Set<string>(result.characters);
    result.dialogueSpans.forEach((d) => allNames.add(d.speaker));

    for (const name of allNames) {
      if (!name || characterMap.has(name)) continue;
      const { data: created, error: createError } = await supabaseAdmin
        .from("characters")
        .insert({ manuscript_id: id, name, color_hex: nextCharacterColor(colorCount) })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      characterMap.set(name, created.id);
      colorCount++;
    }

    if (result.dialogueSpans.length) {
      const spanRows = result.dialogueSpans.map((d) => ({
        chapter_id: chapter.id,
        character_id: d.matched ? (characterMap.get(d.speaker) ?? null) : null,
        start_offset: d.start,
        end_offset: d.end,
        matched: d.matched,
        // Stored for every span, not just unmatched ones — cheap audit trail:
        // what Claude actually said vs. where it landed, without re-running
        // extraction to find out if a highlight ever looks wrong later.
        extracted_text: d.text,
      }));
      const { error: spanError } = await supabaseAdmin.from("dialogue_spans").insert(spanRows);
      if (spanError) throw new Error(spanError.message);
    }

    const { error: summaryError } = await supabaseAdmin
      .from("chapters")
      .update({ summary: result.summary })
      .eq("id", chapter.id);
    if (summaryError) throw new Error(summaryError.message);

    const matched = result.dialogueSpans.filter((d) => d.matched).length;
    console.log(
      `${TAG} chapter ${chapter.order_index} done — ${result.dialogueSpans.length} spans (${matched} matched), ${characterMap.size} characters known`
    );

    queueNextChapter(id);

    return NextResponse.json({
      done: false,
      chapterId: chapter.id,
      orderIndex: chapter.order_index,
      attempt,
      charactersKnown: characterMap.size,
      dialogueMatched: matched,
      dialogueUnmatched: result.dialogueSpans.length - matched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`${TAG} chapter ${chapter.order_index} failed:`, msg);

    // Only give up once the retry budget is spent. A truncated response or a
    // transient API error is worth another go; recording a permanent failure
    // on the first stumble would strand a chapter that would have succeeded.
    if (attempt >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("chapters")
        .update({ extraction_error: msg.slice(0, 500) })
        .eq("id", chapter.id);
    }

    // The chain continues either way. This used to queue the next chapter only
    // on the success path, so one bad chapter halted extraction for the entire
    // book and every chapter after it stayed unprocessed with nothing on
    // screen explaining why.
    queueNextChapter(id);

    // Deliberately does NOT flip manuscripts.status to "failed" — unlike
    // Phase 2's parse (where a failure means zero chapters exist and the
    // reader has nothing to show), an extraction failure here is scoped to one
    // chapter. Phase 4 gates the whole reader on status !== "ready", so
    // setting "failed" would hide every already-extracted chapter over one
    // transient error.
    return NextResponse.json({ error: msg, attempt }, { status: 500 });
  }
}
