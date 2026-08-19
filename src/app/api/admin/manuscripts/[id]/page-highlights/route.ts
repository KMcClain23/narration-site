import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// Dialogue marked directly on the rendered page, for books whose text layer
// cannot be trusted. Coordinates are fractions of the page, so a box drawn at
// one zoom lands in the same place at any other and on any screen.

const COLS = "id, manuscript_id, character_id, page, x, y, w, h, note";

/** Fractions only: anything outside the page is a bug, not a highlight. */
function fraction(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const page = new URL(req.url).searchParams.get("page");
  let query = supabaseAdmin.from("page_highlights").select(COLS).eq("manuscript_id", id);
  if (page) query = query.eq("page", Number(page));

  const { data, error } = await query.order("page", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ highlights: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const page = Number(body.page);
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "A page number is required." }, { status: 400 });
  }

  const x = fraction(body.x);
  const y = fraction(body.y);
  const w = fraction(body.w);
  const h = fraction(body.h);
  if (x === null || y === null || w === null || h === null) {
    return NextResponse.json({ error: "The highlight is off the page." }, { status: 400 });
  }
  // A box with no area is a stray click, not an intent to mark anything.
  if (w < 0.005 || h < 0.002) {
    return NextResponse.json({ error: "That highlight is too small to keep." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("page_highlights")
    .insert({
      manuscript_id: id,
      character_id: body.character_id || null,
      page,
      x,
      y,
      w,
      h,
      note: String(body.note ?? "").trim(),
    })
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ highlight: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.highlight_id) {
    return NextResponse.json({ error: "highlight_id required." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("character_id" in body) patch.character_id = body.character_id || null;
  if ("note" in body) patch.note = String(body.note ?? "").trim();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // Scoped to the manuscript in the URL, so an id from another book cannot be
  // reassigned by guessing it.
  const { data, error } = await supabaseAdmin
    .from("page_highlights")
    .update(patch)
    .eq("id", body.highlight_id)
    .eq("manuscript_id", id)
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ highlight: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const highlightId = new URL(req.url).searchParams.get("highlight_id");
  if (!highlightId) return NextResponse.json({ error: "highlight_id required." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("page_highlights")
    .delete()
    .eq("id", highlightId)
    .eq("manuscript_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
