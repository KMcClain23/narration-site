import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest } from "@/lib/require-admin";

// Creates many payments in one call, for importing a processor export or a
// batch of statements after review.

type IncomingRow = {
  card_id?: string;
  kind?: string;
  period?: string;
  label?: string;
  amount_expected?: number | string | null;
  amount_received?: number | string | null;
  received_on?: string;
  due_on?: string;
  invoiced_on?: string;
  invoice_number?: string;
  method?: string;
  notes?: string;
};

function amountOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * What makes two rows "the same payment" for duplicate detection.
 *
 * Re-importing the same export is the expected accident — a narrator downloads
 * a fresh CSV each month and the overlap is silently doubled otherwise.
 * Same project, same amount, same date is close enough to be worth stopping on,
 * and the caller can override per row.
 */
function fingerprint(cardId: string, amount: number, date: string | null): string {
  return `${cardId}|${amount.toFixed(2)}|${date ?? ""}`;
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rows: IncomingRow[];
  let allowDuplicates = false;
  try {
    const body = await req.json();
    rows = Array.isArray(body.rows) ? body.rows : [];
    allowDuplicates = Boolean(body.allow_duplicates);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "Too many rows in one import (max 500)." }, { status: 400 });
  }
  if (rows.some(r => !r.card_id)) {
    return NextResponse.json({ error: "Every row needs a project." }, { status: 400 });
  }

  const cardIds = [...new Set(rows.map(r => r.card_id as string))];

  // Existing payments for the affected projects only — enough to spot a
  // re-import without scanning the whole table.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("payments")
    .select("card_id, amount_received, amount_expected, received_on, invoiced_on")
    .in("card_id", cardIds);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const seen = new Set(
    (existing ?? []).map(p =>
      fingerprint(
        p.card_id,
        Number(p.amount_received) || Number(p.amount_expected) || 0,
        p.received_on ?? p.invoiced_on ?? null,
      ),
    ),
  );

  const inserts: Record<string, unknown>[] = [];
  const skipped: { index: number; reason: string }[] = [];

  rows.forEach((r, i) => {
    const received = amountOrNull(r.amount_received) ?? 0;
    const expected = amountOrNull(r.amount_expected);
    const receivedOn = dateOrNull(r.received_on);
    const invoicedOn = dateOrNull(r.invoiced_on);

    const fp = fingerprint(r.card_id as string, received || expected || 0, receivedOn ?? invoicedOn);
    if (!allowDuplicates && seen.has(fp)) {
      skipped.push({ index: i, reason: "Looks like a payment already recorded" });
      return;
    }
    // Also guards duplicates *within* one import — a processor export can list
    // the same charge twice across overlapping date ranges.
    seen.add(fp);

    inserts.push({
      card_id: r.card_id,
      kind: r.kind === "royalty" ? "royalty" : "fee",
      period: String(r.period ?? "").trim(),
      label: String(r.label ?? "").trim(),
      amount_expected: expected,
      amount_received: received,
      received_on: receivedOn,
      due_on: dateOrNull(r.due_on),
      invoiced_on: invoicedOn,
      invoice_number: String(r.invoice_number ?? "").trim(),
      method: String(r.method ?? "").trim(),
      notes: String(r.notes ?? "").trim(),
    });
  });

  if (inserts.length === 0) {
    return NextResponse.json({ imported: 0, skipped });
  }

  const { data, error } = await supabaseAdmin.from("payments").insert(inserts).select("id");
  if (error) {
    const status = error.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ imported: data?.length ?? 0, skipped });
}
