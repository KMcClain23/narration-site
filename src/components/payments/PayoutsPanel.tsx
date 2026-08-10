"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { formatMoney, PAYOUT_KIND_LABEL, type MoneyTotals } from "@/lib/payments";

// What you owe other people, grouped by person.
//
// The stat used to list every obligation inline — "Editor · Marizete $704 ·
// Editor · Marizete $638 · Editor · Marizete $574" — which repeated the same
// name three times and grew with every project. One line per payee, expandable
// to the projects behind it.

type Grouped = {
  name: string;
  kind: string;
  total: number;
  owedNow: number;
  upcoming: number;
  items: { projectTitle: string; amount: number; dueAfterRelease: boolean }[];
};

function groupByPayee(owedTo: MoneyTotals["owedTo"]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const o of owedTo) {
    const key = `${o.name}|${o.kind}`;
    const g = map.get(key) ?? {
      name: o.name || "Unnamed",
      kind: o.kind,
      total: 0,
      owedNow: 0,
      upcoming: 0,
      items: [],
    };
    g.total += o.amount;
    if (o.dueAfterRelease) g.upcoming += o.amount;
    else g.owedNow += o.amount;
    g.items.push({ projectTitle: o.projectTitle, amount: o.amount, dueAfterRelease: o.dueAfterRelease });
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** One line of the closing ledger. Negatives carry their own sign. */
function Line({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: number;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <span className={strong ? adminType.bodyMd : adminType.small}>{label}</span>
      <span
        className={`${adminType.monoNum} ${
          strong ? "text-text-primary" : value < 0 ? "text-text-dim" : "text-text-body"
        }`}
      >
        {value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}
      </span>
    </div>
  );
}

export function PayoutsPanel({ totals }: { totals: MoneyTotals }) {
  const [open, setOpen] = useState(false);
  const groups = groupByPayee(totals.owedTo);

  if (totals.payoutsOwed <= 0 && totals.payoutsPaid <= 0) return null;

  // Two nets, because they answer different questions.
  //
  // What's left of collected income once every debt currently due is settled.
  // The headline "Collected" figure is gross: it counts money already
  // committed to an editor.
  //
  // Both use the burden figures, not the check amounts: `received` is already
  // the narrator's own share, so charging it the whole of an editor invoice
  // that came off the top before the split would deduct the co-narrator's half
  // from your money as well.
  const netInHand = totals.received - totals.payoutsPaidBurden - totals.payoutsOwedNowBurden;

  // And what's left once the estimated costs on unreleased books are paid too.
  // Those aren't debts yet, but they are already spoken for, so the money is
  // not really yours to plan around.
  const netAfterEditing = netInHand - totals.payoutsUpcomingBurden;

  // Name the cost by what is actually in it rather than assuming "editing" —
  // a co-narrator split is not an editing cost.
  const upcomingKinds = new Set(totals.owedTo.filter(o => o.dueAfterRelease).map(o => o.kind));
  const upcomingLabel =
    upcomingKinds.size === 1
      ? PAYOUT_KIND_LABEL[[...upcomingKinds][0] as keyof typeof PAYOUT_KIND_LABEL] ?? "Payouts"
      : "Payouts";

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-surface-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3 text-left hover:bg-surface-raised"
      >
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
        <span className={adminType.title}>You owe others</span>
        <span className={`${adminType.monoNum} rounded-full bg-pill-neutral-bg px-2 py-0.5 text-pill-neutral-text`}>
          {groups.length}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-4">
          <span className={adminType.monoNum}>
            <span className="text-accent-amber-bright">{formatMoney(totals.payoutsOwedNow)}</span> due now
          </span>
          {totals.payoutsUpcoming > 0.005 && (
            <span className={adminType.small}>
              {formatMoney(totals.payoutsUpcoming)} after release
            </span>
          )}
        </span>
      </button>

      {open && (
        <>
          <p className={`${adminType.small} border-t border-surface-border px-4 py-2`}>
            Nothing is due until the book is released — costs on work still in production are
            committed, not owed.
          </p>

          <div>
            {groups.map(g => (
              <div key={`${g.name}|${g.kind}`} className="border-b border-divider px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className={adminType.bodyMd}>
                    {g.name}
                    <span className={`${adminType.small} ml-2`}>
                      {PAYOUT_KIND_LABEL[g.kind as keyof typeof PAYOUT_KIND_LABEL] ?? g.kind} ·{" "}
                      {g.items.length} project{g.items.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className={adminType.monoNum}>
                    {g.owedNow > 0.005 && (
                      <span className="text-accent-amber-bright">{formatMoney(g.owedNow)} due now</span>
                    )}
                    {g.owedNow > 0.005 && g.upcoming > 0.005 && " · "}
                    {g.upcoming > 0.005 && (
                      <span className="text-text-dim">{formatMoney(g.upcoming)} later</span>
                    )}
                  </span>
                </div>

                <div className="mt-1.5 space-y-0.5 border-l border-surface-border pl-3">
                  {g.items
                    .sort((a, b) => Number(a.dueAfterRelease) - Number(b.dueAfterRelease))
                    .map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <span className={adminType.small}>
                          {it.projectTitle}
                          {it.dueAfterRelease ? " · not until release" : " · released"}
                        </span>
                        <span className={adminType.monoNum}>{formatMoney(it.amount)}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* A vertical ledger rather than a row of stats: this is one
              subtraction carried down twice, and a chain of arithmetic reads
              as a column. */}
          <div className="border-t border-surface-border bg-surface px-4 py-3">
            <div className="ml-auto w-full max-w-xs space-y-1">
              <Line label="Collected" value={totals.received} />
              {totals.payoutsPaidBurden > 0.005 && (
                <Line label="Already paid out" value={-totals.payoutsPaidBurden} />
              )}
              {totals.payoutsOwedNowBurden > 0.005 && (
                <Line label="Due now" value={-totals.payoutsOwedNowBurden} />
              )}
              <Line label="Net in hand" value={netInHand} strong />

              {totals.payoutsUpcomingBurden > 0.005 && (
                <>
                  <Line
                    label={`${upcomingLabel}, your share`}
                    value={-totals.payoutsUpcomingBurden}
                    className="border-t border-divider pt-1.5"
                  />
                  <Line label={`Net after ${upcomingLabel.toLowerCase()}`} value={netAfterEditing} strong />
                </>
              )}
            </div>

          </div>
        </>
      )}
    </section>
  );
}
