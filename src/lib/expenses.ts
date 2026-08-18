/**
 * Business expenses, and the two names every one of them has.
 *
 * A narrator buys "a new mic"; the IRS calls it supplies. Storing only the
 * first means translating twelve months of purchases at tax time, from memory.
 * Storing only the second means a page that reads like a tax form all year.
 * Both are kept, so the ledger speaks plainly and the report files correctly.
 */

export type ScheduleCLine =
  | "advertising"
  | "contract_labor"
  | "insurance"
  | "legal_professional"
  | "office"
  | "rent"
  | "repairs"
  | "supplies"
  | "travel"
  | "meals"
  | "utilities"
  | "other";

/** As the lines are named on Schedule C, so the report matches the form. */
export const SCHEDULE_C_LABEL: Record<ScheduleCLine, string> = {
  advertising: "Advertising",
  contract_labor: "Contract labor",
  insurance: "Insurance",
  legal_professional: "Legal & professional services",
  office: "Office expense",
  rent: "Rent or lease",
  repairs: "Repairs & maintenance",
  supplies: "Supplies",
  travel: "Travel",
  meals: "Meals",
  utilities: "Utilities",
  other: "Other expenses",
};

/**
 * The everyday categories, each mapped to the line it files under.
 *
 * Ordered by how often a narrator reaches for them rather than alphabetically
 * or by form order — the list is read while typing an expense, not while
 * filling in a return.
 */
export const EXPENSE_LABELS: { label: string; scheduleC: ScheduleCLine; hint?: string }[] = [
  { label: "Editing & proofing", scheduleC: "contract_labor", hint: "Editors, proofers, QC" },
  { label: "Co-narrator", scheduleC: "contract_labor", hint: "Another narrator's share" },
  { label: "Studio gear", scheduleC: "supplies", hint: "Mics, interfaces, cables, treatment" },
  { label: "Software & subscriptions", scheduleC: "office", hint: "DAW, plugins, storage, AI tools" },
  { label: "Coaching & training", scheduleC: "legal_professional", hint: "Coaches, workshops, classes" },
  { label: "Auditions & casting", scheduleC: "office", hint: "ACX, Voice123, casting sites" },
  { label: "Marketing & website", scheduleC: "advertising", hint: "Ads, hosting, domains, promo" },
  { label: "Accounting & legal", scheduleC: "legal_professional", hint: "Bookkeeper, accountant, contracts" },
  { label: "Insurance", scheduleC: "insurance", hint: "Business or equipment cover" },
  { label: "Studio rent", scheduleC: "rent", hint: "Booth or space rental" },
  { label: "Repairs", scheduleC: "repairs", hint: "Gear servicing and fixes" },
  { label: "Travel", scheduleC: "travel", hint: "Conferences, sessions away" },
  { label: "Meals", scheduleC: "meals", hint: "Business meals, usually 50% deductible" },
  { label: "Phone & internet", scheduleC: "utilities", hint: "The business share of the bill" },
  { label: "Bank & processing fees", scheduleC: "other", hint: "Stripe, PayPal, bank charges" },
  { label: "Other", scheduleC: "other" },
];

/** The line an everyday label files under; "other" when it isn't a known one. */
export function scheduleCFor(label: string): ScheduleCLine {
  const found = EXPENSE_LABELS.find(e => e.label.toLowerCase() === label.trim().toLowerCase());
  return found?.scheduleC ?? "other";
}

export type ExpenseRow = {
  id: string;
  incurred_on: string;
  vendor: string;
  description: string;
  amount: number;
  label: string;
  schedule_c: ScheduleCLine;
  method: string;
  notes: string;
  source: string;
  email_id: string;
  receipt_url: string;
};

export function expenseYear(row: { incurred_on: string }): number {
  return Number(row.incurred_on.slice(0, 4));
}

/** Totals per Schedule C line, in form order, skipping lines with nothing on them. */
export function byScheduleC(rows: ExpenseRow[]): { line: ScheduleCLine; total: number }[] {
  const totals = new Map<ScheduleCLine, number>();
  for (const r of rows) {
    const line = (r.schedule_c || "other") as ScheduleCLine;
    totals.set(line, (totals.get(line) ?? 0) + (Number(r.amount) || 0));
  }
  return (Object.keys(SCHEDULE_C_LABEL) as ScheduleCLine[])
    .filter(line => (totals.get(line) ?? 0) > 0.005)
    .map(line => ({ line, total: totals.get(line) ?? 0 }));
}

/** Totals per everyday label, largest first — the view for deciding what to cut. */
export function byLabel(rows: ExpenseRow[]): { label: string; total: number; count: number }[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const key = r.label || "Uncategorised";
    const at = totals.get(key) ?? { total: 0, count: 0 };
    at.total += Number(r.amount) || 0;
    at.count += 1;
    totals.set(key, at);
  }
  return [...totals.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.total - a.total);
}
