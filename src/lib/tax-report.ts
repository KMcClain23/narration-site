import { isOffTheTop, processorReported, type MoneyCard, type PaymentRow } from "@/lib/payments";
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

export type PayeeTotal = {
  name: string;
  total: number;
  /**
   * Of that total, what a payment network already reported on its own 1099-K.
   * Reporting it again on a 1099-NEC would double the payee's income on paper.
   */
  viaProcessor: number;
  /** Paid with no method recorded, so counted as yours until told otherwise. */
  unrecorded: number;
  /** total − viaProcessor: what a 1099-NEC from you would actually cover. */
  reportable: number;
  needs1099: boolean;
  /** The methods seen this year, so a mixed payee is visible rather than averaged. */
  methods: string[];
};

export type TaxYear = {
  year: number;

  /** Everything that landed, before paying anyone on. */
  grossReceipts: number;
  /** The narrator's own share of it, and royalties, which pass through nobody. */
  ownEarnings: number;
  royalties: number;

  /**
   * Paid onward this year: the deduction. Dated by when the payment was made,
   * which is not always the year the matching income arrived.
   */
  passedOn: number;
  /**
   * Collected on someone else's behalf inside this year's receipts. Part of
   * gross, usually equal to passedOn, but a different question — the money can
   * arrive in one year and be handed on in the next.
   */
  collectedForOthers: number;
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

type Tally = { total: number; viaProcessor: number; unrecorded: number; methods: Set<string> };

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
  let collectedForOthers = 0;
  const payees = new Map<string, Tally>();

  for (const card of cards) {
    for (const r of rowsByCard.get(card.id) ?? []) {
      // Income counts when the money arrived, not when the work was done or the
      // invoice raised. A cash-basis return asks what came in this year.
      if (inYear(r.received_on, year)) {
        const got = Number(r.amount_received) || 0;
        if (r.kind === "royalty") royalties += got;
        else ownEarnings += got;

        // Part of what landed, so part of gross receipts — even though it was
        // never the narrator's to keep.
        for (const p of r.payouts ?? []) {
          collectedForOthers += Number(p.amount) || 0;
        }
      }

      /**
       * Payouts are counted on their own date, not the invoice's.
       *
       * These two dates are independent and routinely fall in different years:
       * an editor paid in December on a book the author settles in January is
       * deductible now and earns income later. Reading payouts only on rows
       * already received made the deduction vanish until the client paid, which
       * is neither cash basis nor accrual — just wrong.
       */
      for (const p of r.payouts ?? []) {
        if (!inYear(p.paid_on, year)) continue;
        const amount = Number(p.amount) || 0;
        if (amount <= 0) continue;
        passedOn += amount;

        const name = p.payee_name?.trim() || (isOffTheTop(p.kind) ? "Editor" : "Contractor");
        const t = payees.get(name) ?? { total: 0, viaProcessor: 0, unrecorded: 0, methods: new Set<string>() };
        t.total += amount;

        // How it was sent decides who reports it. A network that settles the
        // payment files its own 1099-K, and the payer is told not to report the
        // same money again; Zelle, cheques and cash file nothing, so those stay
        // the payer's. An unrecorded method counts as the payer's too, which
        // errs toward being asked a question rather than quietly missing a form.
        const via = (p.paid_via ?? "").trim();
        if (!via) t.unrecorded += amount;
        else {
          t.methods.add(via);
          if (processorReported(via)) t.viaProcessor += amount;
        }

        payees.set(name, t);
      }
    }
  }

  const yearsExpenses = expenses.filter(e => inYear(e.incurred_on, year));
  const expenseTotal = yearsExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // What actually landed: the narrator's own share plus whatever arrived with
  // it for other people. Dated by receipt, so a payout made in a different
  // year can no longer inflate or deflate this one.
  const grossReceipts = ownEarnings + royalties + collectedForOthers;

  const passedOnByPayee: PayeeTotal[] = [...payees.entries()]
    .map(([name, t]) => {
      const reportable = t.total - t.viaProcessor;
      return {
        name,
        total: t.total,
        viaProcessor: t.viaProcessor,
        unrecorded: t.unrecorded,
        reportable,
        // The threshold applies to what you report, not to what you sent. Pay
        // an editor $900 entirely through PayPal goods and services and no
        // 1099-NEC is due from you, even though $900 left.
        needs1099: reportable >= NEC_THRESHOLD,
        methods: [...t.methods].sort(),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    year,
    grossReceipts,
    ownEarnings,
    royalties,
    passedOn,
    collectedForOthers,
    passedOnByPayee,
    expenses: expenseTotal,
    expensesByLine: byScheduleC(yearsExpenses),
    expensesByLabel: byLabel(yearsExpenses),
    net: grossReceipts - passedOn - expenseTotal,
    needs1099: passedOnByPayee.filter(p => p.needs1099),
  };
}
