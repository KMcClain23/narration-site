"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "@/components/admin/board-card-utils";
import {
  cardExpected,
  clientOf,
  computeByClient,
  computeTotals,
  derivePaymentStatus,
  formatMoney,
  isCardExpectedActual,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_PILL,
  PAYOUT_KIND_LABEL,
  rowValue,
  type MoneyCard,
  type PayoutKind,
  type PaymentRow,
  type PaymentStatus,
} from "@/lib/payments";
import { PaymentFormModal } from "./PaymentFormModal";
import { InvoiceButton } from "./InvoiceButton";

// Attention order, not alphabetical: the reason to open this page is to find
// money that hasn't arrived, so settled rows sink to the bottom.
const STATUS_RANK: Record<PaymentStatus, number> = {
  overdue: 0,
  partial: 1,
  invoiced: 2,
  expected: 3,
  paid: 4,
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "amber" | "red" }) {
  const valueColor =
    tone === "red" ? "text-alert-red" : tone === "amber" ? "text-accent-amber-bright" : "text-text-primary";
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <p className={adminType.label}>{label}</p>
      <p className={`mt-1.5 font-bold text-2xl tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className={`${adminType.small} mt-0.5`}>{hint}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${PAYMENT_STATUS_PILL[status]}`}>
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function PaymentsClient({ cards, payments: initialPayments }: { cards: MoneyCard[]; payments: PaymentRow[] }) {
  const [payments, setPayments] = useState<PaymentRow[]>(initialPayments);
  const [editing, setEditing] = useState<{ cardId: string; payment: PaymentRow | null } | null>(null);

  const cardsById = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const rowsByCard = useMemo(() => {
    const m = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      const list = m.get(p.card_id);
      if (list) list.push(p);
      else m.set(p.card_id, [p]);
    }
    return m;
  }, [payments]);

  const totals = useMemo(() => computeTotals(cards, rowsByCard), [cards, rowsByCard]);
  const byClient = useMemo(() => computeByClient(cards, rowsByCard), [cards, rowsByCard]);

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      const rank = STATUS_RANK[derivePaymentStatus(a)] - STATUS_RANK[derivePaymentStatus(b)];
      if (rank !== 0) return rank;
      // Undated rows sort last within a status rather than reading as due
      // at the epoch, which would put them above genuinely urgent ones.
      const at = a.due_on ? parseLocalDate(a.due_on).getTime() : Infinity;
      const bt = b.due_on ? parseLocalDate(b.due_on).getTime() : Infinity;
      return at - bt;
    });
  }, [payments]);

  // Projects with no invoice raised yet.
  //
  // Keyed on whether any row carries an invoice date — NOT on whether a
  // payment row exists. Merely recording or editing a payment is not
  // invoicing, and the previous version dropped a project off this list the
  // moment anything was saved against it, which is exactly when it still
  // needs to be here.
  const unbilled = useMemo(() => {
    return cards
      .filter(c => !(rowsByCard.get(c.id) ?? []).some(r => r.invoiced_on))
      .map(c => ({ card: c, estimate: cardExpected(c, rowsByCard.get(c.id) ?? []) }))
      .filter(x => x.estimate != null && x.estimate > 0)
      .sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0));
  }, [cards, rowsByCard]);

  const estimatedShare = useMemo(() => {
    const actual = cards
      .filter(c => isCardExpectedActual(rowsByCard.get(c.id) ?? []))
      .reduce((s, c) => s + (cardExpected(c, rowsByCard.get(c.id) ?? []) ?? 0), 0);
    return totals.expected - actual;
  }, [cards, rowsByCard, totals.expected]);

  function handleSaved(p: PaymentRow) {
    setPayments(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      if (idx === -1) return [...prev, p];
      const next = [...prev];
      next[idx] = p;
      return next;
    });
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setPayments(prev => prev.filter(p => p.id !== id));
    setEditing(null);
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className={adminType.titleLg}>Payments</h1>

      {/* Headline figures */}
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Expected"
          value={formatMoney(totals.expected)}
          hint={estimatedShare > 0.5 ? `${formatMoney(estimatedShare)} still estimated` : "All from invoices"}
        />
        <Tile label="Invoiced" value={formatMoney(totals.invoiced)} />
        <Tile label="Received" value={formatMoney(totals.received)} />
        <Tile
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          hint={totals.overdue > 0 ? `${formatMoney(totals.overdue)} overdue` : undefined}
          tone={totals.overdue > 0 ? "red" : "amber"}
        />
      </section>

      {/* Only rendered once there are payouts to report — an always-visible
          $0 row would imply this is part of every project rather than
          specific to duet work and edited titles. Reported, not netted off:
          whether a payout reduces income or is a deductible expense depends
          on how the work is reported, which is an accountant's call. */}
      {totals.payoutsTotal > 0 && (
        <section className="mt-4 rounded-xl border border-surface-border bg-surface px-4 py-3">
          <p className={adminType.label}>Paid out to others</p>
          <p className={`${adminType.monoNum} mt-1 text-text-primary`}>{formatMoney(totals.payoutsTotal)}</p>
          <p className={`${adminType.small} mt-0.5`}>
            {Object.entries(totals.payoutsByKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, amt]) => `${PAYOUT_KIND_LABEL[kind as PayoutKind] ?? kind} ${formatMoney(amt)}`)
              .join(" · ")}
          </p>
        </section>
      )}

      {/* Milestones */}
      <section className="mt-10">
        <h2 className={adminType.titleLg}>Milestones</h2>
        <div className="admin-scrollbar mt-4 overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                {["Project", "Milestone", "Expected", "Due", "Received", "Status", ""].map(h => (
                  <th key={h} className={`${adminType.label} px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${adminType.small} px-4 py-6`}>
                    No payments recorded yet. Add one from a project below.
                  </td>
                </tr>
              ) : (
                sortedPayments.map(p => {
                  const card = cardsById.get(p.card_id);
                  const status = derivePaymentStatus(p);
                  return (
                    <tr key={p.id} className="border-b border-divider last:border-0">
                      <td className={`${adminType.bodyMd} px-4 py-3`}>{card?.title ?? "Unknown project"}</td>
                      <td className={`${adminType.body} px-4 py-3`}>{p.label || "—"}</td>
                      {/* Leaving the amount blank means "use the estimate", so
                          showing a dash here contradicted the field's own
                          placeholder. The derived figure is prefixed with ~ so
                          it never reads as an agreed number. */}
                      <td className={`${adminType.monoNum} px-4 py-3`}>
                        {p.amount_expected != null ? (
                          formatMoney(Number(p.amount_expected))
                        ) : card ? (
                          <span className="text-text-dim">
                            ~{formatMoney(rowValue(p, card, rowsByCard.get(p.card_id) ?? []))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${adminType.monoNum} px-4 py-3`}>{fmtDate(p.due_on)}</td>
                      <td className={`${adminType.monoNum} px-4 py-3`}>
                        {Number(p.amount_received) > 0 ? formatMoney(Number(p.amount_received)) : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {card && (
                            <InvoiceButton
                              payment={p}
                              card={card}
                              rows={rowsByCard.get(p.card_id) ?? []}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing({ cardId: p.card_id, payment: p })}
                            className="text-[13px] text-text-muted hover:text-text-primary"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Projects with no milestone yet — the estimate-only tail */}
      <section className="mt-10">
        <h2 className={adminType.titleLg}>Not yet invoiced</h2>
        <p className={`${adminType.small} mt-1`}>
          Projects with no invoice date set yet. Recording a payment doesn&apos;t remove one from
          this list — raising an invoice does.
        </p>
        <div className="mt-4 space-y-2">
          {unbilled.length === 0 ? (
            <p className={adminType.small}>Every project with an estimate has a milestone.</p>
          ) : (
            unbilled.map(({ card, estimate }) => (
              <div
                key={card.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-surface-border bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className={`${adminType.bodyMd} truncate`}>{card.title}</p>
                  <p className={adminType.small}>{clientOf(card)} · {card.status}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className={adminType.monoNum}>~{formatMoney(estimate ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => setEditing({ cardId: card.id, payment: null })}
                    className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-[13px] text-text-body hover:border-accent-amber hover:text-text-primary"
                  >
                    <Plus size={14} /> Payment
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Per-client */}
      <section className="mt-10 mb-4">
        <h2 className={adminType.titleLg}>By client</h2>
        <div className="admin-scrollbar mt-4 overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                {["Client", "Projects", "Expected", "Received", "Avg PFH"].map(h => (
                  <th key={h} className={`${adminType.label} px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byClient.map(c => (
                <tr key={c.client} className="border-b border-divider last:border-0">
                  <td className={`${adminType.bodyMd} px-4 py-3`}>{c.client}</td>
                  <td className={`${adminType.monoNum} px-4 py-3`}>{c.projects}</td>
                  <td className={`${adminType.monoNum} px-4 py-3`}>{formatMoney(c.expected)}</td>
                  <td className={`${adminType.monoNum} px-4 py-3`}>{formatMoney(c.received)}</td>
                  <td className={`${adminType.monoNum} px-4 py-3`}>
                    {c.avgPfh != null ? formatMoney(c.avgPfh) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <PaymentFormModal
          cardId={editing.cardId}
          cardTitle={cardsById.get(editing.cardId)?.title ?? ""}
          card={cardsById.get(editing.cardId)}
          payment={editing.payment}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
