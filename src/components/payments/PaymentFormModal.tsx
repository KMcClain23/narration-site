"use client";

import { useMemo, useState } from "react";
import { studioRates, useStudioSettings } from "@/components/admin/useStudioSettings";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import {
  computeWaterfall,
  finishedHours,
  formatMoney,
  isOffTheTop,
  PAYOUT_KIND_LABEL,
  PAYOUT_METHODS,
  type PaymentKind,
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
  /** Share of every royalty statement owed to a co-narrator. Null means none. */
  royalty_split_percent?: number | null;
  /** Who that share goes to, for naming the payout without retyping it. */
  co_narrator?: string | null;
};

// Every field is held as a string while editing — a controlled number input
// can't represent the intermediate states typing produces ("", "12.", "-"),
// and coercing on each keystroke fights the caret. Conversion happens once,
// on submit.
type FormState = {
  kind: PaymentKind;
  period: string;
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
  /** How it left, which decides who reports it. Blank until recorded. */
  paid_via: string;
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
    kind: p?.kind ?? "fee",
    period: p?.period ?? "",
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

/**
 * Half of a royalty statement, unless the book says otherwise.
 *
 * A co-narrator on a royalty-share book splits the royalties evenly — that is
 * what the arrangement is, and it does not change from one statement to the
 * next. Requiring it to be configured before anything happens would mean
 * remembering to, on every book, before the first statement arrives; forgetting
 * is silent and looks exactly like royalties that are entirely yours.
 *
 * A number set on the book overrides it. Zero turns the split off.
 */
const DEFAULT_ROYALTY_SPLIT = 50;

function royaltySplitFor(card?: CardMoneyContext): { percent: number; payee: string } | null {
  const payee = parseCoNarrators(card?.co_narrator ?? null)[0];
  if (!payee) return null;
  const percent = card?.royalty_split_percent ?? DEFAULT_ROYALTY_SPLIT;
  if (percent <= 0) return null;
  return { percent, payee };
}

function splitAmount(base: number, percent: number): number {
  return Math.round(base * (percent / 100) * 100) / 100;
}

function toDrafts(p: PaymentRow | null, card?: CardMoneyContext): DraftPayout[] {
  const existing: DraftPayout[] = (p?.payouts ?? []).map(r => ({
    id: r.id,
    payee_name: r.payee_name,
    kind: r.kind,
    amount: r.amount ? String(r.amount) : "",
    rate_pfh: r.rate_pfh != null ? String(r.rate_pfh) : "",
    paid_on: r.paid_on ?? "",
    paid_via: r.paid_via ?? "",
  }));

  // Seeded here rather than in an effect, so the row is present on the first
  // render and there is nothing to reconcile afterwards.
  if (p?.kind !== "royalty") return existing;
  const split = royaltySplitFor(card);
  if (!split) return existing;
  if (existing.some(d => d.kind === "co_narrator")) return existing;

  const base = Number(p.amount_expected) || Number(p.amount_received) || 0;
  if (base <= 0) return existing;

  return [
    ...existing,
    {
      id: null,
      payee_name: split.payee,
      kind: "co_narrator",
      amount: splitAmount(base, split.percent).toFixed(2),
      rate_pfh: "",
      paid_on: "",
      paid_via: "",
    },
  ];
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
  /** Null when the rate could not be read — distinct from 0, which means no word count. */
  finishedHrs: number | null;
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
        const suggested =
          p.rate_pfh && finishedHrs != null && finishedHrs > 0
            ? Number(p.rate_pfh) * finishedHrs
            : null;
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
                Use {formatMoney(suggested)} — {finishedHrs?.toFixed(1) ?? "—"} finished hrs × ${p.rate_pfh}/hr
              </button>
            )}

            {/* A rate with no hours to multiply can't produce a figure. Saying
                so beats silently offering nothing, which looks like the
                calculator is broken. */}
            {/* Two different reasons the suggestion is missing, and they ask the
                user to do different things: add a word count, or fix a setting. */}
            {p.rate_pfh && finishedHrs === 0 && (
              <p className={adminType.small}>
                Can&apos;t calculate from a rate — this project has no word count, so there are no finished
                hours. Enter the amount directly, or add a word count to the project.
              </p>
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

            {/* Only once there is a date. Asking how it was sent before it has
                been sent invites an answer that turns out to be wrong. */}
            {p.paid_on && (
              <label className="flex items-center gap-2">
                <span className={`${adminType.small} shrink-0`}>Paid via</span>
                <select
                  className={inputClass}
                  value={p.paid_via}
                  onChange={e => update(i, { paid_via: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  {PAYOUT_METHODS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() =>
          onChange([...payouts, { id: null, payee_name: "", kind: "editor", amount: "", rate_pfh: "", paid_on: "", paid_via: "" }])
        }
        className="flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary"
      >
        <Plus size={14} /> Add payout
      </button>
    </div>
  );
}

/** One candidate row read out of an uploaded statement. */
type ParsedStatement = {
  period: string;
  amount_received: number;
  received_on: string;
  source: string;
  title: string;
  confidence: "high" | "medium" | "low";
  notes: string;
};

const CONFIDENCE_NOTE: Record<ParsedStatement["confidence"], string> = {
  high: "",
  medium: "check this one",
  low: "unsure — verify against the statement",
};

/**
 * Reads a statement and offers what it found. Deliberately does not save:
 * an extraction mistake must not become a financial record without being
 * looked at, so this only ever fills the form in.
 */
function StatementUpload({ onApply }: { onApply: (s: ParsedStatement) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ParsedStatement[] | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file fires a change event.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    setCandidates(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/payments/parse-document", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not read that statement.");
        return;
      }
      // Only royalty rows are useful here — the same endpoint also reads
      // invoices and processor exports, which belong in the bulk import.
      const found: ParsedStatement[] = (json.rows ?? [])
        .filter((r: { kind?: string }) => r.kind === "royalty")
        .map((r: Record<string, unknown>) => ({
          period: String(r.period ?? ""),
          amount_received: Number(r.amount) || 0,
          received_on: String(r.date ?? ""),
          source: String(r.method ?? ""),
          title: String(r.title ?? ""),
          confidence: (r.confidence as ParsedStatement["confidence"]) ?? "low",
          notes: String(r.notes ?? ""),
        }));
      if (found.length === 0) {
        setError("No payment information found in that file.");
        return;
      }
      // A single period is unambiguous — fill it in rather than making the
      // narrator confirm a list of one.
      if (found.length === 1) onApply(found[0]);
      setCandidates(found);
    } catch {
      setError("Could not read that statement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-surface-border px-3 py-3 space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-muted hover:text-text-primary">
        <Upload size={14} />
        {busy ? "Reading statement…" : "Upload a statement to fill this in"}
        <input
          type="file"
          className="hidden"
          accept=".xlsx,.xlsm,.pdf,.csv,.txt,.tsv,image/png,image/jpeg"
          onChange={handleFile}
          disabled={busy}
        />
      </label>
      <p className={adminType.small}>
        ACX Excel or CSV, a PDF remittance, or a screenshot. Nothing is saved until you press Save.
      </p>

      {error && <p className="text-[13px] text-alert-red">{error}</p>}

      {candidates && candidates.length > 1 && (
        <div className="space-y-1 pt-1">
          <p className={adminType.small}>
            Found {candidates.length} periods — add one now, then repeat for the others.
          </p>
          {candidates.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApply(c)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-background px-3 py-2 text-left hover:border-accent-amber/40"
            >
              <span className={adminType.bodyMd}>{c.period || "Unlabeled period"}</span>
              <span className={adminType.monoNum}>
                {formatMoney(c.amount_received)}
                {CONFIDENCE_NOTE[c.confidence] && (
                  <span className={`${adminType.small} ml-2`}>{CONFIDENCE_NOTE[c.confidence]}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {candidates?.length === 1 && CONFIDENCE_NOTE[candidates[0].confidence] && (
        <p className={adminType.small}>
          Filled in — {CONFIDENCE_NOTE[candidates[0].confidence]}.
        </p>
      )}
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
  const studioState = useStudioSettings();
  const studio = studioRates(studioState);
  useModalOpen(true);
  const [form, setForm] = useState<FormState>(() => toForm(payment));
  const [payouts, setPayouts] = useState<DraftPayout[]>(() => toDrafts(payment, card));
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

  /*
   * Absent, not refused — reclassified from the checkpoint list by the rule for
   * borderline sites: a number that GOES OUT is refused, a number that PRE-FILLS
   * A BOX THE USER WILL OVERWRITE is absent. Every use here is the second kind.
   * The "Use $X" button is a suggestion, the gross is a placeholder, and the
   * waterfall is an explanation of a figure Dean types. The document that goes
   * out is built by InvoiceButton, which refuses.
   *
   * Null and 0 are kept apart: 0 finished hours means the project has no word
   * count, which this form already explains and tells the user how to fix. Null
   * means the rate could not be read, which is not the user's to fix here.
   */
  const finishedHrs = finishedHours(card?.word_count ?? null, studio.wordsPerFinishedHour);

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
  const isRoyalty = form.kind === "royalty";

  /**
   * The share of this statement owed to a co-narrator, ready to record.
   *
   * Computed from what was earned rather than what has been received: the two
   * are months apart on a royalty, and the debt is created by the earning. It
   * still has to be marked paid separately, like every other payout.
   */
  const splitRule = isRoyalty ? royaltySplitFor(card) : null;
  const royaltySplit = (() => {
    if (!splitRule) return null;
    const base = Number(form.amount_expected) || Number(form.amount_received) || 0;
    if (base <= 0) return null;
    return { ...splitRule, amount: splitAmount(base, splitRule.percent) };
  })();

  /**
   * Keep the co-narrator's share in step with the figure being typed.
   *
   * The statement amount is usually entered after the row already exists, and
   * a split that was right for the old number is wrong for the new one. Only
   * an untouched share is updated: once the amount has been edited by hand, or
   * the payout has been paid, it is left exactly as it is.
   */
  const setEarned = (value: string) => {
    setForm(f => {
      if (splitRule) {
        const before = splitAmount(Number(f.amount_expected) || 0, splitRule.percent).toFixed(2);
        const after = splitAmount(Number(value) || 0, splitRule.percent).toFixed(2);
        if (before !== after) {
          setPayouts(list => {
            const i = list.findIndex(p => p.kind === "co_narrator" && !p.paid_on);
            if (i === -1) {
              // The row is created the moment there is something to split, so
              // a statement typed into a blank form still ends up split.
              return Number(value) > 0
                ? [...list, {
                    id: null,
                    payee_name: splitRule.payee,
                    kind: "co_narrator" as PayoutKind,
                    amount: after,
                    rate_pfh: "",
                    paid_on: "",
                    paid_via: "",
                  }]
                : list;
            }
            if (list[i].amount && list[i].amount !== before) return list;
            return list.map((p, j) => (j === i ? { ...p, amount: after, payee_name: p.payee_name || splitRule.payee } : p));
          });
        }
      }
      return { ...f, amount_expected: value };
    });
  };
  const format = card?.narration_format ?? null;
  const isSplit = format === "duet" || format === "dual" || format === "multicast";
  const formatLabel = format ? format.charAt(0).toUpperCase() + format.slice(1) : "Split";

  const projectGross =
    finishedHrs != null && finishedHrs > 0 && card?.pfh_rate ? finishedHrs * card.pfh_rate : 0;
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
      paid_via: p.paid_via || "",
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

  /**
   * Payouts belong to the BOOK. The payment id is passed too, because a payout
   * created here IS settled by this payment — but it is no longer what the
   * payout hangs off, and the database refuses a payment for a different book.
   */
  async function syncPayouts(paymentId: string) {
    for (const id of removedIds) {
      await fetch(`/api/payments/payouts?id=${id}`, { method: "DELETE" });
    }
    for (const p of payouts) {
      const body = {
        card_id: cardId,
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
          {/* Fee vs royalty. A royalty statement is never invoiced and its
              amount isn't knowable in advance, so the fee fields below would
              all be blanks that can never be filled. */}
          <div className="mb-4 inline-flex rounded-lg border border-surface-border p-0.5">
            {(["fee", "royalty"] as PaymentKind[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setForm(f => ({ ...f, kind: k }))}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  form.kind === k
                    ? "bg-accent-amber text-background font-medium"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {k === "fee" ? "Fee" : "Royalty share"}
              </button>
            ))}
          </div>

          {isRoyalty ? (
            <div className="max-w-md space-y-4">
              <StatementUpload
                onApply={s =>
                  setForm(f => ({
                    ...f,
                    period: s.period || f.period,
                    // An uploaded statement reports earnings; whether it has
                    // been paid is a separate fact the narrator supplies.
                    amount_expected: s.amount_received ? String(s.amount_received) : f.amount_expected,
                    received_on: s.received_on || f.received_on,
                    method: s.source || f.method,
                    notes: s.notes || f.notes,
                  }))
                }
              />
              <Field label="Period" hint="Whatever the statement covers — a quarter, a month, a payout run.">
                <input className={inputClass} value={form.period} onChange={set("period")}
                  placeholder="Q1 2026" />
              </Field>

              {/* Earned and received are separate because they usually happen
                  months apart: ACX reports earnings monthly but only pays once
                  the accrued balance clears its threshold. */}
              <Field
                label="Earned this period"
                hint="What the statement says you earned, whether or not it's been paid yet."
              >
                <input className={inputClass} value={form.amount_expected} onChange={e => setEarned(e.target.value)}
                  inputMode="decimal" placeholder="0.00" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Received"
                  hint={
                    royaltySplit
                      ? "Your share after the split — not the whole deposit."
                      : "Leave 0 until it's actually paid."
                  }
                >
                  <input className={inputClass} value={form.amount_received} onChange={set("amount_received")}
                    inputMode="decimal" placeholder="0" />
                </Field>
                <Field label="Received on">
                  <input type="date" className={inputClass} value={form.received_on} onChange={set("received_on")} />
                </Field>
              </div>

              {/* The deposit and the income are different numbers on a split
                  book, and the deposit is the one staring at you from the bank.
                  Recording it here would count the co-narrator's half as
                  earnings and tax it as yours, so the subtraction is spelled
                  out and offered rather than left to be remembered. */}
              {royaltySplit && (
                <div className="rounded-lg border border-surface-border bg-background px-3 py-2">
                  <p className={adminType.small}>
                    {formatMoney(Number(form.amount_expected) || 0)} lands, {royaltySplit.payee} takes{" "}
                    {formatMoney(royaltySplit.amount)}, so{" "}
                    <span className="text-text-body">
                      {formatMoney((Number(form.amount_expected) || 0) - royaltySplit.amount)}
                    </span>{" "}
                    is yours.
                  </p>
                  {form.amount_received !==
                    ((Number(form.amount_expected) || 0) - royaltySplit.amount).toFixed(2) && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(f => ({
                          ...f,
                          amount_received: (
                            (Number(f.amount_expected) || 0) - royaltySplit.amount
                          ).toFixed(2),
                          received_on: f.received_on || new Date().toISOString().split("T")[0],
                        }))
                      }
                      className="mt-1 text-[13px] text-accent-amber-bright hover:underline"
                    >
                      Record {formatMoney((Number(form.amount_expected) || 0) - royaltySplit.amount)} as
                      received
                    </button>
                  )}
                </div>
              )}

              <Field label="Source" hint="ACX, Findaway, the publisher — whoever the statement came from.">
                <input className={inputClass} value={form.method} onChange={set("method")} placeholder="ACX" />
              </Field>

              {/* Royalties can be split too. The fee branch has had payouts
                  since the beginning; this branch never did, so a co-narrator
                  owed half of every statement had nowhere to be recorded and
                  the money read as entirely the narrator's. */}
              <PayoutsEditor
                payouts={payouts}
                finishedHrs={finishedHrs}
                allowCoNarrator
                onChange={handleRemovePayouts}
              />

              {/* The split is already in the payouts above; this only says
                  where the figure came from, and admits when there is none. */}
              {royaltySplit && (
                <p className={adminType.small}>
                  {payouts.some(p => p.kind === "co_narrator")
                    ? `${royaltySplit.payee} takes ${royaltySplit.percent}% of this statement: ${formatMoney(royaltySplit.amount)}. Edit the amount, or remove the payout, if this one is different.`
                    : `No split on this statement — ${royaltySplit.payee} would normally take ${royaltySplit.percent}%.`}
                </p>
              )}

              <Field label="Notes">
                <textarea className={`${inputClass} min-h-[72px]`} value={form.notes} onChange={set("notes")} />
              </Field>

              <p className={adminType.small}>
                Royalties count toward what you&apos;ve collected, but never toward expected or outstanding —
                there&apos;s no invoice behind them and no way to forecast the next one.
              </p>
            </div>
          ) : (
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

            {waterfall ? (
              <WaterfallBreakdown w={waterfall} />
            ) : (
              // Rendering nothing here read as a missing feature rather than
              // as missing inputs — the breakdown needs a fee to divide, and
              // this project has neither a typed gross nor a word count and
              // rate to derive one from.
              <p className={`${adminType.small} rounded-lg border border-surface-border px-3 py-2.5`}>
                {finishedHrs == null
                  ? "No breakdown yet — the words-per-finished-hour setting could not be read, so nothing can be derived. Enter the gross fee above."
                  : finishedHrs > 0
                    ? "Enter the gross fee above to see where the money goes."
                    : "No breakdown yet — enter the gross fee above, or set this project's word count and PFH rate to have it calculated."}
              </p>
            )}
          </div>
          </div>
          )}

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
