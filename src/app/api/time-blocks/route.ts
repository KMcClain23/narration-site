import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// Booth time that is not narrating a manuscript: pickups, retakes, auditions,
// or a day that is simply gone. Admin-only throughout — this is a diary.

const COLS = "id, on_date, hours, label, card_id";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const from = new URL(req.url).searchParams.get("from");
  let query = supabaseAdmin.from("time_blocks").select(COLS);
  if (from) query = query.gte("on_date", from);

  const { data, error } = await query.order("on_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    const on_date = String(body.on_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on_date)) {
      return NextResponse.json({ error: "A date is required." }, { status: 400 });
    }
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "Hours must be more than zero." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("time_blocks")
      .insert({
        on_date,
        hours,
        label: String(body.label ?? "").trim() || "Pickups",
        card_id: body.card_id || null,
      })
      .select(COLS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ block: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { error } = await supabaseAdmin.from("time_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
