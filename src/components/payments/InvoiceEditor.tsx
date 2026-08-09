"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { pdf } from "@react-pdf/renderer";
import { Plus, Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useModalOpen } from "@/components/admin/AdminModalContext";
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

/**
 * Every field on the invoice is editable before it goes out.
 *
 * The generated values are a starting point, not a commitment: a client may
 * need a different bill-to, an extra line for pickups, a rounded figure, or
 * wording the project record doesn't hold. Nothing here writes back to the
 * payment except the invoice number, which is the one value that has to stay
 * stable so the same invoice keeps its identity.
 */
export function InvoiceEditor({
  initial,
  onClose,
  onNumberAssigned,
}: {
  initial: InvoiceData;
  onClose: () => void;
  /** Fired once on download so the payment can persist its invoice number. */
  onNumberAssigned?: (invoiceNumber: string) => void;
}) {
  useModalOpen(true);
  const [data, setData] = useState<InvoiceData>(initial);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-surface-border bg-surface"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border p-5">
          <div>
            <h2 className={adminType.title}>Invoice</h2>
            <p className={`${adminType.small} mt-0.5`}>Every field is editable — nothing is sent until you download.</p>
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-surface-border p-4">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={busy}
            className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
            {busy ? "Building…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
