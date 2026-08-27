"use client";

import { useEffect, useState } from "react";
import { studioRates, studioUnavailableReason, useStudioSettings } from "@/components/admin/useStudioSettings";
import { useRouter } from "next/navigation";
import { adminType } from "@/lib/design-tokens";
import {
  CLIENT_PAYMENT_METHODS,
  formatMoney,
  paymentNarratorShare,
  rowEditingCost,
  type MoneyCard,
  type PaymentRow,
} from "@/lib/payments";

/**
 * Record a payment from the row it belongs to.
 *
 * Money arriving is the most common thing that happens to an invoice, and it
 * took opening the payment editor and filling a form. Here it is a method, a
 * date and a figure already worked out.
 */
export function MarkPaidButton({
  payment,
  card,
  rows,
}: {
  payment: PaymentRow;
  card: MoneyCard;
  rows: PaymentRow[];
}) {
  const studioState = useStudioSettings();
  const studio = studioRates(studioState);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string[] | null>(null);

  /**
   * What the narrator keeps, not what the client sent.
   *
   * On a project where editing is fronted, the deposit is larger than the
   * earnings: $2,234 arrives and $638 of it belongs to the editor. Recording
   * the whole sum as income would overstate the year by the editor's fee and
   * put it in the wrong place on a return.
   */
  const editing = rowEditingCost(payment);
  /*
   * NOT refused, and not zero.
   *
   * Amount received is what actually landed in Dean's bank — a fact he knows and
   * can type. Disabling this because a setting is unreadable would mean a real
   * payment cannot be recorded, which is worse than the suggestion being missing.
   * So the rate only seeds the box, and without it the box is simply empty.
   *
   * The `?? 0` this replaces predates Stage 7 and had the same shape as the bug
   * this stage is about: "no amount could be determined" pre-filled 0.00, which
   * is a number, in a field that gets saved.
   */
  const rate = studio.wordsPerFinishedHour;
  const due = rate == null ? null : paymentNarratorShare(payment, card, rows, rate);
  const outstanding =
    due == null ? null : Math.max(0, due - (Number(payment.amount_received) || 0));

  const [amount, setAmount] = useState(outstanding ? outstanding.toFixed(2) : "");
  const [amountTouched, setAmountTouched] = useState(false);

  // The rate arrives after first paint, so the suggestion has to catch up — but
  // only into a box nobody has typed in. A user's own figure is never replaced.
  useEffect(() => {
    if (amountTouched || outstanding == null) return;
    setAmount(prev => (prev === "" ? outstanding.toFixed(2) : prev));
  }, [outstanding, amountTouched]);
  const [method, setMethod] = useState("");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().split("T")[0]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: payment.id,
          amount_received: Number(amount) || 0,
          received_on: receivedOn,
          ...(method ? { method } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not record the payment.");
        return;
      }
      // The PATCH retires any live payment links once the invoice settles, and
      // says which — worth showing, since it is the reason a card link the
      // client still holds stops working.
      setClosed(json.links?.closed ?? []);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-surface-border px-2.5 py-1.5 text-[13px] text-text-body hover:border-capacity-light hover:text-text-primary"
        >
          Mark paid
        </button>
        {closed?.length ? (
          <span className={adminType.small}>{closed.join(" · ")}</span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-border bg-background px-3 py-2">
      <label className="block">
        <span className={`${adminType.label} block mb-1`}>You keep</span>
        <input
          value={amount}
          onChange={e => {
            setAmountTouched(true);
            setAmount(e.target.value);
          }}
          inputMode="decimal"
          className="w-24 rounded-md border border-surface-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent-amber focus:outline-none"
        />
      </label>

      <label className="block">
        <span className={`${adminType.label} block mb-1`}>How</span>
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="rounded-md border border-surface-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent-amber focus:outline-none"
        >
          <option value="">—</option>
          {CLIENT_PAYMENT_METHODS.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={`${adminType.label} block mb-1`}>When</span>
        <input
          type="date"
          value={receivedOn}
          onChange={e => setReceivedOn(e.target.value)}
          className="rounded-md border border-surface-border bg-surface px-2 py-1.5 text-sm text-text-primary focus:border-accent-amber focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-lg bg-accent-amber px-3 py-1.5 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 py-1.5 text-[13px] text-text-muted hover:text-text-primary"
      >
        Cancel
      </button>

      {editing > 0.005 && due != null && (
        <p className={`${adminType.small} w-full`}>
          The client sends {formatMoney(due + editing)}; {formatMoney(editing)} of it is the
          editor&rsquo;s, so only your {formatMoney(due)} counts as earnings.
        </p>
      )}
      {/* The split explanation needs the rate; the box above does not. Saying why
          the suggestion is missing keeps an empty field from reading as "nothing
          is owed", which is the one wrong conclusion available here. */}
      {due == null && (
        <p className={`${adminType.small} w-full`}>
          {studioUnavailableReason(studioState)} Enter what actually arrived.
        </p>
      )}
      {error && <p className="w-full text-[13px] text-alert-red">{error}</p>}
    </div>
  );
}
