"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "@/components/admin/board-card-utils";
import {
  derivePaymentStatus,
  formatMoney,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_PILL,
  type PaymentRow,
} from "@/lib/payments";
import { PaymentFormModal, type CardMoneyContext } from "./PaymentFormModal";

// The payment view inside a project's edit modal. Fetches on mount rather
// than taking rows as a prop: the board loads 30+ cards and only one card's
// modal is ever open, so pulling every project's payment history up front
// would be wasted on all but one of them.

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CardPaymentsPanel({
  cardId,
  cardTitle,
  card,
}: {
  cardId: string;
  cardTitle: string;
  card?: CardMoneyContext;
}) {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [editing, setEditing] = useState<{ payment: PaymentRow | null } | null>(null);
  // Bumped to re-run the fetch after a save or delete. A counter rather than
  // an exported load() so the request stays owned by the effect, which is
  // what makes the cancellation guard below possible.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await fetch(`/api/payments?cardId=${cardId}`);
      // The modal can close, or the board can switch cards, while this is in
      // flight — without the guard a late response writes into a component
      // that has moved on.
      if (cancelled) return;
      if (!res.ok) {
        setPayments([]);
        return;
      }
      const json = await res.json();
      if (cancelled) return;
      setPayments(json.payments ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  if (payments === null) {
    return <p className={adminType.small}>Loading payments…</p>;
  }

  const invoiced = payments
    .filter(p => p.invoiced_on)
    .reduce((s, p) => s + (Number(p.amount_expected) || 0), 0);
  const received = payments.reduce((s, p) => s + (Number(p.amount_received) || 0), 0);
  const outstanding = Math.max(0, invoiced - received);

  return (
    <>
      <div className="space-y-3">
        {payments.length === 0 ? (
          // Deliberately does NOT restate the estimate — the Estimated
          // Earnings block sits directly above this one, and the two figures
          // are computed differently today (that block ignores narrator
          // share, estimatedEarnings() applies it), so echoing it here would
          // put two contradictory numbers on the same screen.
          <p className={adminType.small}>No payments recorded yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span className={adminType.monoNum}>
                Invoiced <span className="text-text-primary">{formatMoney(invoiced)}</span>
              </span>
              <span className={adminType.monoNum}>
                Received <span className="text-capacity-light">{formatMoney(received)}</span>
              </span>
              {outstanding > 0 && (
                <span className={adminType.monoNum}>
                  Outstanding <span className="text-accent-amber-bright">{formatMoney(outstanding)}</span>
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              {payments.map(p => {
                const status = derivePaymentStatus(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditing({ payment: p })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-background px-3 py-2 text-left hover:border-accent-amber/40"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className={adminType.bodyMd}>{p.label || "Payment"}</span>
                      <span className={`${adminType.small} ml-2`}>due {fmtDate(p.due_on)}</span>
                    </span>
                    <span className={adminType.monoNum}>
                      {p.amount_expected != null ? formatMoney(Number(p.amount_expected)) : "—"}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${PAYMENT_STATUS_PILL[status]}`}>
                      {PAYMENT_STATUS_LABEL[status]}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setEditing({ payment: null })}
          className="flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary"
        >
          <Plus size={14} /> Add payment
        </button>
      </div>

      {editing && (
        <PaymentFormModal
          cardId={cardId}
          cardTitle={cardTitle}
          card={card}
          payment={editing.payment}
          onClose={() => setEditing(null)}
          // Refetching rather than splicing local state keeps this panel
          // honest about what the server actually stored — the API coerces
          // blank amounts and dates to NULL, so the echoed row can differ
          // from what was typed.
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onDeleted={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}
