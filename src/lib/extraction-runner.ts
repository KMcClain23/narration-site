import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractChapter } from "@/lib/dialogue-extractor";
import { nextCharacterColor } from "@/lib/character-colors";

export const EXTRACT_TAG = "[extract v4]";

/**
 * How many times a chapter may be picked up before it is given up on.
 *
 * Counted *before* the Claude call, not after: an invocation killed mid-flight
 * never reaches any error handling, so the only durable evidence it ran at all
 * is a write that happened first.
 */
export const MAX_ATTEMPTS = 3;

export type ChapterOutcome =
  | { status: "processed"; orderIndex: number; spans: number; matched: number; elapsedMs: number }
  | { status: "complete"; exhausted: number }
  | { status: "failed"; orderIndex: number; message: string; attempt: number }
  | { status: "blocked"; orderIndex: number; message: string };

/**
 * Whether a failure is about the account rather than the chapter.
 *
 * An exhausted credit balance or a bad API key fails every chapter equally and
 * identically, and no amount of retrying changes that. Treating it as an
 * ordinary chapter failure burned all three attempts on each remaining
 * chapter and then marked them permanently failed — chapters that would have
 * succeeded untouched the moment the account was topped up, now needing manual
 * repair to be picked up again.
 */
function isAccountLevelError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("credit balance is too low") ||
    m.includes("authentication_error") ||
    m.includes("invalid x-api-key") ||
    m.includes("permission_error") ||
    m.includes("billing")
  );
}

/**
 * Process the single lowest-numbered chapter of a manuscript that is still
 * awaiting extraction.
 *
 * Deliberately does no scheduling of its own. Earlier versions ended by
 * invoking the route again for the next chapter, and that self-invocation
 * failed three separate ways on a serverless runtime — a dropped floating
 * promise, a nested call stack that collapsed at the time limit, and an
 * `after()` registered from inside another `after()` that silently did
 * nothing. Each fix was right about its own fault and the chain still died in
 * the same place. Who calls this next is now somebody else's problem, which is
 * the point: a scheduled job cannot fail to be scheduled.
 */
export async function processNextChapter(manuscriptId: string): Promise<ChapterOutcome> {
  // "Still to do" is: no summary, no recorded failure, and not already over
  // its retry budget. Each condition exists because of a way this previously
  // stalled — a completed chapter being re-selected, a failed one retried
  // forever, and an invocation that died silently leaving a chapter that could
  // never be got past.
  const { data: chapter, error: selectError } = await supabaseAdmin
    .from("chapters")
    .select("id, order_index, raw_text, extraction_attempts")
    .eq("manuscript_id", manuscriptId)
    .is("summary", null)
    .is("extraction_error", null)
    .lt("extraction_attempts", MAX_ATTEMPTS)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);

  if (!chapter) {
    // Nothing selectable: either genuinely finished, or everything left has
    // exhausted its retries. The second case means chapters are missing from
    // the book, so it gets a visible reason rather than staying
    // indistinguishable from unprocessed work.
    const { count: stuck } = await supabaseAdmin
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("manuscript_id", manuscriptId)
      .is("summary", null)
      .is("extraction_error", null)
      .gte("extraction_attempts", MAX_ATTEMPTS);

    if (stuck && stuck > 0) {
      await supabaseAdmin
        .from("chapters")
        .update({
          extraction_error: `Gave up after ${MAX_ATTEMPTS} attempts — the extraction call did not complete.`,
        })
        .eq("manuscript_id", manuscriptId)
        .is("summary", null)
        .is("extraction_error", null)
        .gte("extraction_attempts", MAX_ATTEMPTS);
      console.warn(`${EXTRACT_TAG} ${stuck} chapter(s) of ${manuscriptId} exhausted their retry budget`);
    }

    return { status: "complete", exhausted: stuck ?? 0 };
  }

  // Written before any slow work, so an invocation that dies partway through
  // still leaves proof it happened.
  const attempt = (chapter.extraction_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("chapters")
    .update({ extraction_attempts: attempt })
    .eq("id", chapter.id);

  const startedAt = Date.now();
  console.log(
    `${EXTRACT_TAG} chapter ${chapter.order_index} of ${manuscriptId}, attempt ${attempt}/${MAX_ATTEMPTS}, ${chapter.raw_text?.length ?? 0} chars`
  );

  try {
    const { data: existingCharacters, error: charFetchError } = await supabaseAdmin
      .from("characters")
      .select("id, name")
      .eq("manuscript_id", manuscriptId);
    if (charFetchError) throw new Error(charFetchError.message);

    const characterMap = new Map<string, string>();
    (existingCharacters ?? []).forEach((c) => characterMap.set(c.name, c.id));
    let colorCount = characterMap.size;

    const result = chapter.raw_text?.trim()
      ? await extractChapter(chapter.raw_text, Array.from(characterMap.keys()))
      : { characters: [], summary: "(no extractable text)", dialogueSpans: [] };

    // Every name Claude surfaced — whether via "characters" or only as a
    // dialogue speaker — gets a roster row, matched or not: the correction UI
    // needs the character to already exist to reassign an unmatched span to it.
    const allNames = new Set<string>(result.characters);
    result.dialogueSpans.forEach((d) => allNames.add(d.speaker));

    for (const name of allNames) {
      if (!name || characterMap.has(name)) continue;
      const { data: created, error: createError } = await supabaseAdmin
        .from("characters")
        .insert({ manuscript_id: manuscriptId, name, color_hex: nextCharacterColor(colorCount) })
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
    const elapsedMs = Date.now() - startedAt;
    // Elapsed is logged on every chapter so the margin against the function
    // limit stays visible before chapters start failing rather than after.
    console.log(
      `${EXTRACT_TAG} chapter ${chapter.order_index} done in ${(elapsedMs / 1000).toFixed(1)}s — ` +
        `${result.dialogueSpans.length} spans (${matched} matched), ${characterMap.size} characters known`
    );

    return {
      status: "processed",
      orderIndex: chapter.order_index,
      spans: result.dialogueSpans.length,
      matched,
      elapsedMs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(
      `${EXTRACT_TAG} chapter ${chapter.order_index} failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s:`,
      message
    );

    if (isAccountLevelError(message)) {
      // Give the attempt back. Nothing about this chapter caused the failure
      // and nothing about it needs to change, so consuming its retry budget
      // would penalise it for the account's state. Left untouched — no error
      // recorded, no attempt spent — it is simply picked up again on a later
      // run, which means extraction resumes by itself once the account is
      // fixed rather than needing anything reset by hand.
      await supabaseAdmin
        .from("chapters")
        .update({ extraction_attempts: attempt - 1 })
        .eq("id", chapter.id);
      console.error(`${EXTRACT_TAG} account-level failure, stopping this run: ${message}`);
      return { status: "blocked", orderIndex: chapter.order_index, message };
    }

    // Only give up once the retry budget is spent. A truncated response or a
    // transient API error is worth another go; recording a permanent failure
    // on the first stumble would strand a chapter that would have succeeded.
    if (attempt >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("chapters")
        .update({ extraction_error: message.slice(0, 500) })
        .eq("id", chapter.id);
    }

    return { status: "failed", orderIndex: chapter.order_index, message, attempt };
  }
}

/**
 * The manuscript that should be worked on next, or null if there is nothing
 * outstanding.
 *
 * Oldest upload first. Several books can be queued at once and they are drained
 * one at a time, so the order decides which one finishes first — and it used to
 * be decided by sorting on the manuscript's UUID, which is effectively random.
 * A book uploaded second could take the whole queue ahead of one uploaded an
 * hour earlier, with no way to tell which would win beforehand.
 *
 * Two queries rather than a join: PostgREST orders an embedded resource within
 * each parent row, not the parent rows by an embedded column, so ordering
 * chapters by their manuscript's date is not expressible in one call.
 */
export async function findManuscriptWithPendingWork(): Promise<string | null> {
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("chapters")
    .select("manuscript_id")
    .is("summary", null)
    .is("extraction_error", null)
    .lt("extraction_attempts", MAX_ATTEMPTS);

  if (pendingError) throw new Error(pendingError.message);
  if (!pending?.length) return null;

  const pendingIds = Array.from(new Set(pending.map((c) => c.manuscript_id)));

  const { data: oldest, error: manuscriptError } = await supabaseAdmin
    .from("manuscripts")
    .select("id")
    .in("id", pendingIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (manuscriptError) throw new Error(manuscriptError.message);
  return oldest?.id ?? null;
}

/**
 * Process chapters back to back until there isn't room for another within the
 * time budget.
 *
 * A chapter takes roughly 35s and the function limit is 60s, so in practice
 * this does one per run — the loop exists so that raising maxDuration is the
 * only change needed to do several, rather than a restructure. Stopping while
 * there is still headroom is deliberate: a chapter cut off at the limit costs
 * an attempt from its retry budget and leaves nothing behind.
 */
export async function runExtractionBudget(
  manuscriptId: string,
  budgetMs: number,
  firstChapterEstimateMs = 40_000
): Promise<{ processed: number; failed: number; complete: boolean; blocked?: string }> {
  const startedAt = Date.now();
  let processed = 0;
  let failed = 0;

  // Estimate how long the next chapter will take, so a chapter is never begun
  // that probably cannot finish. Starting one that gets cut off at the limit
  // costs an attempt from its retry budget and produces nothing.
  //
  // The first estimate has to be a guess, and it is deliberately pessimistic.
  // After that it uses what this book actually did: chapter length varies by
  // an order of magnitude between titles — a dialogue-heavy 15k-character
  // chapter takes ~35s while a short one takes ~7s — so a single fixed figure
  // either wastes most of the budget on quick books or overruns on slow ones.
  // Measured against the slowest chapter seen so far, with half again as
  // headroom, since the risk is asymmetric: stopping early costs a minute of
  // waiting, overrunning costs a retry.
  let estimateMs = firstChapterEstimateMs;

  while (Date.now() - startedAt + estimateMs < budgetMs) {
    const outcome = await processNextChapter(manuscriptId);
    if (outcome.status === "complete") return { processed, failed, complete: true };

    // Stop the whole run rather than marching through the remaining chapters
    // failing each one identically. Nothing later in this book will fare any
    // better while the account is in this state.
    if (outcome.status === "blocked") {
      return { processed, failed, complete: false, blocked: outcome.message };
    }

    if (outcome.status === "failed") {
      failed++;
    } else {
      processed++;
      estimateMs = Math.max(estimateMs === firstChapterEstimateMs ? 0 : estimateMs, outcome.elapsedMs * 1.5);
    }
  }

  return { processed, failed, complete: false };
}
