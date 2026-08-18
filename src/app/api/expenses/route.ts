import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest } from "@/lib/require-admin";
import { scheduleCFor } from "@/lib/expenses";

export const dynamic = "force-dynamic";

const COLS =
  "id, incurred_on, vendor, description, amount, label, schedule_c, method, notes, source, email_id, receipt_url";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** 42P01 is "relation does not exist" — the migration hasn't run yet. */
function tableMissing(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || Boolean(error?.message?.includes("expenses"));
}

function amountOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();

  const year = req.nextUrl.searchParams.get("year");
  let query = supabaseAdmin.from("expenses").select(COLS);

  if (year && /^\d{4}$/.test(year)) {
    query = query.gte("incurred_on", `${year}-01-01`).lte("incurred_on", `${year}-12-31`);
  }

  const { data, error } = await query.order("incurred_on", { ascending: false });

  if (error) {
    // An absent table reads as "no expenses yet" rather than breaking the page,
    // so the report is usable the moment the migration lands and harmless until.
    if (tableMissing(error)) return NextResponse.json({ expenses: [], unavailable: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();

  const body = await req.json().catch(() => null);
  const rows: Record<string, unknown>[] = Array.isArray(body?.expenses)
    ? body.expenses
    : body
      ? [body]
      : [];

  if (!rows.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const prepared = rows
    .filter(r => r.incurred_on)
    .map(r => {
      const label = String(r.label ?? "").trim();
      return {
        incurred_on: String(r.incurred_on),
        vendor: String(r.vendor ?? "").trim(),
        description: String(r.description ?? "").trim(),
        amount: amountOrZero(r.amount),
        label,
        // Derived rather than trusted from the caller: the label is the thing
        // chosen, and the line it files under follows from it. Two fields that
        // can disagree is one field too many.
        schedule_c: scheduleCFor(label),
        method: String(r.method ?? "").trim(),
        notes: String(r.notes ?? "").trim(),
        source: String(r.source ?? "manual"),
        email_id: String(r.email_id ?? "").trim(),
        receipt_url: String(r.receipt_url ?? "").trim(),
      };
    });

  if (!prepared.length) {
    return NextResponse.json({ error: "Every expense needs a date." }, { status: 400 });
  }

  /**
   * Skip receipts already imported, rather than letting the batch fail.
   *
   * Checked here rather than with ON CONFLICT because the unique index is
   * partial — it covers only rows that came from an email — and Postgres will
   * not infer a partial index unless the statement repeats its WHERE clause,
   * which PostgREST cannot express. The index still guards against a race; this
   * is what makes the ordinary case quiet.
   */
  const emailIds = prepared.map(r => r.email_id).filter(Boolean);
  let toInsert = prepared;

  if (emailIds.length) {
    const { data: seen } = await supabaseAdmin
      .from("expenses")
      .select("email_id")
      .in("email_id", emailIds);

    const already = new Set((seen ?? []).map(r => (r as { email_id: string }).email_id));
    toInsert = prepared.filter(r => !r.email_id || !already.has(r.email_id));
  }

  if (!toInsert.length) {
    return NextResponse.json({ saved: 0, expenses: [], skipped: prepared.length });
  }

  const { data, error } = await supabaseAdmin.from("expenses").insert(toInsert).select(COLS);

  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json({ error: "The expenses table hasn't been created yet." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    saved: data?.length ?? 0,
    expenses: data ?? [],
    skipped: prepared.length - toInsert.length,
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("incurred_on" in body) patch.incurred_on = body.incurred_on;
  if ("vendor" in body) patch.vendor = String(body.vendor ?? "").trim();
  if ("description" in body) patch.description = String(body.description ?? "").trim();
  if ("amount" in body) patch.amount = amountOrZero(body.amount);
  if ("method" in body) patch.method = String(body.method ?? "").trim();
  if ("notes" in body) patch.notes = String(body.notes ?? "").trim();
  if ("label" in body) {
    patch.label = String(body.label ?? "").trim();
    patch.schedule_c = scheduleCFor(String(body.label ?? ""));
  }

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .update(patch)
    .eq("id", body.id)
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
