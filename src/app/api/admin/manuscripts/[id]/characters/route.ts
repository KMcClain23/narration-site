import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Add a character by hand.
 *
 * Characters have only ever arrived from extraction, which is fine until a
 * book is marked up on the page instead: nothing is parsed, so there is no
 * cast, and without a cast there is nobody to assign dialogue to. That made
 * the page view unusable for exactly the books it exists for.
 */

/** Distinct at a glance and distinguishable for the common color blindnesses. */
const PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#469990", "#9a6324",
  "#800000", "#000075", "#ffe119", "#a9a9a9", "#fabed4",
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("characters")
    .select("id, name, color_hex")
    .eq("manuscript_id", id);

  // Names are what dialogue is attributed to, so two Hades would be a coin
  // flip every time one of them was picked.
  if ((existing ?? []).some(c => c.name.trim().toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: `${name} is already in the cast.` }, { status: 409 });
  }

  // Next unused color before repeating any, so a small cast never doubles up.
  const taken = new Set((existing ?? []).map(c => c.color_hex));
  const color =
    String(body?.color_hex ?? "").trim() ||
    PALETTE.find(c => !taken.has(c)) ||
    PALETTE[(existing?.length ?? 0) % PALETTE.length];

  const { data, error } = await supabaseAdmin
    .from("characters")
    .insert({ manuscript_id: id, name, color_hex: color })
    .select("id, name, color_hex, voice_sample_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}
