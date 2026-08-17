"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import {
  agreedFee,
  finishedHours,
  invoiceAmount,
  isOffTheTop,
  narratorShare,
  type MoneyCard,
  type PaymentRow,
} from "@/lib/payments";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import { grossUpForCard } from "@/lib/business-identity";
import { type InvoiceData } from "./InvoicePDF";
import { InvoiceEditor } from "./InvoiceEditor";

type AuthorRow = { name: string; email?: string | null; location?: string | null };

/** "Ann Dahlia", "Ann Dahlia and Edward Baker", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Bills this narrator's share, plus any editing they are fronting.
 *
 * Not the whole project fee: on a duet each narrator invoices the author for
 * their own half, so billing the gross here would double-charge the author
 * once the co-narrator's invoice arrives. Editing is the exception — one
 * narrator collects the whole fee so they can pay the editor, and it appears
 * as its own line rather than being folded into the narration figure.
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

  /**
   * Editing is billed on its own line, at the full editor fee.
   *
   * The author's budget already covers it — a $300/PFH ten-hour book is $3,000,
   * of which $500 is editing and $2,500 is split between two narrators. The
   * narrator of record collects their $1,250 plus the whole $500 so they can
   * pay the editor, and bills $1,750; the co-narrator bills their $1,250
   * separately. Rolling both into one number would leave the author unable to
   * see what they are paying for, and the two narrator invoices would not
   * visibly reconcile against the budget they agreed.
   *
   * `amount` is the narrator's share *before* the deduction, so their half of
   * the editing comes off it — the same split payoutBurden() applies — and the
   * full fee is then added back as its own line.
   */
  // Only this payment's own payouts. Editing is recorded against the row that
  // fronts it, so reading every row would put the whole project's editing onto
  // each instalment invoice — the same fault that made the webhook record a
  // project total against a single payment.
  const editing = (payment.payouts ?? []).filter(
    p => isOffTheTop(p.kind) && Number(p.amount) > 0,
  );

  const editingTotal = editing.reduce((s, p) => s + Number(p.amount), 0);
  const lines: InvoiceData["lines"] = [
    { description, detail, amount: amount - editingTotal * narratorShare(card) },
  ];

  if (editingTotal > 0.005) {
    const rate = editing.find(p => p.rate_pfh)?.rate_pfh;
    lines.push({
      description: `Editing — ${card.title}`,
      detail: rate && hrs > 0 ? `${hrs.toFixed(1)} finished hours × $${rate}/PFH` : "",
      amount: editingTotal,
    });
  }

  /**
   * On split work, say so on the document.
   *
   * Each narrator bills the author for their own half, so this invoice is
   * deliberately less than the budget the author agreed. Without a line saying
   * why, the arithmetic looks wrong from their side — and the editing charge
   * looks like it might arrive twice, once from each narrator.
   *
   * A default, not a lock: the notes field stays editable before sending.
   */
  const others = parseCoNarrators(card.co_narrator);
  const split = narratorShare(card) < 1;
  const notes = split
    ? [
        others.length
          ? `This invoice covers my share of the narration. ${listNames(others)} ${
              others.length === 1 ? "invoices" : "invoice"
            } separately for theirs.`
          : "This invoice covers my share of the narration. The other narrator(s) on this title invoice separately for theirs.",
        editingTotal > 0.005
          ? "Editing covers the full title and is billed here only — it will not appear on their invoice."
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return {
    invoiceNumber,
    invoiceDate: payment.invoiced_on || new Date().toISOString().split("T")[0],
    dueDate: payment.due_on || "",
    billToName: author?.name || card.author || "",
    billToEmail: author?.email || "",
    billToLocation: author?.location || "",
    bookTitle: card.title,
    lines,
    // Only counts against the invoice when the invoice is for the narrator's
    // own share. On a gross invoice the narrator's receipt is a fraction of
    // the billed total, so showing it as paid would understate the balance.
    amountPaid: payment.amount_gross == null ? Number(payment.amount_received) || 0 : 0,
    method: payment.method,
    notes,
    ...(payment.paypal_payment_link ? { paypalLink: payment.paypal_payment_link } : {}),
    // Carried through so reopening an invoice shows the link it already has
    // rather than offering to raise a second one for the same money.
    ...(payment.stripe_payment_link
      ? {
          cardLink: payment.stripe_payment_link,
          ...(() => {
            const due = Math.max(0, amount - (payment.amount_gross == null ? Number(payment.amount_received) || 0 : 0));
            const { total, fee } = grossUpForCard(due);
            return { cardTotal: total, cardFee: fee };
          })(),
        }
      : {}),
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
          paymentId={payment.id}
        />
      )}
    </>
  );
}
