import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET: poll status — the manuscripts.status column plus a chapter count,
// same role as the retired board-pdf-status/route.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, error_message, created_at")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Manuscript not found" }, { status: 404 });

  const { count } = await supabaseAdmin
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("manuscript_id", id);

  // summary IS NOT NULL is Phase 3's own resumability signal (see
  // extract/route.ts) — reused here so callers can tell "chapters parsed"
  // apart from "dialogue extraction finished too" instead of both reading
  // as one flat "ready".
  const { count: extractedCount } = await supabaseAdmin
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("manuscript_id", id)
    .not("summary", "is", null);

  return NextResponse.json({ ...data, chapterCount: count ?? 0, chaptersExtracted: extractedCount ?? 0 });
}

// DELETE: chapters/characters/dialogue_spans cascade from manuscripts (same
// as verified during Phase 3 testing — deleting a manuscript row alone left
// zero orphaned chapters). R2 storage doesn't cascade with the DB, though —
// each character's voice-sample object has to be cleaned up explicitly first.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: characters } = await supabaseAdmin
    .from("characters")
    .select("voice_sample_key")
    .eq("manuscript_id", id);

  await Promise.all(
    (characters ?? [])
      .filter((c): c is { voice_sample_key: string } => !!c.voice_sample_key)
      .map((c) =>
        r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: c.voice_sample_key })).catch(() => {})
      )
  );

  const { error } = await supabaseAdmin.from("manuscripts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
