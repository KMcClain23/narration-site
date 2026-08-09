import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

async function findOwnedSpan(manuscriptId: string, spanId: string) {
  const { data } = await supabaseAdmin
    .from("dialogue_spans")
    .select("id, chapter_id, chapters!inner(manuscript_id)")
    .eq("id", spanId)
    .eq("chapters.manuscript_id", manuscriptId)
    .single();
  return data;
}

// PATCH: reassign an existing span to a different character — the reader's
// "highlight is the wrong character" correction.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; spanId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, spanId } = await params;
  const { character_id } = await req.json().catch(() => ({}));

  if (!character_id || typeof character_id !== "string") {
    return NextResponse.json({ error: "Missing character_id" }, { status: 400 });
  }

  const span = await findOwnedSpan(id, spanId);
  if (!span) return NextResponse.json({ error: "Span not found for this manuscript" }, { status: 404 });

  const { data: character } = await supabaseAdmin
    .from("characters")
    .select("id")
    .eq("id", character_id)
    .eq("manuscript_id", id)
    .single();
  if (!character) return NextResponse.json({ error: "Character not found for this manuscript" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("dialogue_spans")
    .update({ character_id, matched: true })
    .eq("id", spanId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE: remove a wrong highlight entirely — the reader's "this shouldn't
// be tagged at all" correction.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; spanId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, spanId } = await params;

  const span = await findOwnedSpan(id, spanId);
  if (!span) return NextResponse.json({ error: "Span not found for this manuscript" }, { status: 404 });

  const { error } = await supabaseAdmin.from("dialogue_spans").delete().eq("id", spanId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
