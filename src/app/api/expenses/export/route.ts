import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { SCHEDULE_C_LABEL, type ExpenseRow } from "@/lib/expenses";
import { buildTaxYear } from "@/lib/tax-report";
import type { MoneyCard, PaymentRow } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * The year as CSV, in the three shapes a return actually needs.
 *
 * Not one file: income, expenses and contractor totals are three different
 * tables, and stacking them into a single sheet makes every one of them
 * useless to import. An accountant asked for "the expenses" wants a file whose
 * first row is a header and whose every other row is an expense.
 */

/** RFC 4180: quote anything containing a comma, quote or newline. */
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: unknown[][]): string {
  // A leading BOM so Excel opens UTF-8 as UTF-8 rather than mangling any
  // accented vendor name in the file.
  return "﻿" + [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function attachment(body: string, filename: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const part = req.nextUrl.searchParams.get("part") ?? "expenses";

  const [expensesRes, cardsRes, paymentsRes] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select("id, incurred_on, vendor, description, amount, label, schedule_c, method, notes, source, email_id, receipt_url")
      .gte("incurred_on", `${year}-01-01`)
      .lte("incurred_on", `${year}-12-31`)
      .order("incurred_on", { ascending: true }),
    supabaseAdmin
      .from("board_cards")
      .select("id, title, author, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, co_narrator, production_type, production_company, released_at, deadline")
      .is("archived_at", null),
    supabaseAdmin
      .from("payments")
      .select(
        "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, " +
          "amount_received, amount_gross, received_on, method, notes, sort_order, " +
          "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, notes)",
      ),
  ]);

  const expenses = (expensesRes.data ?? []) as unknown as ExpenseRow[];
  const cards = (cardsRes.data ?? []) as MoneyCard[];
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];

  const rowsByCard = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!rowsByCard.has(p.card_id)) rowsByCard.set(p.card_id, []);
    rowsByCard.get(p.card_id)!.push(p);
  }
  const titleOf = new Map(cards.map(c => [c.id, c.title]));

  if (part === "expenses") {
    return attachment(
      csv(
        ["Date", "Vendor", "Description", "Amount", "Category", "Schedule C line", "Paid with", "Source", "Notes"],
        expenses.map(e => [
          e.incurred_on,
          e.vendor,
          e.description,
          Number(e.amount).toFixed(2),
          e.label,
          SCHEDULE_C_LABEL[e.schedule_c] ?? e.schedule_c,
          e.method,
          e.source,
          e.notes,
        ]),
      ),
      `expenses-${year}.csv`,
    );
  }

  if (part === "income") {
    // Cash basis: a row appears in the year the money arrived, which is why
    // received_on drives this and the invoice date does not appear at all.
    const rows = payments
      .filter(p => p.received_on?.startsWith(String(year)) && Number(p.amount_received) > 0)
      .sort((a, b) => (a.received_on ?? "").localeCompare(b.received_on ?? ""))
      .map(p => [
        p.received_on,
        titleOf.get(p.card_id) ?? "",
        p.kind === "royalty" ? `Royalties ${p.period}`.trim() : p.label || "Narration fee",
        Number(p.amount_received).toFixed(2),
        p.method,
        p.invoice_number,
        // What the client actually sent, where that differs from what was kept.
        (p.payouts ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0) > 0
          ? (Number(p.amount_received) + (p.payouts ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0)).toFixed(2)
          : "",
      ]);

    return attachment(
      csv(
        ["Date received", "Project", "What for", "Your earnings", "Method", "Invoice #", "Gross collected"],
        rows,
      ),
      `income-${year}.csv`,
    );
  }

  if (part === "contractors") {
    const summary = buildTaxYear(year, cards, rowsByCard, expenses);
    return attachment(
      csv(
        ["Payee", "Paid this year", "1099-NEC likely due"],
        summary.passedOnByPayee.map(p => [p.name, p.total.toFixed(2), p.needs1099 ? "Yes" : "No"]),
      ),
      `contractors-${year}.csv`,
    );
  }

  if (part === "summary") {
    const s = buildTaxYear(year, cards, rowsByCard, expenses);
    const rows: unknown[][] = [
      ["Gross receipts", s.grossReceipts.toFixed(2)],
      ["  Narration fees", s.ownEarnings.toFixed(2)],
      ["  Royalties", s.royalties.toFixed(2)],
      ["  Collected for others", s.passedOn.toFixed(2)],
      ["", ""],
      ["Paid to editors and co-narrators", s.passedOn.toFixed(2)],
      ["Other expenses", s.expenses.toFixed(2)],
      ...s.expensesByLine.map(l => [`  ${SCHEDULE_C_LABEL[l.line]}`, l.total.toFixed(2)]),
      ["", ""],
      ["Taxable", s.net.toFixed(2)],
    ];
    return attachment(csv([`${year} summary`, "Amount"], rows), `tax-summary-${year}.csv`);
  }

  return NextResponse.json({ error: "Unknown export." }, { status: 400 });
}
