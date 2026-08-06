import { NextResponse } from "next/server";
import {
  EXTRACT_TAG,
  findManuscriptWithPendingWork,
  runExtractionBudget,
} from "@/lib/extraction-runner";

export const maxDuration = 60;

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
    const manuscriptId = await findManuscriptWithPendingWork();
    if (!manuscriptId) {
      return NextResponse.json({ idle: true });
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
