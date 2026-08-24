"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate, parseCoNarrators } from "@/components/admin/board-card-utils";
import { formatMoney, type MoneyCard, type PaymentRow } from "@/lib/payments";

// Every royalty statement across every title, newest first.
//
// Royalties are the one kind of payment that doesn't belong to a single
// project in the reader's head — they arrive as a monthly batch covering
// several books, and the question is usually "what has ACX paid me" rather
// than "what has this book earned". The per-project grouping above answers
// the second question; this answers the first.

/** "Jun 2026" and "Apr 2026" sort correctly; unlabeled rows sink. */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function periodKey(period: string): number {
  const m = /([a-z]{3})[a-z]*\s+(\d{4})/i.exec(period.trim());
  if (!m) return 0;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  return month < 0 ? 0 : Number(m[2]) * 12 + month;
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Half, unless the book says otherwise. Matches the payment form's default. */
const DEFAULT_ROYALTY_SPLIT = 50;

/**
 * What a statement leaves the narrator, and who takes the rest.
 *
 * A recorded payout is the truth and is used as-is. Where none has been
 * recorded yet the book's own arrangement stands in, marked with a tilde: the
 * money is still owed under the agreement whether or not anyone has typed it
 * in, and a gross figure on a split title reads as income that is all yours.
 */
function shareOf(
  row: PaymentRow,
  card: MoneyCard | undefined,
  earned: number,
): { yours: number; theirs: number; payee: string; recorded: boolean } | null {
  if (earned <= 0) return null;

  const recorded = (row.payouts ?? []).filter(p => p.kind === "co_narrator");
  if (recorded.length) {
    const theirs = recorded.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (theirs <= 0) return null;
    const payee = recorded.length === 1 ? recorded[0].payee_name.trim() || "co-narrator" : "co-narrators";
    return { yours: Math.round((earned - theirs) * 100) / 100, theirs, payee, recorded: true };
  }

  const payee = parseCoNarrators(card?.co_narrator ?? null)[0];
  if (!payee) return null;
  const percent = card?.royalty_split_percent ?? DEFAULT_ROYALTY_SPLIT;
  if (percent <= 0) return null;
  const theirs = Math.round(earned * (percent / 100) * 100) / 100;
  return { yours: Math.round((earned - theirs) * 100) / 100, theirs, payee, recorded: false };
}

export function RoyaltyLedger({
  cards,
  payments,
  onChanged,
}: {
  cards: MoneyCard[];
  payments: PaymentRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const titleById = useMemo(() => new Map(cards.map(c => [c.id, c.title])), [cards]);
  const cardById = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const rows = useMemo(
    () =>
      payments
        .filter(p => p.kind === "royalty")
        .sort((a, b) => periodKey(b.period) - periodKey(a.period)),
    [payments],
  );

  const earned = rows.reduce((s, r) => s + (Number(r.amount_expected) || 0), 0);
  const paid = rows.reduce((s, r) => s + (Number(r.amount_received) || 0), 0);
  const owed = Math.max(0, earned - paid);
  const splitOut = rows.reduce((s, r) => {
    const share = shareOf(r, cardById.get(r.card_id), Number(r.amount_expected) || 0);
    return s + (share?.theirs ?? 0);
  }, 0);

  if (rows.length === 0) return null;

  /**
   * Marking a statement paid is the other half of the accrual: ACX reports
   * earnings monthly and disburses the accumulated balance later, so this is
   * the action a narrator takes when the payout finally lands.
   */
  async function togglePaid(row: PaymentRow) {
    const isPaid = Number(row.amount_received) > 0;
    setBusyId(row.id);
    try {
      await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          amount_received: isPaid ? 0 : Number(row.amount_expected) || 0,
          received_on: isPaid ? "" : new Date().toISOString().split("T")[0],
        }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-3 mb-4 overflow-hidden rounded-xl border border-surface-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left hover:bg-surface-raised"
      >
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
        <span className={adminType.title}>Royalty statements</span>
        <span className={`${adminType.monoNum} rounded-full bg-pill-neutral-bg px-2 py-0.5 text-pill-neutral-text`}>
          {rows.length}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className={adminType.monoNum}>
            {formatMoney(earned)} earned
            {owed > 0.005 && (
              <span className="text-accent-amber-bright"> · {formatMoney(owed)} awaiting payout</span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <>
          <p className={`${adminType.small} border-t border-surface-border px-4 py-2`}>
            Every statement, newest first. Distributors report earnings monthly and pay the accrued
            balance later — mark a statement paid when the money actually lands.
          </p>
          <div className="admin-scrollbar max-h-[420px] overflow-y-auto">
            {rows.map(r => {
              const rowEarned = Number(r.amount_expected) || 0;
              const rowPaid = Number(r.amount_received) || 0;
              const isPaid = rowPaid > 0;
              const share = shareOf(r, cardById.get(r.card_id), rowEarned);
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-divider px-4 py-2.5 last:border-0"
                >
                  <span className={`${adminType.monoNum} w-20 shrink-0`}>{r.period || "—"}</span>
                  <span className={`${adminType.bodyMd} min-w-[160px] flex-1 truncate`}>
                    {titleById.get(r.card_id) ?? "Unknown project"}
                  </span>
                  {/* The statement figure, and underneath it what is actually
                      kept — the same shape the project rows use for editing
                      fronted on someone else's behalf. A split title reporting
                      only its gross reads as money that is all yours. */}
                  <span className="w-32 shrink-0 text-right">
                    <span className={`${adminType.monoNum} block text-text-primary`}>
                      {formatMoney(rowEarned)}
                    </span>
                    {share && (
                      <span className={`${adminType.small} block`}>
                        {formatMoney(share.yours)} you · {share.recorded ? "" : "~"}
                        {formatMoney(share.theirs)} {share.payee}
                      </span>
                    )}
                  </span>
                  <span className={`${adminType.small} w-28 shrink-0`}>{r.method || ""}</span>
                  <span
                    className={`w-32 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${
                      isPaid
                        ? "text-capacity-light bg-capacity-light/15"
                        : "text-accent-amber-bright bg-accent-amber-bright/15"
                    }`}
                  >
                    {isPaid ? `Paid ${fmtDate(r.received_on)}`.trim() : "Awaiting payout"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void togglePaid(r)}
                    disabled={busyId === r.id}
                    className="text-[13px] text-text-muted hover:text-text-primary disabled:opacity-50"
                  >
                    {busyId === r.id ? "…" : isPaid ? "Mark unpaid" : "Mark paid"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-surface-border bg-surface px-4 py-2.5">
            <span className={adminType.monoNum}>Earned {formatMoney(earned)}</span>
            {/* The books earned one figure; a different one is the narrator's.
                Showing only the first invites planning around money that is
                already promised to someone else. */}
            {splitOut > 0.005 && (
              <>
                <span className={adminType.monoNum}>Split out {formatMoney(splitOut)}</span>
                <span className={`${adminType.monoNum} text-text-primary`}>
                  Yours {formatMoney(earned - splitOut)}
                </span>
              </>
            )}
            <span className={adminType.monoNum}>Paid out {formatMoney(paid)}</span>
            <span className={`${adminType.monoNum} text-accent-amber-bright`}>Awaiting {formatMoney(owed)}</span>
          </div>
        </>
      )}
    </section>
  );
}
