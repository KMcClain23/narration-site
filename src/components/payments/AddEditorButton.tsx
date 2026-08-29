"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminType } from "@/lib/design-tokens";

/**
 * Record an editing cost against a BOOK.
 *
 * WHY THIS EXISTS. payment_payouts.payment_id used to be NOT NULL with no
 * card_id, so recording an editor required inventing a payment to hang them
 * off. That is where the eight $0 payments came from: Dean's workaround and the
 * unreadable Money rows were one defect seen from two ends.
 *
 * So the one thing this must not do is create a payment. It posts a payout with
 * a card_id and NO payment_id — the cost is a fact about the book, and whether a
 * payment ever settles it is a separate question, answered later or never.
 */
export function AddEditorButton({ cardId, title }: { cardId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payee, setPayee] = useState("");
  const [kind, setKind] = useState("editor");
  const [amount, setAmount] = useState("");

  async function save() {
    const value = Number(amount);
    if (!payee.trim()) {
      setError("Who was paid?");
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      setError("That is not an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No payment_id. Deliberately — see the note above.
        body: JSON.stringify({
          card_id: cardId,
          payee_name: payee.trim(),
          kind,
          amount: value,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Could not record it.");
        return;
      }
      setPayee("");
      setAmount("");
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
        title={`Record an editing cost against ${title}`}
      >
        + Editor
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={payee}
        onChange={e => setPayee(e.target.value)}
        placeholder="Who?"
        className="w-28 rounded-md border border-surface-border bg-surface px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
      />
      <select
        value={kind}
        onChange={e => setKind(e.target.value)}
        className="rounded-md border border-surface-border bg-surface px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
      >
        <option value="editor">Editor</option>
        <option value="proofer">Proofer</option>
      </select>
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="Amount"
        className="w-20 rounded-md border border-surface-border bg-surface px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-md bg-accent-amber px-2.5 py-1 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
      >
        {busy ? "…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="text-[13px] text-text-muted hover:text-text-primary"
      >
        Cancel
      </button>
      {error && <span className={`${adminType.small} text-alert-red`}>{error}</span>}
    </span>
  );
}
