// Pure money helpers for the Payments page. No "use client" — the server
// component page imports these directly, same reason board-card-utils.ts
// stays outside a client module.
//
// The PFH math is NOT reimplemented here: estimatedEarnings() in
// board-card-utils.ts is the single source of truth for
// word_count -> finished hours -> narrator share, and this file only decides
// when to fall back to it.

import { estimatedEarnings, parseLocalDate } from "@/components/admin/board-card-utils";

export type PaymentRow = {
  id: string;
  card_id: string;
  label: string;
  amount_expected: number | null;
  due_on: string | null;
  invoiced_on: string | null;
  invoice_number: string;
  amount_received: number;
  received_on: string | null;
  method: string;
  notes: string;
  sort_order: number;
};

// The board_cards columns the money layer reads. A subset of BoardV2Card —
// declared separately because this also needs production_company/type and
// released_at, which the board itself has no use for.
export type MoneyCard = {
  id: string;
  title: string;
  author: string | null;
  status: string;
  word_count: number | null;
  pfh_rate: number | null;
  payment_type: string | null;
  narration_format: string | null;
  narrator_share_percent: number | null;
  production_type: string | null;
  production_company: string | null;
  released_at: string | null;
  deadline: string | null;
};

/**
 * Derived, never stored.
 *
 * A stored status column would be wrong the morning after a due date passes,
 * because nothing runs to update it until someone opens the app. Deriving it
 * on read means "overdue" is always true as of the moment you look.
 */
export type PaymentStatus = "paid" | "partial" | "overdue" | "invoiced" | "expected";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partially paid",
  overdue: "Overdue",
  invoiced: "Invoiced",
  expected: "Expected",
};

// Complete class strings, not runtime-assembled — Tailwind's static scanner
// only sees literals (same reason URGENCY_PILL is written out longhand).
export const PAYMENT_STATUS_PILL: Record<PaymentStatus, string> = {
  paid: "text-capacity-light bg-capacity-light/15",
  partial: "text-accent-amber-bright bg-accent-amber-bright/15",
  overdue: "text-alert-red bg-alert-red/15",
  invoiced: "text-text-body bg-text-body/15",
  expected: "text-text-muted bg-text-muted/15",
};

/** Local midnight today, matching parseLocalDate's timezone-free convention. */
function todayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * What this row is worth. Null when the row carries no explicit figure — the
 * caller decides whether to fall back to the card estimate, because that
 * fallback is a per-card decision, not a per-row one.
 */
export function rowExpected(p: PaymentRow): number | null {
  return p.amount_expected;
}

export function derivePaymentStatus(p: PaymentRow, now = todayLocal()): PaymentStatus {
  const expected = rowExpected(p);
  const received = Number(p.amount_received) || 0;

  // Tolerance of a cent absorbs numeric(10,2) rounding so a fully-settled
  // invoice doesn't sit forever at "partial" over a rounding remainder.
  if (expected != null && received >= expected - 0.01 && expected > 0) return "paid";
  if (expected == null && received > 0) return "paid";
  if (received > 0) return "partial";
  if (p.due_on && parseLocalDate(p.due_on) < now) return "overdue";
  if (p.invoiced_on) return "invoiced";
  return "expected";
}

/**
 * A project's total expected value.
 *
 * Explicit invoice figures win outright: once any milestone has a real
 * number on it, the calculated estimate stops being used for that project.
 * Mixing the two would double-count — summing a $1,200 deposit row against a
 * $2,400 whole-project estimate reads as $3,600 of work that doesn't exist.
 */
export function cardExpected(card: MoneyCard, rows: PaymentRow[]): number | null {
  const explicit = rows.filter(r => r.amount_expected != null);
  if (explicit.length > 0) {
    return explicit.reduce((sum, r) => sum + Number(r.amount_expected), 0);
  }
  return estimatedEarnings(
    card.word_count,
    card.pfh_rate,
    card.payment_type,
    card.narration_format,
    card.narrator_share_percent,
  );
}

/** True when the figure came from real invoices rather than the PFH estimate. */
export function isCardExpectedActual(rows: PaymentRow[]): boolean {
  return rows.some(r => r.amount_expected != null);
}

export type MoneyTotals = {
  expected: number;
  invoiced: number;
  received: number;
  outstanding: number;
  overdue: number;
};

export function computeTotals(cards: MoneyCard[], rowsByCard: Map<string, PaymentRow[]>): MoneyTotals {
  let expected = 0;
  let invoiced = 0;
  let received = 0;
  let overdue = 0;

  for (const card of cards) {
    const rows = rowsByCard.get(card.id) ?? [];
    expected += cardExpected(card, rows) ?? 0;

    for (const r of rows) {
      const amt = Number(r.amount_expected) || 0;
      const got = Number(r.amount_received) || 0;
      received += got;
      if (r.invoiced_on) invoiced += amt;
      if (derivePaymentStatus(r) === "overdue") overdue += amt;
    }
  }

  // Floored: an overpayment (a client rounding up, a currency conversion
  // landing high) should read as nothing outstanding, not as negative debt.
  return {
    expected,
    invoiced,
    received,
    outstanding: Math.max(0, invoiced - received),
    overdue,
  };
}

export type ClientBreakdown = {
  client: string;
  projects: number;
  expected: number;
  received: number;
  /** Mean $/finished-hour across this client's rate-bearing projects. */
  avgPfh: number | null;
};

/**
 * Who a project is for. production_company when it's a company job, otherwise
 * the author — an indie author IS the client, which is what production_type
 * distinguishes. Only 4 of 34 live cards carry a production_company today, so
 * the author fallback is what most rows actually use.
 */
export function clientOf(card: MoneyCard): string {
  const co = card.production_company?.trim();
  if (co) return co;
  const author = card.author?.trim();
  if (author) return author;
  return "Unattributed";
}

export function computeByClient(
  cards: MoneyCard[],
  rowsByCard: Map<string, PaymentRow[]>,
): ClientBreakdown[] {
  const acc = new Map<string, { projects: number; expected: number; received: number; rates: number[] }>();

  for (const card of cards) {
    const key = clientOf(card);
    const rows = rowsByCard.get(card.id) ?? [];
    const entry = acc.get(key) ?? { projects: 0, expected: 0, received: 0, rates: [] };

    entry.projects += 1;
    entry.expected += cardExpected(card, rows) ?? 0;
    entry.received += rows.reduce((s, r) => s + (Number(r.amount_received) || 0), 0);
    if (card.pfh_rate && Number(card.pfh_rate) > 0) entry.rates.push(Number(card.pfh_rate));

    acc.set(key, entry);
  }

  return [...acc.entries()]
    .map(([client, e]) => ({
      client,
      projects: e.projects,
      expected: e.expected,
      received: e.received,
      avgPfh: e.rates.length ? e.rates.reduce((a, b) => a + b, 0) / e.rates.length : null,
    }))
    .sort((a, b) => b.expected - a.expected);
}

/** Whole dollars — cents are noise at the scale these figures are read at. */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
