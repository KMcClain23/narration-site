"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/payments";

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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paid_on: paidOn }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Could not record it.");
        return;
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
      {error && <span className="text-[13px] text-alert-red">{error}</span>}
    </span>
  );
}
