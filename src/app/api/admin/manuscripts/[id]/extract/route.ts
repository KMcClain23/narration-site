import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractChapter } from "@/lib/dialogue-extractor";
import { nextCharacterColor } from "@/lib/character-colors";

export const maxDuration = 60;

const TAG = "[extract v3]";

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
 * Called from inside the `after()` callback below and deliberately not wrapped
 * in an `after()` of its own. `after()` registers work against an active
 * request; from within an already-running after-callback the response is long
 * since sent, so the nested registration silently does nothing and the chain
 * stops dead. That produced exactly the symptom it was meant to cure — a
 * chapter finishing cleanly, and the next one showing zero attempts and no
 * error, as though it had never been reached.
 *
 * Awaiting the response is safe here only because the receiving route
 * acknowledges before doing its work. While it replied on completion instead,
 * every invocation stayed open for the whole remainder of the book: the first
 * call could not return until the last chapter finished, and the outermost one
 * hit its time limit and took every in-flight descendant with it.
 */
async function queueNextChapter(manuscriptId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
  try {
    const res = await fetch(`${baseUrl}/api/admin/manuscripts/${manuscriptId}/extract`, {
      method: "POST",
    });
    // Logged so a broken handoff is visible as a broken handoff. Twice now the
    // symptom has been a chapter with zero attempts and no error anywhere,
    // which reads like the chapter was never reached rather than like the
    // request that should have reached it was never sent.
    console.log(`${TAG} queued next chapter for ${manuscriptId} (${res.status})`);
  } catch (e) {
    console.error(`${TAG} failed to queue next chapter for ${manuscriptId}`, e);
  }
}

// POST: acknowledges immediately, then processes exactly one chapter — the
// lowest order_index still awaiting extraction — and queues itself for the
// next. Deliberately stateless between calls: "next chapter to do" is derived
// from the chapters table each time, so an interrupted chain resumes from
// wherever it left off with no separate job or progress row.
//
// The acknowledgement is sent before the work begins, and that ordering is
// load-bearing rather than cosmetic — see queueNextChapter above. Replying
// first makes each hop a genuine handoff instead of a nested call.
//
// Per-chapter progress is therefore not in the response. It is in the logs,
// and the Prepper poller reads it from the manuscripts endpoint.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  after(() => processOneChapter(id));
  return NextResponse.json({ accepted: true, manuscriptId: id });
}

async function processOneChapter(id: string): Promise<void> {
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

  if (chapterError) {
    console.error(`${TAG} could not select next chapter for ${id}:`, chapterError.message);
    return;
  }

  if (!chapter) {
    // Nothing selectable. That is either genuinely finished, or everything
    // left has exhausted its retries — worth distinguishing, because the
    // second case means chapters are missing from the book.
    const { count: stuck } = await supabaseAdmin
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("manuscript_id", id)
      .is("summary", null)
      .is("extraction_error", null)
      .gte("extraction_attempts", MAX_ATTEMPTS);

    if (stuck && stuck > 0) {
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
    return;
  }

  // Recorded before any slow work, so an invocation that dies partway through
  // still leaves proof it happened.
  const attempt = (chapter.extraction_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("chapters")
    .update({ extraction_attempts: attempt })
    .eq("id", chapter.id);

  const startedAt = Date.now();
  console.log(
    `${TAG} chapter ${chapter.order_index} of ${id}, attempt ${attempt}/${MAX_ATTEMPTS}, ${chapter.raw_text?.length ?? 0} chars`
  );

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
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    // Elapsed is logged on every chapter so the margin against the function
    // limit is visible before chapters start failing rather than after.
    console.log(
      `${TAG} chapter ${chapter.order_index} done in ${elapsed}s — ${result.dialogueSpans.length} spans (${matched} matched), ${characterMap.size} characters known`
    );

    await queueNextChapter(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(`${TAG} chapter ${chapter.order_index} failed after ${elapsed}s:`, msg);

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
    //
    // manuscripts.status is deliberately not flipped to "failed": unlike a
    // parse failure, where zero chapters exist and the reader has nothing to
    // show, this is scoped to one chapter. Phase 4 gates the reader on
    // status !== "ready", so failing the manuscript would hide every
    // already-extracted chapter over one transient error.
    await queueNextChapter(id);
  }
}
