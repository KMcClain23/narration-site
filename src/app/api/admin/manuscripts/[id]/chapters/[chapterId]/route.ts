import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Fix a chapter's text or title by hand.
 *
 * A parse can succeed and still be wrong: page headers stitched into
 * sentences, a chapter that swallowed the next one, hyphenation broken across
 * lines. Retrying the extractor reproduces all of it, so the text itself has
 * to be editable.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, chapterId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { data: chapter } = await supabaseAdmin
    .from("chapters")
    .select("id, raw_text")
    .eq("id", chapterId)
    .eq("manuscript_id", id)
    .single();
  if (!chapter) return NextResponse.json({ error: "Chapter not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ("title" in body) patch.title = String(body.title ?? "").trim() || "Untitled";
  if ("pov_character" in body) patch.pov_character = String(body.pov_character ?? "").trim() || null;

  let clearedSpans = 0;
  if ("raw_text" in body) {
    const raw_text = String(body.raw_text ?? "").trim();
    if (!raw_text) return NextResponse.json({ error: "Chapter text cannot be empty." }, { status: 400 });
    patch.raw_text = raw_text;

    /**
     * Highlights are character offsets into the old text, so any edit moves
     * every one of them. Rather than leave marks pointing at the wrong words —
     * which looks like data and is not — this chapter's spans are removed and
     * the highlighting is redone. Said plainly in the UI before saving, since
     * it is real work being thrown away.
     */
    if (raw_text !== chapter.raw_text) {
      const { count } = await supabaseAdmin
        .from("dialogue_spans")
        .delete({ count: "exact" })
        .eq("chapter_id", chapterId);
      clearedSpans = count ?? 0;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("chapters")
    .update(patch)
    .eq("id", chapterId)
    .select("id, manuscript_id, order_index, title, raw_text, pov_character, summary")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chapter: data, clearedSpans });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, chapterId } = await params;

  // Scoped to the manuscript in the URL so an id from another book cannot be
  // deleted by guessing it.
  const { error } = await supabaseAdmin
    .from("chapters")
    .delete()
    .eq("id", chapterId)
    .eq("manuscript_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
