import { AdminLayout } from "@/components/admin/AdminLayout";
import { assertAdmin } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildTaxYear } from "@/lib/tax-report";
import type { ExpenseRow } from "@/lib/expenses";
import type { MoneyCard, PaymentRow } from "@/lib/payments";
import { ExpensesClient } from "@/components/expenses/ExpensesClient";

export const dynamic = "force-dynamic";

/**
 * Expenses and the year's tax picture on one page.
 *
 * Kept together because they are the same question asked twice: what went out,
 * and what that leaves. Splitting them would mean entering a receipt in one
 * place and discovering its effect in another.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await assertAdmin();

  const params = await searchParams;
  const year = /^\d{4}$/.test(params.year ?? "") ? Number(params.year) : new Date().getFullYear();

  const [expensesRes, cardsRes, paymentsRes] = await Promise.all([
    supabaseAdmin
      .from("expenses")
      .select(
        "id, incurred_on, vendor, description, amount, label, schedule_c, method, notes, source, email_id, receipt_url",
      )
      .order("incurred_on", { ascending: false }),
    supabaseAdmin
      .from("board_cards")
      .select(
        "id, title, author, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, co_narrator, production_type, production_company, released_at, deadline",
      )
      .is("archived_at", null),
    supabaseAdmin
      .from("payments")
      .select(
        "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, " +
          "amount_received, amount_gross, received_on, method, notes, sort_order, " +
          "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, paid_via, notes)",
      ),
  ]);

  // A missing table reads as no expenses rather than a broken page — the same
  // contract the API keeps, so the report works before the first receipt.
  const expenses = (expensesRes.data ?? []) as unknown as ExpenseRow[];
  const cards = (cardsRes.data ?? []) as MoneyCard[];
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];

  const rowsByCard = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!rowsByCard.has(p.card_id)) rowsByCard.set(p.card_id, []);
    rowsByCard.get(p.card_id)!.push(p);
  }

  const summary = buildTaxYear(year, cards, rowsByCard, expenses);

  // Every year that has anything in it, plus this one, so the picker never
  // offers an empty year or hides a real one.
  const years = [
    ...new Set([
      new Date().getFullYear(),
      ...expenses.map(e => Number(e.incurred_on.slice(0, 4))),
      ...payments.filter(p => p.received_on).map(p => Number(p.received_on!.slice(0, 4))),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => b - a);

  return (
    <AdminLayout>
      <ExpensesClient
        year={year}
        years={years}
        summary={summary}
        expenses={expenses.filter(e => Number(e.incurred_on.slice(0, 4)) === year)}
      />
    </AdminLayout>
  );
}
