import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET: poll status — the manuscripts.status column plus a chapter count,
// same role as the retired board-pdf-status/route.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, created_at")
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
