"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "@/components/admin/board-card-utils";
import { formatMoney, PAYOUT_KIND_LABEL, type MoneyTotals } from "@/lib/payments";
import { MarkPayoutPaid, UndoPayoutPaid } from "./MarkPayoutPaid";

function fmtDate(s: string): string {
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  items: { id: string; name: string; projectTitle: string; amount: number; dueAfterRelease: boolean }[];
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
    g.items.push({
      id: o.id,
      name: o.name,
      projectTitle: o.projectTitle,
      amount: o.amount,
      dueAfterRelease: o.dueAfterRelease,
    });
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function PayoutsPanel({ totals }: { totals: MoneyTotals }) {
  const [open, setOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);
  const groups = groupByPayee(totals.owedTo);
  const paid = totals.paidTo;

  // Each half stands on its own. Once everything is settled the owed card would
  // otherwise sit there reading "0 payees, $0 due now", which is noise.
  if (groups.length === 0 && paid.length === 0) return null;

  // Deliberately no closing subtotal here. A payout is settled out of the fee
  // for its own book, so netting it against money collected from unrelated
  // projects subtracts across two pools that never meet. Whole-business
  // netting belongs in the stat strip, where the scope is the whole business.

  return (
    <>
    {groups.length > 0 && (
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
                    .map(it => (
                      <div key={it.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className={adminType.small}>
                          {it.projectTitle}
                          {it.dueAfterRelease ? " · not until release" : " · released"}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className={adminType.monoNum}>{formatMoney(it.amount)}</span>
                          {/* The date is the point, not the fact. A payout is
                              deductible in the year it was actually paid, and
                              names a 1099 payee for that year, so recording it
                              as "today" when it went out in December would put
                              it in the wrong return. */}
                          <MarkPayoutPaid id={it.id} name={it.name} amount={it.amount} />
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

        </>
      )}
    </section>
    )}

    {paid.length > 0 && (
      <section className="mt-3 overflow-hidden rounded-xl border border-surface-border">
        <button
          type="button"
          onClick={() => setPaidOpen(o => !o)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3 text-left hover:bg-surface-raised"
        >
          {paidOpen ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
          <span className={adminType.title}>Already paid</span>
          <span className={`${adminType.monoNum} rounded-full bg-pill-neutral-bg px-2 py-0.5 text-pill-neutral-text`}>
            {paid.length}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4">
            <span className={adminType.monoNum}>{formatMoney(totals.payoutsPaid)}</span>
            <span className={adminType.small}>gone out</span>
          </span>
        </button>

        {paidOpen && (
          <div>
            {paid.map(p => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-divider px-4 py-2.5 last:border-0">
                <span className={adminType.body}>
                  {p.name || "Unnamed"}
                  <span className={`${adminType.small} ml-2`}>
                    {PAYOUT_KIND_LABEL[p.kind] ?? p.kind} · {p.projectTitle}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={adminType.monoNum}>{formatMoney(p.amount)}</span>
                  <span className={adminType.small}>{fmtDate(p.paidOn)}</span>
                  {/* Said plainly rather than left blank. A missing method is
                      not a cosmetic gap: it is the case the 1099 test has to
                      assume is yours to report. */}
                  <span className={p.paidVia ? adminType.small : `${adminType.small} text-accent-amber-bright/80`}>
                    {p.paidVia || "method not recorded"}
                  </span>
                  <UndoPayoutPaid id={p.id} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    )}
    </>
  );
}
