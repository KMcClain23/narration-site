import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Add a chapter by hand.
 *
 * The automatic extraction wins most of the time, and when it does not there
 * was nothing to do but run it again and watch it fail the same way. A PDF
 * that is a scan, one with columns, one whose chapter headings are images:
 * all of them produce a manuscript that cannot be opened, let alone marked up.
 * Pasting the text is the floor under that.
 *
 * A manuscript that gains a chapter this way becomes readable, so a parse that
 * failed entirely stops being a dead end.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const raw_text = String(body.raw_text ?? "").trim();
  if (!raw_text) return NextResponse.json({ error: "Paste the chapter text first." }, { status: 400 });

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("id")
    .eq("id", id)
    .single();
  if (!manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });

  // Appended after whatever is already there. Extraction numbers from zero, so
  // a hand-added chapter joining a partial parse lands at the end rather than
  // colliding with an existing index.
  const { data: last } = await supabaseAdmin
    .from("chapters")
    .select("order_index")
    .eq("manuscript_id", id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("chapters")
    .insert({
      manuscript_id: id,
      order_index: typeof body.order_index === "number" ? body.order_index : (last?.order_index ?? -1) + 1,
      title: String(body.title ?? "").trim() || "Untitled",
      raw_text,
      pov_character: String(body.pov_character ?? "").trim() || null,
    })
    .select("id, manuscript_id, order_index, title, raw_text, pov_character, summary")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A manuscript with text in it is readable, whatever the extractor concluded
  // earlier. Leaving it "failed" would keep the reader shut on a book that now
  // has chapters.
  await supabaseAdmin.from("manuscripts").update({ status: "ready" }).eq("id", id);

  return NextResponse.json({ chapter: data });
}
