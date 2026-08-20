import { NextResponse } from "next/server";
import { internalAuthHeaders } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  EXTRACT_TAG,
  findManuscriptWithPendingWork,
  runExtractionBudget,
} from "@/lib/extraction-runner";

export const maxDuration = 60;

/**
 * How long a manuscript may sit at "processing" before the parse is re-fired.
 *
 * Long enough that a parse genuinely in flight is never restarted — the parse
 * route abandons itself at 50s and always writes a status — and short enough
 * that a lost trigger costs a minute rather than the rest of the day.
 */
const STUCK_PARSE_MS = 3 * 60_000;

/**
 * Re-fire the parse for any manuscript whose trigger never arrived.
 *
 * Uploading creates the row and then asks the parse route to do the work. That
 * hand-off is a network call between two invocations, and a network call can be
 * lost: when it is, the row sits at "processing" with no chapters, no error, and
 * nothing in the log, indistinguishable from a parse still running. The upload
 * side now holds its invocation open to make the call reliably, but "reliably"
 * is not "always", and the failure is invisible precisely when it matters.
 *
 * Re-firing is safe because the source file is kept until the manuscript is
 * deleted, and because a parse writes its chapters in one insert at the end —
 * so a duplicate that loses the race adds nothing, and one that wins finds the
 * work already done.
 */
async function retriggerStuckParses(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_PARSE_MS).toISOString();

  const { data: stalled, error } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, created_at")
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .limit(3);

  if (error) {
    console.error(`${EXTRACT_TAG} stuck-parse sweep failed:`, error.message);
    return 0;
  }
  if (!stalled?.length) return 0;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
  let fired = 0;

  for (const m of stalled) {
    // A row can be "processing" with chapters already written only in the
    // moments before the status flips, so this checks rather than assumes.
    const { count } = await supabaseAdmin
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("manuscript_id", m.id);
    if (count && count > 0) continue;

    console.warn(
      `${EXTRACT_TAG} "${m.title}" has been processing since ${m.created_at} with no chapters — re-firing the parse`
    );
    try {
      // Deliberately not awaited to completion: the parse is its own invocation
      // with its own deadline and always records a status, so this run does not
      // need to survive to see the outcome.
      await fetch(`${baseUrl}/api/admin/manuscripts/${m.id}/process`, {
        method: "POST",
        // The sweep exists to rescue stuck manuscripts, and was itself being
        // turned away at the door: every rescue attempt since the parse route
        // started requiring a cookie has been a 401 nobody read.
        headers: internalAuthHeaders(),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
      fired++;
    } catch {
      // The next sweep tries again.
    }
  }

  return fired;
}

/**
 * Stop before the function limit rather than at it. A chapter cut off mid-call
 * still consumed an attempt from its retry budget and produced nothing, so
 * leaving headroom is cheaper than reclaiming a lost run.
 */
const RUN_BUDGET_MS = 50_000;

/**
 * Scheduled extraction. Vercel invokes this once a minute (see vercel.json).
 *
 * This replaces a chain in which each chapter's function invoked the route
 * again for the next one. That self-invocation failed three separate ways —
 * a floating promise dropped at teardown, a nested call stack that collapsed
 * when the outermost invocation timed out, and an `after()` registered from
 * inside another `after()` that silently registered nothing. Every fix was
 * correct about the fault it addressed and the chain still stopped at the same
 * place, because the shape was wrong: a function that has already failed
 * cannot be relied on to schedule its own successor.
 *
 * A scheduled job has no such dependency. If a run dies for any reason the
 * next minute picks up exactly where it left off, because "the next chapter to
 * do" is derived from the chapters table every time rather than carried
 * between calls. It also survives deploys, and it does not care whether anyone
 * has the Prepper page open.
 */
export async function GET(req: Request) {
  // Vercel signs cron requests with CRON_SECRET when it is configured. The
  // check is skipped when it is unset so the job still runs before anyone has
  // set one, but it warns, because unauthenticated this endpoint lets a
  // stranger spend Claude tokens.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn(`${EXTRACT_TAG} CRON_SECRET is not set — the extraction cron endpoint is unauthenticated`);
  }

  try {
    // Before extraction, because a manuscript with no chapters has no
    // extraction work to find and would otherwise never be looked at again.
    const reFired = await retriggerStuckParses();

    const manuscriptId = await findManuscriptWithPendingWork();
    if (!manuscriptId) {
      return NextResponse.json({ idle: true, reFired });
    }

    const result = await runExtractionBudget(manuscriptId, RUN_BUDGET_MS);
    console.log(
      `${EXTRACT_TAG} cron run for ${manuscriptId}: ${result.processed} processed, ` +
        `${result.failed} failed${result.complete ? ", manuscript complete" : ""}`
    );

    return NextResponse.json({ manuscriptId, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`${EXTRACT_TAG} cron run failed:`, message);
    // 500 so a persistently broken run is visible in Vercel's cron history
    // rather than reported as a series of successful no-ops.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
