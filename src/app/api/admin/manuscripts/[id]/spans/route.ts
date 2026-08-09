import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// POST: manual correction — the reader's "assign to character" flow (select
// text Claude missed, pick a character, create the span by hand). Always
// inserted matched:true since a human just confirmed both the text and the
// location; this is exactly what Phase 3's automatic matching couldn't do
// for these lines.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json();
  const { chapter_id, character_id, start_offset, end_offset, text } = body ?? {};

  if (!chapter_id || typeof chapter_id !== "string") {
    return NextResponse.json({ error: "Missing chapter_id" }, { status: 400 });
  }
  if (!character_id || typeof character_id !== "string") {
    return NextResponse.json({ error: "Missing character_id" }, { status: 400 });
  }
  if (typeof start_offset !== "number" || typeof end_offset !== "number" || end_offset <= start_offset) {
    return NextResponse.json({ error: "Invalid selection offsets" }, { status: 400 });
  }

  const { data: chapter } = await supabaseAdmin
    .from("chapters")
    .select("id")
    .eq("id", chapter_id)
    .eq("manuscript_id", id)
    .single();
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found for this manuscript" }, { status: 404 });
  }

  const { data: character } = await supabaseAdmin
    .from("characters")
    .select("id")
    .eq("id", character_id)
    .eq("manuscript_id", id)
    .single();
  if (!character) {
    return NextResponse.json({ error: "Character not found for this manuscript" }, { status: 404 });
  }

  // Reject overlap with any already-located span in this chapter — a manual
  // assignment shouldn't silently corrupt an existing correct match. Zero-
  // length rows (the "couldn't locate at all" placeholders) don't occupy
  // real text, so they're excluded rather than blocking legitimate selections
  // that happen to pass through that offset.
  const { data: existing } = await supabaseAdmin
    .from("dialogue_spans")
    .select("start_offset, end_offset")
    .eq("chapter_id", chapter_id);
  const overlaps = (existing ?? []).some(
    (s) => s.end_offset > s.start_offset && start_offset < s.end_offset && end_offset > s.start_offset
  );
  if (overlaps) {
    return NextResponse.json({ error: "That selection overlaps an existing dialogue span." }, { status: 409 });
  }

  const { data: created, error } = await supabaseAdmin
    .from("dialogue_spans")
    .insert({
      chapter_id,
      character_id,
      start_offset,
      end_offset,
      matched: true,
      extracted_text: typeof text === "string" && text ? text : null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: created.id });
}
