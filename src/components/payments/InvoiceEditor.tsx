"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { pdf } from "@react-pdf/renderer";
import { Mail, Plus, Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import { BUSINESS, grossUpForCard } from "@/lib/business-identity";
import { CLIENT_PAYMENT_METHODS } from "@/lib/payments";
import { dateOnlyToPacificNoon, formatFullDate } from "@/lib/timezone";
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={`${adminType.label} block mb-1.5`}>{label}</span>
      {children}
      {hint && <span className={`${adminType.small} mt-1 block`}>{hint}</span>}
    </label>
  );
}

/** "August 31, 2026" — matching how the PDF prints its own dates. */
function fmtDueDate(d: string): string {
  try {
    return formatFullDate(dateOnlyToPacificNoon(d) ?? d);
  } catch {
    return d;
  }
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
  onIssued,
  paymentId,
  wholeProject,
  coNarratorEmails = [],
  isPartial = false,
  savedHours,
  savedBillingWhole,
  initialHours = 0,
  canRecompute = false,
  recompute,
}: {
  initial: InvoiceData;
  onClose: () => void;
  /** Fired on download or send so the payment can persist what was issued. */
  onIssued?: (next: { invoiceNumber: string; invoicedOn?: string; dueOn?: string }) => void;
  /** Needed to raise (and remember) a Stripe link against this payment. */
  paymentId?: string;
  /** The same invoice billed for the whole project, when that is a choice. */
  wholeProject?: { lines: InvoiceData["lines"]; notes: string };
  /** Addresses for the other narrators, to copy in on a whole-project invoice. */
  coNarratorEmails?: string[];
  /** True for a cancellation or part-project fee, where nothing is complete. */
  isPartial?: boolean;
  /** Hours as last saved, which outrank the estimate. */
  savedHours?: string;
  /** The whole-project choice as last saved. */
  savedBillingWhole?: boolean;
  /** Finished hours as estimated from word count, to start the field at. */
  initialHours?: number;
  /** False when the project has no PFH rate, so hours cannot rebuild anything. */
  canRecompute?: boolean;
  /** Rebuilds both shapes from a corrected runtime. */
  recompute?: (hours: number) => {
    share: { lines: InvoiceData["lines"]; notes: string };
    wholeProject: { lines: InvoiceData["lines"]; notes: string } | null;
  };
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
  const [sendCc, setSendCc] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [billingWhole, setBillingWhole] = useState(savedBillingWhole ?? false);
  // Captured so switching back restores what was generated, not whatever the
  // other shape last left behind. Replaced wholesale when the hours change,
  // since both shapes are rebuilt from them.
  const [shapes, setShapes] = useState({
    share: { lines: initial.lines, notes: initial.notes },
    wholeProject: wholeProject ?? null,
  });

  // Held as text, not a number: "12." is a state a person passes through while
  // typing 12.9, and coercing it to 12 mid-keystroke fights them.
  // A saved runtime is a measurement someone took; the estimate is a guess.
  const [hours, setHours] = useState(savedHours ?? (initialHours ? initialHours.toFixed(1) : ""));

  /**
   * Rebuild the invoice from a corrected runtime.
   *
   * The word-count estimate is made before recording and is routinely out by a
   * tenth of an hour; the delivered file settles it. Both the fee and the
   * editing move, because both are billed per finished hour — recomputing only
   * the fee would quietly shift who absorbs the difference.
   */
  function applyHours(text: string) {
    setHours(text);
    const parsed = Number(text);
    if (!recompute || !Number.isFinite(parsed) || parsed <= 0) return;

    const next = recompute(parsed);
    setShapes({ share: next.share, wholeProject: next.wholeProject });
    setData(d => ({
      ...d,
      lines: billingWhole && next.wholeProject ? next.wholeProject.lines : next.share.lines,
      notes: billingWhole && next.wholeProject ? next.wholeProject.notes : next.share.notes,
    }));
  }

  /**
   * Swap between billing this narrator's share and billing the whole project.
   *
   * Replaces the generated lines and note wholesale, because that is what the
   * choice means — but only those. A rewritten bill-to, a due date, a raised
   * payment link all survive, since none of them depend on which shape the
   * invoice takes.
   */
  async function switchShape(whole: boolean) {
    if (!shapes.wholeProject) return;
    setBillingWhole(whole);
    setData(d => ({
      ...d,
      lines: whole ? shapes.wholeProject!.lines : shapes.share.lines,
      notes: whole ? shapes.wholeProject!.notes : shapes.share.notes,
    }));
    // The amount just changed, so any link raised against the old one now
    // charges the wrong figure to whoever still holds the URL.
    await voidLinks();
  }

  /**
   * Retire links that no longer match what the invoice bills.
   *
   * Silent when there are none to retire. Refuses, loudly, if a provider says
   * its link was already paid — that invoice needs recording, not re-issuing,
   * and voiding would throw away the only trace of how the money arrived.
   */
  async function voidLinks() {
    if (!paymentId || (!data.cardLink && !data.paypalLink)) return;
    setLinkError(null);
    try {
      const res = await fetch("/api/payments/void-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLinkError(json.error ?? "Could not retire the old payment links.");
        return;
      }
      setData(d => ({
        ...d,
        cardLink: undefined,
        cardTotal: undefined,
        cardFee: undefined,
        paypalLink: undefined,
      }));
      router.refresh();
    } catch {
      setLinkError("Could not reach the payment providers to retire the old links.");
    }
  }

  /**
   * Keep the draft, debounced.
   *
   * Every edit here is a decision — a corrected runtime, a reworded note, a
   * rounded figure — and until now all of them were discarded on close. Saved a
   * beat after typing stops rather than on every keystroke, so a long note is
   * one write instead of two hundred.
   *
   * The payment links are deliberately not saved: they live on the payment row,
   * are raised and voided against the providers, and a copy here could
   * resurrect one that had since been retired.
   */
  useEffect(() => {
    if (!paymentId) return;
    const timer = setTimeout(() => {
      const rest: Partial<InvoiceData> = { ...data };
      delete rest.cardLink;
      delete rest.cardTotal;
      delete rest.cardFee;
      delete rest.paypalLink;
      void fetch("/api/payments/invoice-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, draft: { data: rest, hours, billingWhole } }),
      }).catch(() => {
        // A draft that fails to save is not worth interrupting the work over —
        // the invoice in front of them is unaffected.
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [paymentId, data, hours, billingWhole]);

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
      onIssued?.({ invoiceNumber: data.invoiceNumber, dueOn: data.dueDate });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const subtotal = data.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const amountDue = Math.max(0, subtotal - (Number(data.amountPaid) || 0));

  /**
   * What the raised link actually charges, asked of Stripe rather than guessed.
   *
   * Inferring it from the invoice was the bug behind a warning that reported a
   * total appearing on neither the invoice nor the link: a link's amount is
   * fixed at creation, while the figure it was inferred from moves with every
   * edit.
   */
  useEffect(() => {
    if (!paymentId || !data.cardLink) return;
    let cancelled = false;
    void fetch(`/api/payments/stripe-link?payment_id=${paymentId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled || j?.total == null) return;
        setData(d => ({ ...d, cardTotal: j.total, cardFee: Math.round((j.total - amountDue) * 100) / 100 }));
      })
      .catch(() => {
        // Keeping the previous figure is better than clearing it.
      });
    return () => {
      cancelled = true;
    };
    // Only when the link itself changes: the amount is a property of the link,
    // not of whatever the invoice currently says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, data.cardLink]);

  // A card link fixes its amount at creation. If the invoice now bills
  // something else, the link is charging a figure this document no longer
  // claims — to anyone still holding the URL.
  const linkStale =
    Boolean(data.cardLink) &&
    data.cardTotal != null &&
    Math.abs(grossUpForCard(amountDue).total - data.cardTotal) > 0.005;

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
    // Copied in only when this invoice bills their work too. On a share invoice
    // the other narrators are billing the author themselves, and forwarding
    // them someone else's invoice serves nothing.
    setSendCc(billingWhole ? coNarratorEmails.join(", ") : "");
    setSendSubject(
      `Invoice ${data.invoiceNumber || ""} — ${data.bookTitle}`.replace(/\s+—/, " —").trim(),
    );
    // First name only. "Hi Lea Rose," is how a mailshot opens, not how someone
    // you have worked with for months does.
    const firstName = data.billToName.trim().split(/\s+/)[0] || "there";
    const due = data.dueDate ? `, due ${fmtDueDate(data.dueDate)}` : "";
    const ref = data.invoiceNumber ? `Invoice ${data.invoiceNumber} is attached` : "Invoice attached";

    // Finishing a book is a good day for the author too, and the invoice is
    // usually the message that tells them it's done. Worth a sentence.
    //
    // Suppressed on a partial fee: a project that ended early is not something
    // to congratulate anyone on, and "I hope you love how it turned out" beside
    // a cancellation charge would read as tone-deaf.
    const opening = isPartial
      ? ""
      // A closed statement, not an opening. "I hope you love how it turned
      // out" invites a verdict, and invites it in the same breath as asking to
      // be paid — the one message where a reply beginning "well, actually"
      // costs money.
      : `${data.bookTitle} is finished! Thank you for trusting me with it, and it was a pleasure working with you.\n\n`;

    setSendMessage(
      `Hi ${firstName},\n\n` +
        opening +
        // One sentence carrying everything that matters: what it is, how much,
        // and by when. The old draft said "for His For Christmas, for $367.02"
        // and left the due date off the email entirely.
        `${ref}: ${money(amountDue)}${isPartial ? ` for ${data.bookTitle}` : ""}${due}. ` +
        `You can pay using the buttons below, or the details on the invoice itself.\n\n` +
        `Thanks,\n${BUSINESS.name}\n${BUSINESS.company}`,
    );
    setComposing(true);
  }

  // How many people actually receive this, so the send button can say so.
  const ccCount = sendCc
    .split(",")
    .map(a => a.trim())
    .filter(Boolean).length;

  async function handleSend() {
    setSendBusy(true);
    setSendError(null);
    try {
      const { blob, filename } = await renderPdf();
      const body = new FormData();
      body.append("to", sendTo.trim());
      body.append("cc", sendCc.trim());
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
      onIssued?.({
        invoiceNumber: data.invoiceNumber,
        invoicedOn: data.invoiceDate,
        dueOn: data.dueDate,
      });
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

              {/* The delivered runtime, which settles what the word-count
                  estimate could only guess at. */}
              {canRecompute && (
                <div className="mb-3">
                  <Field
                    label="Finished hours"
                    hint="Rebuilds the fee and the editing from your rates. Leave as-is to bill the estimate."
                  >
                    <input
                      className={`${inputClass} max-w-[140px]`}
                      value={hours}
                      onChange={e => applyHours(e.target.value)}
                      inputMode="decimal"
                      placeholder="12.9"
                    />
                  </Field>
                </div>
              )}

              {/* Only offered on split work — there is no "whole project" to
                  bill differently when one narrator is the whole project. */}
              {shapes.wholeProject && (
                <label className="mb-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={billingWhole}
                    onChange={e => void switchShape(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-border bg-background text-accent-amber"
                  />
                  <span>
                    <span className={adminType.body}>Bill the whole project</span>
                    <span className={`${adminType.small} block`}>
                      Everything the author owes for this title, for you to pay the others from —
                      instead of your share alone.
                    </span>
                  </span>
                </label>
              )}

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
                <select
                  className={inputClass}
                  value={data.method}
                  onChange={e => set("method")(e.target.value)}
                >
                  <option value="">—</option>
                  {/* A value already stored but not on the list — imported, or
                      typed before this was a select — is offered rather than
                      silently swapped for the first option on the next save. */}
                  {data.method &&
                    !CLIENT_PAYMENT_METHODS.some(m => m === data.method) && (
                      <option value={data.method}>{data.method}</option>
                    )}
                  {CLIENT_PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
                {/* A hand-edited amount leaves a raised link charging the old
                    figure. Not voided automatically the way the toggle is —
                    an amount is edited a character at a time, and retiring a
                    link mid-keystroke would be worse than the staleness. */}
                {linkStale && (
                  <div className="mt-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-2">
                    <p className="text-[13px] text-accent-amber-bright">
                      The amount changed since these links were created — they still charge{" "}
                      {money(data.cardTotal ?? 0)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => void voidLinks()}
                      className="mt-1 text-[13px] font-medium text-accent-amber-bright hover:underline"
                    >
                      Retire them so you can raise new ones
                    </button>
                  </div>
                )}

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
                <Field
                  label="Cc"
                  hint={
                    ccCount > 0
                      ? `They receive the invoice too, and both parties see each other's address.`
                      : coNarratorEmails.length && !billingWhole
                        ? "Left empty on a share invoice, since the others bill the author themselves."
                        : undefined
                  }
                >
                  <input className={inputClass} value={sendCc}
                    onChange={e => setSendCc(e.target.value)}
                    placeholder="Optional — separate several with commas" />
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
                  {/* Names everyone who will receive it, not just the To. A
                      button reading "Send to <one address>" while a Cc is set
                      under-reports an action that cannot be undone. */}
                  {sendBusy
                    ? "Sending…"
                    : ccCount > 0
                      ? `Send to ${ccCount + 1} recipients`
                      : `Send to ${sendTo.trim() || "…"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
