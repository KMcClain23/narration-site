// Pure money helpers for the Payments page. No "use client" — the server
// component page imports these directly, same reason board-card-utils.ts
// stays outside a client module.
//
// The PFH math is NOT reimplemented here: estimatedEarnings() in
// board-card-utils.ts is the single source of truth for
// word_count -> finished hours -> narrator share, and this file only decides
// when to fall back to it.

import { estimatedEarnings, parseLocalDate } from "@/components/admin/board-card-utils";

/**
 * A fee is billed and chased; a royalty statement simply arrives.
 *
 * Kept as two kinds of the same row rather than two tables because they answer
 * the same question — what did this project pay — and an RS+ deal is literally
 * one fee plus many royalty statements.
 */
export type PaymentKind = "fee" | "royalty";

export type PaymentRow = {
  id: string;
  card_id: string;
  kind: PaymentKind;
  /** Royalty statements only: which period the statement covers. */
  period: string;
  label: string;
  amount_expected: number | null;
  due_on: string | null;
  invoiced_on: string | null;
  invoice_number: string;
  /**
   * The narrator's OWN share received — not the gross sum that landed in the
   * account. On a duet where the narrator is payee of record, the client pays
   * `amount_gross`, production costs come off the top, and this is the
   * narrator's cut of what remained. Every total on the Payments page is
   * denominated this way. See computeWaterfall() for the full order.
   */
  amount_received: number;
  /** What the client is billed across all narrators. Null = same as expected. */
  amount_gross: number | null;
  received_on: string | null;
  method: string;
  notes: string;
  sort_order: number;
  /** Stripe Payment Link already raised for this invoice, if any. */
  stripe_payment_link?: string;
  /** Money leaving the account after payment. Empty for solo, unedited work. */
  payouts?: PayoutRow[];
};

export type PayoutKind = "co_narrator" | "editor" | "proofer" | "agent" | "other";

export type PayoutRow = {
  id: string;
  payment_id: string;
  payee_name: string;
  kind: PayoutKind;
  amount: number;
  /** Per-finished-hour rate, when the payee bills that way. Populates amount. */
  rate_pfh: number | null;
  paid_on: string | null;
  notes: string;
};

export const PAYOUT_KIND_LABEL: Record<PayoutKind, string> = {
  co_narrator: "Co-narrator",
  editor: "Editor",
  proofer: "Proofer",
  agent: "Agent",
  other: "Other",
};

/**
 * Payouts taken off the gross BEFORE the narrator split.
 *
 * Production costs are borne by the project, not by one narrator: the editor
 * is paid out of the total fee and the remainder is what the narrators divide.
 * Agent and other come out of the narrator's own share instead, since those
 * are personal to whoever engaged them.
 */
const OFF_THE_TOP: ReadonlySet<PayoutKind> = new Set<PayoutKind>(["editor", "proofer"]);

export function isOffTheTop(kind: PayoutKind): boolean {
  return OFF_THE_TOP.has(kind);
}

/**
 * The narrator's cut of a project. Mirrors estimatedEarnings() so the money
 * layer splits on exactly the same basis the board estimates on.
 */
export function narratorShare(card: MoneyCard): number {
  if (card.narrator_share_percent != null) return card.narrator_share_percent / 100;
  return card.narration_format === "duet" || card.narration_format === "dual" ? 0.5 : 1;
}

/**
 * What a payout actually costs *you*, as opposed to what you write the check
 * for.
 *
 * On a duet the narrator of record collects the whole fee, pays the editor,
 * and splits what remains — so the editor's invoice leaves your account in
 * full, but half of it is borne by your co-narrator through a smaller split.
 * Every total on this page is denominated in your own money, so an off-the-top
 * cost has to be carried at your share of it or it overstates the hit.
 *
 * Agent and other are personal, so they cost you the full amount.
 */
export function payoutBurden(payout: PayoutRow, card: MoneyCard): number {
  const amount = Number(payout.amount) || 0;
  return isOffTheTop(payout.kind) ? amount * narratorShare(card) : amount;
}

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

  // Royalties accrue before they are disbursed: a distributor reports what was
  // earned each period and pays the accumulated balance later, often months
  // later and only once it clears a threshold. So a royalty row carries both
  // what was earned (amount_expected) and what has actually landed
  // (amount_received), and is owed until those meet.
  //
  // There is no overdue state — a distributor sets its own payment timing and
  // owes nothing on a schedule you can be late against.
  if (p.kind === "royalty") {
    const earned = expected ?? 0;
    if (earned > 0 && received + 0.01 >= earned) return "paid";
    if (received > 0) return "partial";
    if (earned > 0) return "expected";
    return received > 0 ? "paid" : "expected";
  }

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
  // Royalty statements are history, not a forecast — including them would
  // make "expected" grow every time a statement is entered.
  const explicit = rows.filter(r => r.kind !== "royalty" && r.amount_expected != null);
  if (explicit.length > 0) {
    return explicit.reduce((sum, r) => sum + Number(r.amount_expected), 0);
  }
  // A recast project earns a partial project fee, not the contracted fee, and the
  // percentage is a negotiation — nothing before recording starts, pro rata
  // during, commonly half once past the midpoint. Falling back to the full
  // estimate would park a fee in the pipeline that was never agreed, so this
  // stays unknown until the real figure is entered on a payment row.
  if (card.status === "recast") return null;
  return estimatedEarnings(
    card.word_count,
    card.pfh_rate,
    card.payment_type,
    card.narration_format,
    card.narrator_share_percent,
  );
}

/**
 * The contracted fee, ignoring any cancellation.
 *
 * cardExpected() deliberately goes quiet on recast work, but an invoice still
 * needs the original figure to say what the partial fee is a percentage
 * of. Narrator-share basis, same as the board estimate.
 */
export function agreedFee(card: MoneyCard): number | null {
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

/**
 * What a single row is worth, for totals that need a per-row figure.
 *
 * `amount_expected` is optional by design — leaving it blank means "use the
 * calculated estimate" — but that left an invoiced, fully-paid row counting
 * zero toward Invoiced. Falling back in order:
 *   1. the explicit figure, when set;
 *   2. what was actually received, since a paid row is self-evidently worth
 *      at least that much;
 *   3. the project estimate, but only for a single-milestone project — an
 *      estimate covers the whole job and cannot be split across instalments
 *      without inventing a number.
 */
export function rowValue(p: PaymentRow, card: MoneyCard, rows: PaymentRow[]): number {
  // A royalty row is worth what the statement says was earned; what has been
  // received against it may still be nothing. There is no estimate to fall
  // back on — that is the nature of royalty share.
  if (p.kind === "royalty") {
    return p.amount_expected != null ? Number(p.amount_expected) : Number(p.amount_received) || 0;
  }

  if (p.amount_expected != null) return Number(p.amount_expected);
  const received = Number(p.amount_received) || 0;
  if (received > 0) return received;
  // Only the fee rows can claim the project estimate; a royalty row alongside
  // them must not, or the estimate would be counted twice.
  if (rows.filter(r => r.kind !== "royalty").length === 1) return cardExpected(card, rows) ?? 0;
  return 0;
}

/**
 * One unpaid payout, carrying enough context to group and explain it.
 *
 * `dueAfterRelease` is the difference between a cost you have committed to and
 * a debt you currently hold: an editor on a book still in production will be
 * owed, but isn't yet.
 */
export type PayoutObligation = {
  name: string;
  kind: PayoutKind;
  amount: number;
  projectTitle: string;
  dueAfterRelease: boolean;
};

export type MoneyTotals = {
  expected: number;
  invoiced: number;
  received: number;
  outstanding: number;
  overdue: number;
  /**
   * Everything owed onward to other people. Reported separately from earnings
   * rather than netted off, because whether a given payout reduces income or
   * is a deductible expense depends on how the work is reported — a question
   * for an accountant, not for this file to decide.
   */
  /** Royalty-share income received. Counted in `received`, never in `expected` — royalties are history, not a forecast. */
  royalties: number;
  /** Royalty income earned across all statements, paid or not. */
  royaltiesEarned: number;
  /** Earned but not yet disbursed — a real receivable, not a forecast. */
  royaltiesOwed: number;
  payoutsTotal: number;
  /** Payouts with a paid_on date — money that has actually left. */
  payoutsPaid: number;
  /**
   * Payouts with no paid_on date. Distinct from paid because a narrator
   * usually can't pay the editor until the client has paid them: showing the
   * two as one figure claims money has moved when it hasn't.
   */
  payoutsOwed: number;
  payoutsByKind: Record<string, number>;
  /**
   * Unpaid payouts on projects that have shipped — money genuinely due now.
   * An editor isn't owed for a book still in the booth.
   */
  payoutsOwedNow: number;
  /** Unpaid payouts on unreleased projects: a committed cost, not yet a debt. */
  payoutsUpcoming: number;
  /** Every unpaid obligation, for grouping by payee rather than listing raw. */
  owedTo: PayoutObligation[];
  /**
   * What the whole tracked book of work is worth: fees plus royalties earned,
   * counting each project once whether it has been paid or not.
   *
   * Deliberately NOT `received + expected`. `expected` already spans every
   * project including the paid ones, so adding collected income on top would
   * count a finished job twice.
   */
  projectedGross: number;
  /** projectedGross less what those payouts actually cost you. */
  projectedNet: number;
  /**
   * `expected` less the editing it will take to earn it.
   *
   * estimatedEarnings() applies the narrator split but knows nothing about
   * production costs, so the raw pipeline figure reads as money that will land
   * in the bank when part of it is already committed to an editor.
   */
  expectedNet: number;
};

export function computeTotals(cards: MoneyCard[], rowsByCard: Map<string, PaymentRow[]>): MoneyTotals {
  let expected = 0;
  let invoiced = 0;
  let received = 0;
  let overdue = 0;
  let royalties = 0;
  let royaltiesEarned = 0;
  let royaltiesOwed = 0;
  let payoutsTotal = 0;
  let payoutsPaid = 0;
  let payoutsOwed = 0;
  const payoutsByKind: Record<string, number> = {};
  const owedTo: PayoutObligation[] = [];
  let payoutsOwedNow = 0;
  let payoutsUpcoming = 0;
  let payoutsBurdenTotal = 0;

  let projectedGross = 0;

  for (const card of cards) {
    const rows = rowsByCard.get(card.id) ?? [];
    const cardEst = cardExpected(card, rows) ?? 0;
    expected += cardEst;

    // Each project contributes once, at whichever figure is better evidence:
    // the estimate, or what actually came in when that overshot it. A project
    // paid without an explicit invoice figure still falls back to the PFH
    // estimate, so taking the estimate alone would understate a job that paid
    // above it.
    const feeReceived = rows
      .filter(r => r.kind !== "royalty")
      .reduce((s, r) => s + (Number(r.amount_received) || 0), 0);
    projectedGross += Math.max(cardEst, feeReceived);

    for (const r of rows) {
      const amt = rowValue(r, card, rows);
      const got = Number(r.amount_received) || 0;
      received += got;

      // Royalties are owed from the moment they are earned until the
      // distributor actually disburses them — which on ACX means accruing for
      // months below a payment threshold. Counting them only once paid hid
      // real money; counting them as collected on the statement date claimed
      // money that hadn't arrived.
      if (r.kind === "royalty") {
        royalties += got;
        royaltiesEarned += amt;
        royaltiesOwed += Math.max(0, amt - got);
        continue;
      }

      for (const p of r.payouts ?? []) {
        const a = Number(p.amount) || 0;
        // What you pay vs what it costs you: on a duet the editor's invoice
        // leaves your account whole, but comes off the top before the split,
        // so your co-narrator carries half of it.
        const burden = payoutBurden(p, card);
        payoutsTotal += a;
        payoutsBurdenTotal += burden;
        payoutsByKind[p.kind] = (payoutsByKind[p.kind] ?? 0) + a;

        if (p.paid_on) {
          payoutsPaid += a;
        } else if (a > 0) {
          payoutsOwed += a;
          // A payout only becomes a debt once the book has shipped — before
          // that it is a committed cost on work still in progress.
          const dueAfterRelease = card.status !== "released";
          if (dueAfterRelease) {
            payoutsUpcoming += a;
          } else {
            payoutsOwedNow += a;
          }
          owedTo.push({
            name: p.payee_name,
            kind: p.kind,
            amount: a,
            projectTitle: card.title,
            dueAfterRelease,
          });
        }
      }

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
    // Fee invoices chase `received` down; royalties owed are additive — a
    // distributor never invoices, so they would otherwise vanish from what
    // you are owed entirely.
    outstanding: Math.max(0, invoiced - (received - royalties)) + royaltiesOwed,
    overdue,
    royalties,
    royaltiesEarned,
    royaltiesOwed,
    payoutsTotal,
    payoutsPaid,
    payoutsOwed,
    payoutsByKind,
    payoutsOwedNow,
    payoutsUpcoming,
    owedTo: owedTo.sort((a, b) => b.amount - a.amount),
    // Royalties sit outside cardExpected by design — they are history, not a
    // forecast — so they are added here rather than being counted twice.
    projectedGross: projectedGross + royaltiesEarned,
    projectedNet: projectedGross + royaltiesEarned - payoutsBurdenTotal,
    expectedNet: expected - payoutsBurdenTotal,
  };
}

export type Waterfall = {
  gross: number;
  /** Editor/proofer fees, deducted before anyone's split. */
  offTheTop: number;
  /** What the narrators actually divide. */
  distributable: number;
  sharePercent: number;
  /** The narrator's cut of the distributable amount. */
  yourShare: number;
  /** Deducted from the narrator's own share, not the project's. */
  fromYourShare: number;
  /** What the narrator keeps once everything above has come out. */
  yourNet: number;
  /** What is owed onward to co-narrators, when payee of record. */
  toCoNarrators: number;
};

/**
 * The order money actually moves: the client pays a gross fee, production costs
 * come off the top, and only what remains gets split between narrators.
 *
 * This is why estimatedEarnings() reads high on any project with an editor — it
 * applies the narrator's share to the full fee, with nothing taken out first.
 * It is an estimate of the fee earned, not of what lands in the bank.
 */
export function computeWaterfall(
  gross: number,
  sharePercent: number,
  payouts: PayoutRow[],
): Waterfall {
  const offTheTop = payouts
    .filter(p => isOffTheTop(p.kind))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const distributable = Math.max(0, gross - offTheTop);
  const share = sharePercent / 100;
  const yourShare = distributable * share;

  const fromYourShare = payouts
    .filter(p => p.kind === "agent" || p.kind === "other")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return {
    gross,
    offTheTop,
    distributable,
    sharePercent,
    yourShare,
    fromYourShare,
    yourNet: yourShare - fromYourShare,
    toCoNarrators: Math.max(0, distributable - yourShare),
  };
}

/** Finished hours a payout's PFH rate applies to. */
export function finishedHours(wordCount: number | null): number {
  return wordCount ? wordCount / 9400 : 0;
}

/**
 * What an invoice for this milestone should bill.
 *
 * Gross when set — on a duet the client owes the whole fee, not the narrator's
 * half — otherwise the narrator's own expected amount, which is correct for
 * solo work and for projects where the client pays each narrator directly.
 */
export function invoiceAmount(p: PaymentRow, card: MoneyCard, rows: PaymentRow[]): number | null {
  if (p.amount_gross != null) return Number(p.amount_gross);
  if (p.amount_expected != null) return Number(p.amount_expected);
  return cardExpected(card, rows);
}

/**
 * Where a project sits in the money cycle.
 *
 * One state per project, so a project appears exactly once on the page. The
 * previous layout listed payments and un-invoiced projects as two separate
 * sections, which meant a project with a payment row but no invoice date
 * appeared in both — describing the same thing twice in different words.
 */
export type ProjectState = "awaiting" | "ready" | "production" | "paid" | "untracked";

export const PROJECT_STATE_LABEL: Record<ProjectState, string> = {
  awaiting: "Awaiting payment",
  ready: "Ready to invoice",
  production: "In production",
  paid: "Paid",
  untracked: "Released — no payment recorded",
};

export function projectState(card: MoneyCard, rows: PaymentRow[]): ProjectState {
  const received = rows.reduce((s, r) => s + (Number(r.amount_received) || 0), 0);
  const invoicedRows = rows.filter(r => r.kind !== "royalty" && r.invoiced_on);

  // Pure royalty share is never invoiced — there is no client to bill, only
  // statements that arrive. Calling it "ready to invoice" would park it in a
  // to-do list it can never leave.
  const royalty = rows.filter(r => r.kind === "royalty");
  // Keyed on having royalty rows, not only on payment_type: an RS+ project is
  // a fee plus royalties, and checking the type alone would leave its unpaid
  // statements out of "awaiting payment" entirely.
  if (card.payment_type === "rs" || royalty.length > 0) {
    const owed = royalty.reduce(
      (s, r) => s + Math.max(0, rowValue(r, card, rows) - (Number(r.amount_received) || 0)),
      0,
    );
    // Earned but not yet disbursed is money awaiting payment, not settled work.
    if (owed > 0.01) return "awaiting";
    if (royalty.length > 0 || received > 0) return "paid";
    return card.status === "released" ? "untracked" : "production";
  }
  const invoicedTotal = invoicedRows.reduce((s, r) => s + rowValue(r, card, rows), 0);

  if (invoicedRows.length > 0) {
    // Cent of tolerance so numeric(10,2) rounding doesn't strand a settled
    // invoice in "awaiting" forever.
    return received + 0.01 >= invoicedTotal ? "paid" : "awaiting";
  }

  // Paid without ever being invoiced — the common indie case, where the
  // author simply sends the money.
  if (received > 0) return "paid";

  // A title that is already on sale with nothing recorded against it is
  // history, not a task: it shipped before this tracker existed. Calling it
  // "ready to invoice" would put a decade of back catalog in the same list
  // as this week's work.
  if (card.status === "released") return "untracked";

  // Recast work is billable the moment it stops. Nothing more will be
  // delivered, but the partial project fee is due now and won't arrive on its own
  // — treating it as "in production" would hide the one project on the page
  // that needs an invoice today.
  if (card.status === "recast") return "ready";

  // Billable once it is off the mic. Anything earlier can't be invoiced,
  // because the work hasn't been delivered.
  return card.status === "editing" ? "ready" : "production";
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
