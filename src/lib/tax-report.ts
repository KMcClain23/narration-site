import { isOffTheTop, type MoneyCard, type PaymentRow } from "@/lib/payments";
import { byLabel, byScheduleC, type ExpenseRow, type ScheduleCLine } from "@/lib/expenses";

/**
 * A year's figures, assembled from what the app already records.
 *
 * The number a narrator wants is what they keep. The number a return needs is
 * what arrived before anyone else was paid. Reporting only the first is how a
 * 1099 from a publisher ends up contradicting a return; reporting only the
 * second makes a year look twice as good as it was. Both are here, with the
 * subtraction between them shown rather than assumed.
 */

export type PayeeTotal = { name: string; total: number; needs1099: boolean };

export type TaxYear = {
  year: number;

  /** Everything that landed, before paying anyone on. */
  grossReceipts: number;
  /** The narrator's own share of it, and royalties, which pass through nobody. */
  ownEarnings: number;
  royalties: number;

  /** Money that arrived and left again: editors, proofers, co-narrators. */
  passedOn: number;
  passedOnByPayee: PayeeTotal[];

  /** Everything else spent, by both namings. */
  expenses: number;
  expensesByLine: { line: ScheduleCLine; total: number }[];
  expensesByLabel: { label: string; total: number; count: number }[];

  /** grossReceipts − passedOn − expenses. */
  net: number;

  /** Anyone paid $600 or more in the year, who will need a 1099-NEC. */
  needs1099: PayeeTotal[];
};

/** The IRS threshold for a 1099-NEC to a non-corporate payee. */
const NEC_THRESHOLD = 600;

function inYear(date: string | null, year: number): boolean {
  return Boolean(date) && Number(date!.slice(0, 4)) === year;
}

export function buildTaxYear(
  year: number,
  cards: MoneyCard[],
  rowsByCard: Map<string, PaymentRow[]>,
  expenses: ExpenseRow[],
): TaxYear {
  let ownEarnings = 0;
  let royalties = 0;
  let passedOn = 0;
  const payees = new Map<string, number>();

  for (const card of cards) {
    for (const r of rowsByCard.get(card.id) ?? []) {
      // Counted when the money arrived, not when the work was done or the
      // invoice raised. A cash-basis return asks what came in this year.
      if (!inYear(r.received_on, year)) continue;

      const got = Number(r.amount_received) || 0;
      if (r.kind === "royalty") royalties += got;
      else ownEarnings += got;

      // Only what has actually been paid out. An editor still owed at year end
      // is not a deduction this year on a cash basis, however certain the bill.
      for (const p of r.payouts ?? []) {
        if (!inYear(p.paid_on, year)) continue;
        const amount = Number(p.amount) || 0;
        if (amount <= 0) continue;
        passedOn += amount;
        const name = p.payee_name?.trim() || (isOffTheTop(p.kind) ? "Editor" : "Contractor");
        payees.set(name, (payees.get(name) ?? 0) + amount);
      }
    }
  }

  const yearsExpenses = expenses.filter(e => inYear(e.incurred_on, year));
  const expenseTotal = yearsExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // amount_received is the narrator's own share, so what actually landed is
  // that plus whatever was paid onward out of it.
  const grossReceipts = ownEarnings + royalties + passedOn;

  const passedOnByPayee: PayeeTotal[] = [...payees.entries()]
    .map(([name, total]) => ({ name, total, needs1099: total >= NEC_THRESHOLD }))
    .sort((a, b) => b.total - a.total);

  return {
    year,
    grossReceipts,
    ownEarnings,
    royalties,
    passedOn,
    passedOnByPayee,
    expenses: expenseTotal,
    expensesByLine: byScheduleC(yearsExpenses),
    expensesByLabel: byLabel(yearsExpenses),
    net: grossReceipts - passedOn - expenseTotal,
    needs1099: passedOnByPayee.filter(p => p.needs1099),
  };
}
