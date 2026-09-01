import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { countNumberedChapters } from "@/lib/unnumbered-sections";

import { requireAdmin } from "@/lib/require-admin";

// GET: poll status — the manuscripts.status column plus a chapter count,
// same role as the retired board-pdf-status/route.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, error_message, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });

  // Titles are needed to tell numbered chapters from front/back matter, so
  // this reads the rows rather than issuing three separate count queries —
  // fewer round trips, and the counts can't disagree with one another. Ordered
  // because front matter is identified partly by position (see
  // computeChapterNumbers), which an arbitrary row order would scramble.
  const { data: chapterRows } = await supabaseAdmin
    .from("chapters")
    .select("title, summary, extraction_error")
    .eq("manuscript_id", id)
    .order("order_index", { ascending: true });

  const rows = chapterRows ?? [];
  const count = countNumberedChapters(rows.map((c) => c.title));
  const sectionCount = rows.length - count;

  // A non-null summary is extraction's own resumability signal (see
  // extraction-runner.ts) — reused here so callers can tell "chapters parsed"
  // apart from "dialogue extraction finished too" instead of both reading as
  // one flat "ready". Failed chapters are skipped so extraction can finish,
  // which means a book reaches "ready" with gaps in it; the poller carries
  // that count or the UI shows a clean finish over missing dialogue.
  const extractedCount = rows.filter((c) => c.summary !== null).length;
  const failedCount = rows.filter((c) => c.extraction_error !== null).length;

  return NextResponse.json({
    ...data,
    chapterCount: count,
    sectionCount,
    chaptersExtracted: extractedCount,
    chaptersFailed: failedCount,
  });
}

// DELETE: chapters/characters/dialogue_spans cascade from manuscripts (same
// as verified during Phase 3 testing — deleting a manuscript row alone left
// zero orphaned chapters). R2 storage doesn't cascade with the DB, though —
// each character's voice-sample object has to be cleaned up explicitly first.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const [{ data: characters }, { data: manuscript }] = await Promise.all([
    supabaseAdmin.from("characters").select("voice_sample_key").eq("manuscript_id", id),
    supabaseAdmin.from("manuscripts").select("source_r2_key").eq("id", id).single(),
  ]);

  /*
    THE SCRIPT IN OneDrive IS NOT DELETED, and that is a change.

    While manuscripts lived in R2 they were app-managed uploads, so deleting the
    row had to take the object with it or a failed parse left a file in the
    bucket for ever. Scripts/ is not that: it is a folder DEAN puts files in,
    beside Spliced/ and Pickups/, and the file there may be the only copy of a
    manuscript he was sent. Deleting a database row must not reach into his
    drive and remove it.

    So only R2 keys are cleaned up here — the legacy source, and the character
    voice samples, which are still app-managed uploads.
  */
  const keys = [
    ...(characters ?? []).map((c) => c.voice_sample_key),
    manuscript?.source_r2_key,
  ].filter((k): k is string => !!k);

  await Promise.all(
    keys.map((Key) =>
      r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKETS.media.name, Key })).catch(() => {})
    )
  );

  const { error } = await supabaseAdmin.from("manuscripts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
