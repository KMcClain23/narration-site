import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest } from "@/lib/require-admin";

// Payouts attached to a payment: a co-narrator's half, an editor's fee, a
// proofer. Kept as its own endpoint rather than nested writes on /api/payments
// so editing one payout doesn't require resubmitting the whole payment.

const SELECT_COLS = "id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, paid_via, notes";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function amountOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  const paymentId = new URL(req.url).searchParams.get("paymentId");
  let query = supabaseAdmin.from("payment_payouts").select(SELECT_COLS);
  if (paymentId) query = query.eq("payment_id", paymentId);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payouts: data ?? [] });
}


export async function POST(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  try {
    const body = await req.json();
    if (!body.payment_id) {
      return NextResponse.json({ error: "payment_id required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("payment_payouts")
      .insert({
        payment_id: body.payment_id,
        payee_name: String(body.payee_name ?? "").trim(),
        kind: body.kind || "co_narrator",
        amount: amountOrNull(body.amount) ?? 0,
        rate_pfh: amountOrNull(body.rate_pfh),
        paid_on: body.paid_on || null,
        paid_via: String(body.paid_via ?? "").trim(),
        notes: String(body.notes ?? "").trim(),
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === "23503" || error.code === "23514" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ payout: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required." }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("payee_name" in body) patch.payee_name = String(body.payee_name ?? "").trim();
    if ("kind" in body) patch.kind = body.kind || "co_narrator";
    if ("amount" in body) patch.amount = amountOrNull(body.amount) ?? 0;
    if ("rate_pfh" in body) patch.rate_pfh = amountOrNull(body.rate_pfh);
    if ("paid_on" in body) patch.paid_on = body.paid_on || null;
    if ("paid_via" in body) patch.paid_via = String(body.paid_via ?? "").trim();
    if ("notes" in body) patch.notes = String(body.notes ?? "").trim();

    const { data, error } = await supabaseAdmin
      .from("payment_payouts")
      .update(patch)
      .eq("id", body.id)
      .select(SELECT_COLS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ payout: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { error } = await supabaseAdmin.from("payment_payouts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
