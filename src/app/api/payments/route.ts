import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest } from "@/lib/require-admin";
import { derivePaymentStatus, type PaymentRow } from "@/lib/payments";
import { closePaymentLinks, type LinkClosure, type PaymentLinkRow } from "@/lib/close-payment-links";

// CRUD for payment milestones. Every write goes through supabaseAdmin
// (service role) — payments has RLS on with a service-role-only policy and
// no public read, unlike authors/co_narrators which the public site reads.
//
// Route handlers are NOT covered by middleware.ts's matcher (it lists page
// routes only), so each handler checks the admin cookie itself. Without this
// the endpoint is reachable directly regardless of the page-level gate, and
// it serves rates, invoice amounts and client revenue.

/** Fresh 401 per call — a NextResponse body can only be consumed once. */
function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const SELECT_COLS =
  "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, amount_received, amount_gross, received_on, method, notes, sort_order, stripe_payment_link, stripe_payment_link_id, paypal_payment_link, paypal_invoice_id, payment_links_closed_at, created_at, updated_at, " +
  // Embedded so a payment always arrives with its payouts — every consumer
  // needs them to compute the waterfall, and a second round-trip per payment
  // would be pure overhead.
  "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, notes)";

/** Date columns reject "" — Supabase needs an explicit null for an empty date. */
function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Money fields distinguish "cleared to blank" from "not in this request".
 * `undefined` means the caller didn't touch the field; `null`/"" means the
 * caller cleared it, which must persist as NULL so cardExpected() falls back
 * to the PFH estimate again.
 */
function amountOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/payments           → all rows
// GET /api/payments?cardId=x  → rows for one project
export async function GET(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  const cardId = new URL(req.url).searchParams.get("cardId");

  let query = supabaseAdmin.from("payments").select(SELECT_COLS);
  if (cardId) query = query.eq("card_id", cardId);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  try {
    const body = await req.json();
    const { card_id, label = "", invoice_number = "", method = "", notes = "", sort_order = 0 } = body;

    if (!card_id) {
      return NextResponse.json({ error: "card_id required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert({
        card_id,
        kind: body.kind === "royalty" ? "royalty" : "fee",
        period: String(body.period ?? "").trim(),
        label: String(label).trim(),
        amount_expected: amountOrNull(body.amount_expected),
        due_on: dateOrNull(body.due_on),
        invoiced_on: dateOrNull(body.invoiced_on),
        invoice_number: String(invoice_number).trim(),
        amount_received: amountOrNull(body.amount_received) ?? 0,
        amount_gross: amountOrNull(body.amount_gross),
        received_on: dateOrNull(body.received_on),
        method: String(method).trim(),
        notes: String(notes).trim(),
        sort_order: Number(sort_order) || 0,
      })
      .select(SELECT_COLS)
      .single();

    // 23503 = FK violation: card_id pointed at a project that doesn't exist.
    // A 400 is the honest code here — the request was bad, not the server.
    if (error) {
      const status = error.code === "23503" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ payment: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

    // Only fields actually present in the request are written, so a partial
    // update never blanks a column the caller never mentioned.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ("kind" in body) patch.kind = body.kind === "royalty" ? "royalty" : "fee";
    if ("period" in body) patch.period = String(body.period ?? "").trim();
    if ("label" in body) patch.label = String(body.label ?? "").trim();
    if ("amount_expected" in body) patch.amount_expected = amountOrNull(body.amount_expected);
    if ("due_on" in body) patch.due_on = dateOrNull(body.due_on);
    if ("invoiced_on" in body) patch.invoiced_on = dateOrNull(body.invoiced_on);
    if ("invoice_number" in body) patch.invoice_number = String(body.invoice_number ?? "").trim();
    if ("amount_received" in body) patch.amount_received = amountOrNull(body.amount_received) ?? 0;
    if ("amount_gross" in body) patch.amount_gross = amountOrNull(body.amount_gross);
    if ("received_on" in body) patch.received_on = dateOrNull(body.received_on);
    if ("method" in body) patch.method = String(body.method ?? "").trim();
    if ("notes" in body) patch.notes = String(body.notes ?? "").trim();
    if ("sort_order" in body) patch.sort_order = Number(body.sort_order) || 0;

    const { data, error } = await supabaseAdmin
      .from("payments")
      .update(patch)
      .eq("id", id)
      .select(SELECT_COLS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Settling the invoice retires the ways it could still be paid. Any link
    // left live is one a client could pay a second time, months later, from an
    // email they never deleted — so this runs on the way through rather than
    // waiting to be remembered.
    //
    // Awaited, not fired and forgotten: a serverless invocation can be frozen
    // the moment the response is written, which would leave the links open and
    // nothing to show for the attempt.
    let links: LinkClosure | null = null;
    if (derivePaymentStatus(data as unknown as PaymentRow) === "paid") {
      links = await closePaymentLinks(data as unknown as PaymentLinkRow);
    }

    return NextResponse.json({ payment: data, ...(links ? { links } : {}) });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest())) return unauthorized();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // Close the links before the row goes, or they outlive the only record that
  // they exist — a live Stripe URL and an open PayPal invoice with nothing left
  // in the app pointing at them.
  const { data: doomed } = await supabaseAdmin
    .from("payments")
    .select("id, method, stripe_payment_link, stripe_payment_link_id, paypal_invoice_id, payment_links_closed_at")
    .eq("id", id)
    .single();

  if (doomed) await closePaymentLinks(doomed as unknown as PaymentLinkRow);

  const { error } = await supabaseAdmin.from("payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
