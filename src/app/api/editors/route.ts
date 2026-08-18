import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// Editors and proofers. Unlike authors and co-narrators there is no public
// half to this: nothing on the marketing site lists who edits the books, and
// the columns here are contact details and payment handles. So every method
// is admin-only, GET included.

const COLS = "id, name, email, venmo, paypal, role, notes, created_at";

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("editors")
    .select(COLS)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ editors: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("editors")
      .insert({
        name,
        email: clean(body.email),
        venmo: clean(body.venmo),
        paypal: clean(body.paypal),
        role: body.role || "editor",
        notes: clean(body.notes),
      })
      .select(COLS)
      .single();

    if (error) {
      // The unique index is on lower(name) because the name is what joins this
      // row to its payout history — two spellings would split one person.
      if (error.code === "23505") {
        return NextResponse.json({ error: `${name} is already listed.` }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ editor: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required." }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["name", "email", "venmo", "paypal", "notes"]) {
      if (key in body) patch[key] = clean(body[key]);
    }
    if ("role" in body) patch.role = body.role || "editor";
    if (patch.name === "") return NextResponse.json({ error: "Name is required." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("editors")
      .update(patch)
      .eq("id", body.id)
      .select(COLS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Another contact already has that name." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ editor: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // Payouts are untouched: they record what was paid, and deleting a contact
  // card is not the same as the money never having moved.
  const { error } = await supabaseAdmin.from("editors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
