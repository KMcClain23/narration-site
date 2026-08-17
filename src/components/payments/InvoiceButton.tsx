"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { agreedFee, finishedHours, invoiceAmount, type MoneyCard, type PaymentRow } from "@/lib/payments";
import { type InvoiceData } from "./InvoicePDF";
import { InvoiceEditor } from "./InvoiceEditor";

type AuthorRow = { name: string; email?: string | null; location?: string | null };

/**
 * Bills the GROSS, not the narrator's share.
 *
 * On a duet the client owes the whole fee; what the narrator keeps after the
 * editor and the co-narrator is an internal matter with no place on the
 * client's invoice.
 */
export function buildInvoice(
  payment: PaymentRow,
  card: MoneyCard,
  rows: PaymentRow[],
  author: AuthorRow | null,
  invoiceNumber: string,
): InvoiceData {
  const amount = invoiceAmount(payment, card, rows) ?? 0;
  const hrs = finishedHours(card.word_count);
  const recast = card.status === "recast";

  // Not billed by the finished hour — those hours were never delivered — so
  // quoting "6.6 finished hours × $250/PFH" beside a half payment would invite
  // exactly the query you don't want on this invoice. State the basis instead:
  // what share of the agreed fee this is.
  const agreed = agreedFee(card);
  // Only when both figures are denominated the same way. amount_gross is the
  // whole client-side fee while agreedFee() is the narrator's share, so on a
  // split project the percentage would be wrong — and wrong on a document
  // going to the author.
  const pct =
    recast && agreed && agreed > 0 && payment.amount_gross == null
      ? Math.round((amount / agreed) * 100)
      : null;

  const detail = recast
    ? pct != null
      ? `Partial project fee — ${pct}% of the agreed fee`
      : "Partial project fee"
    : hrs > 0 && card.pfh_rate
      ? `${hrs.toFixed(1)} finished hours × $${card.pfh_rate}/PFH`
      : "";

  // "Recast" stays internal to the tracker. The author is being billed for a
  // share of the agreed fee, and the reason the project ended is not something
  // the invoice line has to relitigate.
  const description = payment.label
    ? `Audiobook narration — ${card.title} (${payment.label})`
    : `Audiobook narration — ${card.title}`;

  return {
    invoiceNumber,
    invoiceDate: payment.invoiced_on || new Date().toISOString().split("T")[0],
    dueDate: payment.due_on || "",
    billToName: author?.name || card.author || "",
    billToEmail: author?.email || "",
    billToLocation: author?.location || "",
    bookTitle: card.title,
    lines: [{ description, detail, amount }],
    // Only counts against the invoice when the invoice is for the narrator's
    // own share. On a gross invoice the narrator's receipt is a fraction of
    // the billed total, so showing it as paid would understate the balance.
    amountPaid: payment.amount_gross == null ? Number(payment.amount_received) || 0 : 0,
    method: payment.method,
    notes: "",
  };
}

export function InvoiceButton({
  payment,
  card,
  rows,
  className,
  label = "Invoice",
}: {
  payment: PaymentRow;
  card: MoneyCard;
  rows: PaymentRow[];
  className?: string;
  /** "Invoice copy" on settled work, where the document already exists. */
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvoiceData | null>(null);

  async function handleOpen() {
    setBusy(true);
    setError(null);
    try {
      // Reserve a number only if this payment doesn't already carry one —
      // reopening the editor must not consume a fresh number, or the sequence
      // gains holes every time an invoice is looked at.
      let invoiceNumber = payment.invoice_number;
      if (!invoiceNumber) {
        const res = await fetch("/api/payments/next-invoice-number");
        if (res.ok) invoiceNumber = (await res.json()).invoice_number;
      }

      let author: AuthorRow | null = null;
      if (card.author) {
        const res = await fetch("/api/authors");
        if (res.ok) {
          const json = await res.json();
          const key = card.author.trim().toLowerCase();
          author =
            (json.authors ?? []).find((a: AuthorRow) => a.name?.trim().toLowerCase() === key) ?? null;
        }
      }

      setDraft(buildInvoice(payment, card, rows, author, invoiceNumber));
    } catch {
      setError("Could not prepare the invoice.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Persisted on download rather than on open: a number that was looked at and
   * abandoned shouldn't be claimed. Only fills a blank — an existing number is
   * never overwritten, even if it was edited by hand for this one document.
   */
  async function handleNumberAssigned(invoiceNumber: string) {
    if (payment.invoice_number || !invoiceNumber) return;
    await fetch("/api/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payment.id, invoice_number: invoiceNumber }),
    });
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          disabled={busy}
          className={
            className ??
            "flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary disabled:opacity-50"
          }
        >
          <FileText size={14} /> {busy ? "Opening…" : label}
        </button>
        {error && <span className="text-[13px] text-alert-red">{error}</span>}
      </span>

      {draft && (
        <InvoiceEditor
          initial={draft}
          onClose={() => setDraft(null)}
          onNumberAssigned={handleNumberAssigned}
        />
      )}
    </>
  );
}
