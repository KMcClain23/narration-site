"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import type { PaymentRow } from "@/lib/payments";

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
  received_on: string;
  method: string;
  notes: string;
};

function toForm(p: PaymentRow | null): FormState {
  return {
    label: p?.label ?? "",
    amount_expected: p?.amount_expected != null ? String(p.amount_expected) : "",
    due_on: p?.due_on ?? "",
    invoiced_on: p?.invoiced_on ?? "",
    invoice_number: p?.invoice_number ?? "",
    amount_received: p?.amount_received ? String(p.amount_received) : "",
    received_on: p?.received_on ?? "",
    method: p?.method ?? "",
    notes: p?.notes ?? "",
  };
}

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

export function PaymentFormModal({
  cardId,
  cardTitle,
  payment,
  onClose,
  onSaved,
  onDeleted,
}: {
  cardId: string;
  cardTitle: string;
  payment: PaymentRow | null;
  onClose: () => void;
  onSaved: (p: PaymentRow) => void;
  onDeleted: (id: string) => void;
}) {
  useModalOpen(true);
  const [form, setForm] = useState<FormState>(() => toForm(payment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Empty strings are sent through as-is: the API maps "" to NULL, which is
    // what clearing a date or an amount has to persist as.
    const body = {
      ...form,
      card_id: cardId,
      ...(payment ? { id: payment.id } : {}),
    };

    const res = await fetch("/api/payments", {
      method: payment ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save.");
      return;
    }
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
        className="admin-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-border bg-surface p-6"
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label="Milestone">
            <input className={inputClass} value={form.label} onChange={set("label")} placeholder="On delivery" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount expected">
              <input className={inputClass} value={form.amount_expected} onChange={set("amount_expected")}
                inputMode="decimal" placeholder="Leave blank to use estimate" />
            </Field>
            <Field label="Due">
              <input type="date" className={inputClass} value={form.due_on} onChange={set("due_on")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoiced on">
              <input type="date" className={inputClass} value={form.invoiced_on} onChange={set("invoiced_on")} />
            </Field>
            <Field label="Invoice #">
              <input className={inputClass} value={form.invoice_number} onChange={set("invoice_number")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount received">
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

          {error && <p className="text-sm text-alert-red">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
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
