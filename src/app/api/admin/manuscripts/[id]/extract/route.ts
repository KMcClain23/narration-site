import { NextResponse } from "next/server";
import { EXTRACT_TAG, runExtractionBudget } from "@/lib/extraction-runner";
import { isAdminOrInternal } from "@/lib/require-admin";

export const maxDuration = 60;

/** Same headroom as the cron run — see the note there. */
const RUN_BUDGET_MS = 50_000;

/**
 * Manual extraction trigger for one manuscript.
 *
 * Kept alongside the cron job for prepping a book on demand rather than
 * waiting for the schedule to work through it. It no longer queues the next
 * chapter itself: chaining is the cron's job now, and this route trying to do
 * it as well is what produced three separate stalls, each with a different
 * cause and the same symptom.
 *
 * Unlike the cron it reports what it did in the response, because it is called
 * by a person who wants to know.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Called by /process and by its own resumable chain, neither of which has a
  // cookie to send.
  if (!(await isAdminOrInternal(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const result = await runExtractionBudget(id, RUN_BUDGET_MS);
    console.log(
      `${EXTRACT_TAG} manual run for ${id}: ${result.processed} processed, ` +
        `${result.failed} failed${result.complete ? ", manuscript complete" : ""}`
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`${EXTRACT_TAG} manual run for ${id} failed:`, message);

    // manuscripts.status is deliberately not flipped to "failed": unlike a
    // parse failure, where zero chapters exist and the reader has nothing to
    // show, an extraction problem is scoped to individual chapters. The reader
    // is gated on status !== "ready", so failing the manuscript would hide
    // every already-extracted chapter over one transient error.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
