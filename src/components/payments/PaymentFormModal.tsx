"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import {
  computeWaterfall,
  finishedHours,
  formatMoney,
  isOffTheTop,
  PAYOUT_KIND_LABEL,
  type PayoutKind,
  type PayoutRow,
  type PaymentRow,
  type Waterfall,
} from "@/lib/payments";

/** The project fields the money maths needs, without dragging in all of MoneyCard. */
export type CardMoneyContext = {
  word_count: number | null;
  pfh_rate: number | null;
  narration_format: string | null;
  narrator_share_percent: number | null;
};

// Every field is held as a string while editing — a controlled number input
// can't represent the intermediate states typing produces ("", "12.", "-"),
// and coercing on each keystroke fights the caret. Conversion happens once,
// on submit.
type FormState = {
  label: string;
  amount_expected: string;
  due_on: string;
  invoiced_on: string;
  invoice_number: string;
  amount_received: string;
  amount_gross: string;
  received_on: string;
  method: string;
  notes: string;
};

/** A payout being edited. `id` is null until it has been saved. */
type DraftPayout = {
  id: string | null;
  payee_name: string;
  kind: PayoutKind;
  amount: string;
  rate_pfh: string;
  /** Blank until the money actually leaves — an unpaid payout is a liability. */
  paid_on: string;
};

const MILESTONE_SUGGESTIONS = [
  "On delivery",
  "Deposit",
  "On signing",
  "First 15 approval",
  "Pickups",
  "Final payment",
];

const KIND_ORDER: PayoutKind[] = ["editor", "proofer", "co_narrator", "agent", "other"];

function toForm(p: PaymentRow | null): FormState {
  return {
    label: p?.label ?? "",
    amount_expected: p?.amount_expected != null ? String(p.amount_expected) : "",
    due_on: p?.due_on ?? "",
    invoiced_on: p?.invoiced_on ?? "",
    invoice_number: p?.invoice_number ?? "",
    amount_received: p?.amount_received ? String(p.amount_received) : "",
    amount_gross: p?.amount_gross != null ? String(p.amount_gross) : "",
    received_on: p?.received_on ?? "",
    method: p?.method ?? "",
    notes: p?.notes ?? "",
  };
}

function toDrafts(p: PaymentRow | null): DraftPayout[] {
  return (p?.payouts ?? []).map(r => ({
    id: r.id,
    payee_name: r.payee_name,
    kind: r.kind,
    amount: r.amount ? String(r.amount) : "",
    rate_pfh: r.rate_pfh != null ? String(r.rate_pfh) : "",
    paid_on: r.paid_on ?? "",
  }));
}

const inputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${adminType.label} block mb-1.5`}>{label}</span>
      {children}
      {hint && <span className={`${adminType.small} mt-1 block`}>{hint}</span>}
    </label>
  );
}

function PayoutsEditor({
  payouts,
  finishedHrs,
  allowCoNarrator,
  onChange,
}: {
  payouts: DraftPayout[];
  finishedHrs: number;
  /** False on solo work, where paying a co-narrator is not a thing. */
  allowCoNarrator: boolean;
  onChange: (next: DraftPayout[]) => void;
}) {
  const kinds = allowCoNarrator ? KIND_ORDER : KIND_ORDER.filter(k => k !== "co_narrator");
  const update = (i: number, patch: Partial<DraftPayout>) => {
    const next = [...payouts];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className={adminType.label}>Payouts</p>

      {payouts.length === 0 && (
        <p className={adminType.small}>No payouts — nothing comes out of this payment.</p>
      )}

      {payouts.map((p, i) => {
        // A per-finished-hour rate fills the amount in, but the amount stays
        // editable and authoritative: once money has actually moved it must
        // not shift because a word count was corrected later.
        const suggested = p.rate_pfh && finishedHrs > 0 ? Number(p.rate_pfh) * finishedHrs : null;
        return (
          <div key={p.id ?? `new-${i}`} className="rounded-lg border border-surface-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={p.kind}
                onChange={e => update(i, { kind: e.target.value as PayoutKind })}
                className={`${inputClass} w-auto flex-1`}
              >
                {kinds.map(k => (
                  <option key={k} value={k}>
                    {PAYOUT_KIND_LABEL[k]}{isOffTheTop(k) ? " — off the top" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(payouts.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg p-2 text-text-muted hover:text-alert-red"
                aria-label="Remove payout"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <input
              className={inputClass}
              value={p.payee_name}
              onChange={e => update(i, { payee_name: e.target.value })}
              placeholder="Who is paid"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputClass}
                value={p.rate_pfh}
                onChange={e => update(i, { rate_pfh: e.target.value })}
                inputMode="decimal"
                placeholder="Rate $/PFH"
              />
              <input
                className={inputClass}
                value={p.amount}
                onChange={e => update(i, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="Amount"
              />
            </div>

            {suggested != null && (
              <button
                type="button"
                onClick={() => update(i, { amount: suggested.toFixed(2) })}
                className="text-[13px] text-accent-amber-bright hover:underline"
              >
                Use {formatMoney(suggested)} — {finishedHrs.toFixed(1)} finished hrs × ${p.rate_pfh}/hr
              </button>
            )}

            {/* Blank means still owed. Without this the page counted an
                unpaid editor as money that had already left the account. */}
            <label className="flex items-center gap-2">
              <span className={`${adminType.small} shrink-0`}>Paid on</span>
              <input
                type="date"
                className={inputClass}
                value={p.paid_on}
                onChange={e => update(i, { paid_on: e.target.value })}
              />
            </label>
            {!p.paid_on && Number(p.amount) > 0 && (
              <p className={adminType.small}>Leave blank until you&apos;ve actually paid them — counts as owed.</p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() =>
          onChange([...payouts, { id: null, payee_name: "", kind: "editor", amount: "", rate_pfh: "", paid_on: "" }])
        }
        className="flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary"
      >
        <Plus size={14} /> Add payout
      </button>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={strong ? adminType.bodyMd : adminType.small}>{label}</span>
      <span className={`${adminType.monoNum} ${strong ? "text-text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function WaterfallBreakdown({ w }: { w: Waterfall }) {
  return (
    <div className="rounded-lg border border-accent-amber/15 bg-accent-amber/5 px-3 py-2.5 space-y-1">
      <p className={`${adminType.label} text-accent-amber-bright/70`}>Where the money goes</p>
      <Row label="Client pays" value={formatMoney(w.gross)} />
      {w.offTheTop > 0 && <Row label="Less production (off the top)" value={`− ${formatMoney(w.offTheTop)}`} />}
      {w.offTheTop > 0 && <Row label="Split between narrators" value={formatMoney(w.distributable)} />}
      {/* At 100% the "share" line just restates the line above it — there is
          nobody to share with on a solo project. */}
      {w.sharePercent !== 100 && (
        <Row label={`Your share (${w.sharePercent}%)`} value={formatMoney(w.yourShare)} />
      )}
      {w.toCoNarrators > 0 && <Row label="To co-narrator(s)" value={formatMoney(w.toCoNarrators)} />}
      {w.fromYourShare > 0 && <Row label="Less from your share" value={`− ${formatMoney(w.fromYourShare)}`} />}
      <div className="border-t border-accent-amber/15 pt-1">
        <Row label="You keep" value={formatMoney(w.yourNet)} strong />
      </div>
    </div>
  );
}

export function PaymentFormModal({
  cardId,
  cardTitle,
  card,
  payment,
  onClose,
  onSaved,
  onDeleted,
}: {
  cardId: string;
  cardTitle: string;
  card?: CardMoneyContext;
  payment: PaymentRow | null;
  onClose: () => void;
  onSaved: (p: PaymentRow) => void;
  onDeleted: (id: string) => void;
}) {
  useModalOpen(true);
  const [form, setForm] = useState<FormState>(() => toForm(payment));
  const [payouts, setPayouts] = useState<DraftPayout[]>(() => toDrafts(payment));
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  /**
   * Setting an invoice date is the moment an invoice starts existing, so that
   * is when a number is reserved — not on every payment. Most payments here
   * are informal (Venmo from an indie author) and never get invoiced at all;
   * numbering those would manufacture paperwork and burn sequence numbers.
   * Only fills a blank field, so a hand-entered number is never overwritten.
   */
  async function onInvoicedOnChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setForm(f => ({ ...f, invoiced_on: value }));
    if (!value || form.invoice_number.trim()) return;

    const res = await fetch("/api/payments/next-invoice-number");
    if (!res.ok) return;
    const { invoice_number } = await res.json();
    // Re-checked after the await: the field may have been typed into while
    // the request was in flight, and the user's own value wins.
    setForm(f => (f.invoice_number.trim() ? f : { ...f, invoice_number }));
  }

  const finishedHrs = finishedHours(card?.word_count ?? null);

  const sharePercent =
    card?.narrator_share_percent != null
      ? card.narrator_share_percent
      : card?.narration_format === "duet" || card?.narration_format === "dual"
        ? 50
        : 100;

  // The whole-project fee, which is what a client is billed — distinct from
  // the narrator's own estimate shown elsewhere on this form.
  // Solo work has nobody to split with, so the co-narrator half of this
  // section is noise there — the fee is simply the narrator's, minus costs.
  const format = card?.narration_format ?? null;
  const isSplit = format === "duet" || format === "dual" || format === "multicast";
  const formatLabel = format ? format.charAt(0).toUpperCase() + format.slice(1) : "Split";

  const projectGross = finishedHrs > 0 && card?.pfh_rate ? finishedHrs * card.pfh_rate : 0;
  const grossPlaceholder = projectGross > 0 ? `e.g. ${projectGross.toFixed(0)}` : "e.g. 3000";

  const waterfall = useMemo(() => {
    const gross = Number(form.amount_gross) || projectGross;
    if (!gross) return null;
    const rows: PayoutRow[] = payouts.map((p, i) => ({
      id: p.id ?? `draft-${i}`,
      payment_id: payment?.id ?? "",
      payee_name: p.payee_name,
      kind: p.kind,
      amount: Number(p.amount) || 0,
      rate_pfh: p.rate_pfh ? Number(p.rate_pfh) : null,
      paid_on: p.paid_on || null,
      notes: "",
    }));
    return computeWaterfall(gross, sharePercent, rows);
  }, [form.amount_gross, projectGross, payouts, sharePercent, payment?.id]);

  function handleRemovePayouts(next: DraftPayout[]) {
    const stillPresent = new Set(next.map(p => p.id).filter(Boolean));
    const dropped = payouts
      .map(p => p.id)
      .filter((id): id is string => Boolean(id) && !stillPresent.has(id));
    if (dropped.length) setRemovedIds(prev => [...prev, ...dropped]);
    setPayouts(next);
  }

  /** Payouts can only be written once the payment has an id to hang off. */
  async function syncPayouts(paymentId: string) {
    for (const id of removedIds) {
      await fetch(`/api/payments/payouts?id=${id}`, { method: "DELETE" });
    }
    for (const p of payouts) {
      const body = {
        payment_id: paymentId,
        payee_name: p.payee_name,
        kind: p.kind,
        amount: p.amount,
        rate_pfh: p.rate_pfh,
        paid_on: p.paid_on,
        ...(p.id ? { id: p.id } : {}),
      };
      await fetch("/api/payments/payouts", {
        method: p.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = { ...form, card_id: cardId, ...(payment ? { id: payment.id } : {}) };

    const res = await fetch("/api/payments", {
      method: payment ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok) {
      setSaving(false);
      setError(json.error ?? "Could not save.");
      return;
    }

    await syncPayouts(json.payment.id);
    setSaving(false);
    onSaved(json.payment);
  }

  async function handleDelete() {
    if (!payment) return;
    setSaving(true);
    const res = await fetch(`/api/payments?id=${payment.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    onDeleted(payment.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="admin-scrollbar max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-surface-border bg-surface p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={adminType.title}>{payment ? "Edit payment" : "Add payment"}</h2>
            <p className={`${adminType.small} mt-0.5`}>{cardTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          {/* Two columns from md up: the payment itself on the left, the
              gross/payouts breakdown on the right. Stacked they run past the
              viewport and the waterfall — the thing worth looking at while
              typing — falls below the fold. */}
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          <div className="space-y-4">
          <Field
            label="What's this payment for?"
            hint="Only matters when a project pays in more than one instalment. One payment? Leave it."
          >
            <input className={inputClass} value={form.label} onChange={set("label")}
              placeholder="On delivery" list="milestone-suggestions" />
            <datalist id="milestone-suggestions">
              {MILESTONE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Your share expected">
              <input className={inputClass} value={form.amount_expected} onChange={set("amount_expected")}
                inputMode="decimal" placeholder="Leave blank to use estimate" />
            </Field>
            <Field label="Due">
              <input type="date" className={inputClass} value={form.due_on} onChange={set("due_on")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoiced on">
              <input type="date" className={inputClass} value={form.invoiced_on} onChange={onInvoicedOnChange} />
            </Field>
            <Field label="Invoice #" hint="Fills in when you set an invoice date.">
              <input className={inputClass} value={form.invoice_number} onChange={set("invoice_number")}
                placeholder="Blank for informal payments" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Your share received">
              <input className={inputClass} value={form.amount_received} onChange={set("amount_received")}
                inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Received on">
              <input type="date" className={inputClass} value={form.received_on} onChange={set("received_on")} />
            </Field>
          </div>

          <Field label="Method">
            <input className={inputClass} value={form.method} onChange={set("method")} placeholder="PayPal, ACH, check…" />
          </Field>

          <Field label="Notes">
            <textarea className={`${inputClass} min-h-[72px]`} value={form.notes} onChange={set("notes")} />
          </Field>
          </div>

          {/* Gross + payouts. Skipped entirely on a solo project with no
              editor: leave gross blank and add no payouts, and the waterfall
              collapses to the plain expected/received pair above. */}
          <div className="rounded-lg border border-surface-border px-4 py-3 space-y-4 self-start">
            <p className={adminType.label}>{isSplit ? "Gross & payouts" : "Gross & costs"}</p>
            <p className={adminType.small}>
              {isSplit
                ? `${formatLabel} — the client pays one fee and it's divided. Add an editor here too if one is paid out of it.`
                : "Solo project. Only needed if someone — an editor, a proofer — is paid out of the fee."}
            </p>

            <Field
              label="Gross — what the client pays"
              hint={
                isSplit
                  ? "Whole fee, all narrators, before anything comes out. Invoices bill this."
                  : "The whole fee, before costs. Invoices bill this."
              }
            >
              <input className={inputClass} value={form.amount_gross} onChange={set("amount_gross")}
                inputMode="decimal" placeholder={grossPlaceholder} />
            </Field>

            <PayoutsEditor
              payouts={payouts}
              finishedHrs={finishedHrs}
              allowCoNarrator={isSplit}
              onChange={handleRemovePayouts}
            />

            {waterfall && <WaterfallBreakdown w={waterfall} />}
          </div>
          </div>

          {error && <p className="mt-4 text-sm text-alert-red">{error}</p>}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-surface-border pt-4">
            {payment ? (
              <button type="button" onClick={handleDelete} disabled={saving}
                className="text-sm text-alert-red hover:underline disabled:opacity-50">
                Delete
              </button>
            ) : <span />}

            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
