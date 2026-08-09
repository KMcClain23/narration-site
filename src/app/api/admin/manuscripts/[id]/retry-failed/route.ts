import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { EXTRACT_TAG } from "@/lib/extraction-runner";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Clear the recorded failures on a manuscript's chapters so extraction picks
 * them up again.
 *
 * Deleting and re-uploading the book would also work, and is what someone
 * reaches for when there is no other option — but it throws away every
 * successfully extracted chapter, re-runs the parse, and spends the API cost
 * of the whole book again to recover a handful of sections. Only the failed
 * chapters need anything done to them.
 *
 * The attempt counter is reset alongside the error, because a chapter that
 * failed for a reason since fixed — an exhausted credit balance, most
 * obviously — deserves its full retry budget rather than the remainder of the
 * one it spent on a problem that was never about the chapter.
 *
 * Nothing is scheduled here. The cron finds the newly eligible chapters within
 * a minute on its own.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("chapters")
    .update({ extraction_error: null, extraction_attempts: 0 })
    .eq("manuscript_id", id)
    .not("extraction_error", "is", null)
    .select("id");

  if (error) {
    console.error(`${EXTRACT_TAG} retry-failed for ${id}:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reset = data?.length ?? 0;
  console.log(`${EXTRACT_TAG} retry-failed for ${id}: ${reset} chapter(s) queued again`);
  return NextResponse.json({ reset });
}
