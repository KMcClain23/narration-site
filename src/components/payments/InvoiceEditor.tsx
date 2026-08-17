"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { pdf } from "@react-pdf/renderer";
import { Mail, Plus, Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import { BUSINESS } from "@/lib/business-identity";
import { InvoicePDF, type InvoiceData, type InvoiceLine } from "./InvoicePDF";

// Loaded lazily and client-only: PDFViewer touches browser APIs, same reason
// the contract builder wraps its preview in next/dynamic with ssr:false.
const InvoicePreview = dynamic(() => import("./InvoicePreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className={adminType.small}>Loading preview…</p>
    </div>
  ),
});

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const inputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${adminType.label} block mb-1.5`}>{label}</span>
      {children}
    </label>
  );
}

function safe(part: string): string {
  return part.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

/** One provider row: create it, or show the link once it exists. */
function LinkRow({
  name,
  url,
  busy,
  disabled,
  onCreate,
}: {
  name: string;
  url?: string;
  busy: boolean;
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-border bg-background px-3 py-2">
      <span className={`${adminType.small} w-28 shrink-0`}>{name}</span>
      {url ? (
        <span className="min-w-0 flex-1 truncate text-[13px] text-capacity-light" title={url}>
          {url}
        </span>
      ) : (
        <button
          type="button"
          onClick={onCreate}
          disabled={disabled}
          className="text-[13px] text-accent-amber-bright hover:underline disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create link"}
        </button>
      )}
    </div>
  );
}

/**
 * Every field on the invoice is editable before it goes out.
 *
 * The generated values are a starting point, not a commitment: a client may
 * need a different bill-to, an extra line for pickups, a rounded figure, or
 * wording the project record doesn't hold. Nothing here writes back to the
 * payment except the invoice number and the payment links, which have to stay
 * stable so the same invoice keeps its identity and its payable URLs.
 */
export function InvoiceEditor({
  initial,
  onClose,
  onNumberAssigned,
  paymentId,
}: {
  initial: InvoiceData;
  onClose: () => void;
  /** Fired once on download so the payment can persist its invoice number. */
  onNumberAssigned?: (invoiceNumber: string) => void;
  /** Needed to raise (and remember) a Stripe link against this payment. */
  paymentId?: string;
}) {
  useModalOpen(true);
  const router = useRouter();
  const [data, setData] = useState<InvoiceData>(initial);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState<"stripe" | "paypal" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Sending is deliberately two steps. The recipient, subject and body are all
  // editable and visible before anything leaves — an invoice email lands in a
  // client's inbox and cannot be recalled.
  const [composing, setComposing] = useState(false);
  const [sendTo, setSendTo] = useState(initial.billToEmail);
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = <K extends keyof InvoiceData>(key: K) => (v: InvoiceData[K]) =>
    setData(d => ({ ...d, [key]: v }));

  const setLine = (i: number, patch: Partial<InvoiceLine>) =>
    setData(d => {
      const lines = [...d.lines];
      lines[i] = { ...lines[i], ...patch };
      return { ...d, lines };
    });

  async function handleDownload() {
    setBusy(true);
    try {
      const blob = await pdf(<InvoicePDF data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe(data.invoiceNumber || "invoice")}-${safe(data.bookTitle)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onNumberAssigned?.(data.invoiceNumber);
    } finally {
      setBusy(false);
    }
  }

  const subtotal = data.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const amountDue = Math.max(0, subtotal - (Number(data.amountPaid) || 0));

  /** Build the PDF once, so the emailed file is the one that was previewed. */
  async function renderPdf(): Promise<{ blob: Blob; filename: string }> {
    const blob = await pdf(<InvoicePDF data={data} />).toBlob();
    return { blob, filename: `${safe(data.invoiceNumber || "invoice")}-${safe(data.bookTitle)}.pdf` };
  }

  /**
   * Both providers raise a link the same way, so they share a handler. The
   * route decides idempotency: asking twice returns the link already stored
   * rather than a second payable URL for the same debt.
   */
  async function raiseLink(provider: "stripe" | "paypal") {
    if (!paymentId) return;
    setLinkBusy(provider);
    setLinkError(null);
    try {
      const res = await fetch(`/api/payments/${provider}-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          amount_due: amountDue,
          title: data.bookTitle,
          invoice_number: data.invoiceNumber,
          bill_to_email: data.billToEmail,
          bill_to_name: data.billToName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLinkError(json.error ?? "Could not create the payment link.");
        return;
      }
      setData(d =>
        provider === "stripe"
          ? { ...d, cardLink: json.url, cardTotal: json.total, cardFee: json.fee }
          : { ...d, paypalLink: json.url },
      );
      // The route stored the link against the payment, but this page is still
      // holding the props it loaded before that. Without a refresh, closing and
      // reopening the invoice offers "Create link" for a link that already
      // exists — which reads as the link having been lost.
      router.refresh();
    } catch {
      setLinkError(`Could not reach ${provider === "stripe" ? "Stripe" : "PayPal"}.`);
    } finally {
      setLinkBusy(null);
    }
  }

  function openCompose() {
    setSendError(null);
    setSentTo(null);
    setSendTo(data.billToEmail);
    setSendSubject(
      `Invoice ${data.invoiceNumber || ""} — ${data.bookTitle}`.replace(/\s+—/, " —").trim(),
    );
    setSendMessage(
      `Hi ${data.billToName || "there"},\n\n` +
        `Please find attached invoice ${data.invoiceNumber || ""} for ${data.bookTitle}, ` +
        `for ${money(amountDue)}.\n\nPayment options are listed on the invoice. ` +
        `Any questions, just reply to this email.\n\nThank you,\n${BUSINESS.name}\n${BUSINESS.company}`,
    );
    setComposing(true);
  }

  async function handleSend() {
    setSendBusy(true);
    setSendError(null);
    try {
      const { blob, filename } = await renderPdf();
      const body = new FormData();
      body.append("to", sendTo.trim());
      body.append("subject", sendSubject);
      body.append("message", sendMessage);
      body.append("filename", filename);
      body.append("amount_due", String(amountDue));
      if (data.paypalLink) body.append("paypal_link", data.paypalLink);
      body.append("memo", `Invoice ${data.invoiceNumber} — ${data.bookTitle}`.trim());
      if (data.cardLink) body.append("card_link", data.cardLink);
      body.append("pdf", blob, filename);

      const res = await fetch("/api/payments/send-invoice", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setSendError(json.error ?? "Could not send the email.");
        return;
      }
      // The invoice number is now committed — it has gone to a client.
      onNumberAssigned?.(data.invoiceNumber);
      router.refresh();
      setSentTo(sendTo.trim());
      setComposing(false);
    } catch {
      setSendError("Could not send the email.");
    } finally {
      setSendBusy(false);
    }
  }

  return (
    // No click-outside-to-close. This holds a half-composed invoice — edited
    // amounts, a rewritten note, a payment link just raised — and a stray click
    // on the backdrop discarded the lot. Leaving is deliberate: Cancel or the X.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-surface-border bg-surface"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border p-5">
          <div>
            <h2 className={adminType.title}>Invoice</h2>
            <p className={`${adminType.small} mt-0.5`}>Every field is editable. Nothing leaves until you download or send.</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Form */}
          <div className="admin-scrollbar min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice #">
                <input className={inputClass} value={data.invoiceNumber}
                  onChange={e => set("invoiceNumber")(e.target.value)} />
              </Field>
              <Field label="Book title">
                <input className={inputClass} value={data.bookTitle}
                  onChange={e => set("bookTitle")(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice date">
                <input type="date" className={inputClass} value={data.invoiceDate}
                  onChange={e => set("invoiceDate")(e.target.value)} />
              </Field>
              <Field label="Due date">
                <input type="date" className={inputClass} value={data.dueDate}
                  onChange={e => set("dueDate")(e.target.value)} />
              </Field>
            </div>

            <div className="rounded-lg border border-surface-border p-3 space-y-3">
              <p className={adminType.label}>Bill to</p>
              <input className={inputClass} value={data.billToName}
                onChange={e => set("billToName")(e.target.value)} placeholder="Name or company" />
              <input className={inputClass} value={data.billToEmail}
                onChange={e => set("billToEmail")(e.target.value)} placeholder="Email" />
              <textarea className={`${inputClass} min-h-[56px]`} value={data.billToLocation}
                onChange={e => set("billToLocation")(e.target.value)}
                placeholder="Address / location — free text, appears under the email" />
            </div>

            <div className="rounded-lg border border-surface-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className={adminType.label}>Line items</p>
                <span className={adminType.monoNum}>
                  {subtotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                </span>
              </div>

              {data.lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-surface-border bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input className={inputClass} value={l.description}
                      onChange={e => setLine(i, { description: e.target.value })} placeholder="Description" />
                    <button
                      type="button"
                      onClick={() => setData(d => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                      className="shrink-0 rounded-lg p-2 text-text-muted hover:text-alert-red"
                      aria-label="Remove line"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <input className={inputClass} value={l.detail ?? ""}
                      onChange={e => setLine(i, { detail: e.target.value })}
                      placeholder="Detail (e.g. 12.8 finished hours × $300/PFH)" />
                    <input className={inputClass} value={String(l.amount)}
                      onChange={e => setLine(i, { amount: Number(e.target.value) || 0 })}
                      inputMode="decimal" placeholder="Amount" />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setData(d => ({ ...d, lines: [...d.lines, { description: "", detail: "", amount: 0 }] }))
                }
                className="flex items-center gap-1 text-[13px] text-text-muted hover:text-text-primary"
              >
                <Plus size={14} /> Add line
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Already paid">
                <input className={inputClass} value={String(data.amountPaid)}
                  onChange={e => set("amountPaid")(Number(e.target.value) || 0)}
                  inputMode="decimal" placeholder="0" />
              </Field>
              <Field label="Method">
                <input className={inputClass} value={data.method}
                  onChange={e => set("method")(e.target.value)} placeholder="PayPal, ACH, check…" />
              </Field>
            </div>

            {/* Card payments are opt-in per invoice: raising a link costs the
                payer a fee, so it shouldn't appear on every document by
                default. Venmo needs nothing here — it's printed from config. */}
            {paymentId && amountDue > 0 && (
              <Field label="Payment links">
                <div className="space-y-2">
                  <LinkRow
                    name="Card / Apple Pay"
                    url={data.cardLink}
                    busy={linkBusy === "stripe"}
                    disabled={linkBusy !== null}
                    onCreate={() => raiseLink("stripe")}
                  />
                  <LinkRow
                    name="PayPal"
                    url={data.paypalLink}
                    busy={linkBusy === "paypal"}
                    disabled={linkBusy !== null}
                    onCreate={() => raiseLink("paypal")}
                  />
                </div>
                {/* Says what the button does to the document, not just that it
                    exists. Raising a link creates a real object at the provider
                    — a live PayPal invoice, no less — so it stays opt-in, and
                    the reason only Venmo shows until then has to be visible. */}
                <p className={`${adminType.small} mt-1.5`}>
                  Venmo is on every invoice already. Card and PayPal appear on the invoice only
                  once you create their link — each adds its own processing fee on top, so you
                  net {money(amountDue)} whichever the client picks.
                </p>
                {linkError && <p className="mt-1 text-[13px] text-alert-red">{linkError}</p>}
              </Field>
            )}

            <Field label="Notes / terms">
              <textarea className={`${inputClass} min-h-[72px]`} value={data.notes}
                onChange={e => set("notes")(e.target.value)}
                placeholder="Payment terms, thank-you note, anything the client should see" />
            </Field>
          </div>

          {/* Live preview */}
          <div className="hidden min-h-0 border-l border-surface-border bg-background lg:block">
            <InvoicePreview data={data} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-surface-border p-4">
          {sentTo && (
            <span className="mr-auto text-[13px] text-capacity-light">Sent to {sentTo}.</span>
          )}
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button type="button" onClick={openCompose} disabled={busy || sendBusy}
            className="flex items-center gap-1.5 rounded-lg border border-surface-border px-4 py-2 text-sm text-text-body hover:border-accent-amber hover:text-text-primary disabled:opacity-50">
            <Mail size={14} /> Email invoice
          </button>
          <button type="button" onClick={handleDownload} disabled={busy}
            className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
            {busy ? "Building…" : "Download PDF"}
          </button>
        </div>

        {/* Compose step. Everything that will leave is on screen and editable;
            the send button is the only thing that actually dispatches. */}
        {composing && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-5">
              <h3 className={adminType.title}>Email this invoice</h3>
              <p className={`${adminType.small} mb-4`}>
                The PDF exactly as previewed goes out as an attachment. This cannot be unsent.
              </p>

              <div className="space-y-3">
                <Field label="To">
                  <input className={inputClass} value={sendTo} onChange={e => setSendTo(e.target.value)}
                    placeholder="client@example.com" />
                </Field>
                <Field label="Subject">
                  <input className={inputClass} value={sendSubject}
                    onChange={e => setSendSubject(e.target.value)} />
                </Field>
                <Field label="Message">
                  <textarea className={`${inputClass} min-h-[150px]`} value={sendMessage}
                    onChange={e => setSendMessage(e.target.value)} />
                </Field>
              </div>

              {sendError && <p className="mt-3 text-[13px] text-alert-red">{sendError}</p>}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setComposing(false)}
                  className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary">
                  Cancel
                </button>
                <button type="button" onClick={handleSend} disabled={sendBusy || !sendTo.trim()}
                  className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
                  {sendBusy ? "Sending…" : `Send to ${sendTo.trim() || "…"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
