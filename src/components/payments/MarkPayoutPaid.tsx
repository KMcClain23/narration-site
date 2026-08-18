"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, PAYOUT_METHODS, processorReported } from "@/lib/payments";

// Whichever way the last payout went, the next one usually goes the same way.
// Remembering it is the difference between a field that gets filled in and one
// that gets skipped, and a skipped one is the case the 1099 test has to guess.
const LAST_METHOD_KEY = "payout-method";

/**
 * Record that a payout has actually gone out.
 *
 * Until now nothing in the app could say so, which left the money owed to an
 * editor permanently owed: not deductible, since a cash-basis return only
 * counts what was paid, and never counted toward the $600 that makes a
 * 1099-NEC due. Both hinge on a date nobody could enter.
 */
export function MarkPayoutPaid({
  id,
  name,
  amount,
}: {
  id: string;
  name: string;
  amount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().split("T")[0]);
  const [paidVia, setPaidVia] = useState(() => {
    // Only ever read on the client. The select is behind `open`, so the server
    // and the first client render agree regardless of what is stored here.
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(LAST_METHOD_KEY) ?? "";
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paid_on: paidOn, paid_via: paidVia }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Could not record it.");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_METHOD_KEY, paidVia);
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not record it.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-text-muted hover:text-capacity-light"
      >
        Mark paid
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {/* Defaults to today, but editable: an editor is often paid weeks before
          anyone thinks to record it, and the year it lands in is what matters. */}
      <input
        type="date"
        value={paidOn}
        onChange={e => setPaidOn(e.target.value)}
        className="rounded-md border border-surface-border bg-surface px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
      />
      {/* Sent as goods and services, the network files its own 1099-K and this
          money stops being yours to report. Sent as personal, or by Zelle or
          cheque, it stays yours. Same button, different form. */}
      <select
        value={paidVia}
        onChange={e => setPaidVia(e.target.value)}
        className="rounded-md border border-surface-border bg-surface px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
      >
        <option value="">How? (optional)</option>
        {PAYOUT_METHODS.map(m => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-md bg-accent-amber px-2.5 py-1 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
        title={`Record ${formatMoney(amount)} paid to ${name || "them"}`}
      >
        {busy ? "…" : "Paid"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[13px] text-text-muted hover:text-text-primary"
      >
        Cancel
      </button>
      {paidVia && (
        <span className="text-[13px] text-text-muted">
          {processorReported(paidVia)
            ? "The network reports this one, so it stays off your 1099-NEC."
            : "Counts toward their $600."}
        </span>
      )}
      {error && <span className="text-[13px] text-alert-red">{error}</span>}
    </span>
  );
}
