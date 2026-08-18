"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { formatMoney } from "@/lib/payments";
import { venmoPayUrl } from "@/lib/business-identity";

export type EditorRow = {
  id: string;
  name: string;
  email: string;
  venmo: string;
  paypal: string;
  role: string;
  notes: string;
  /** Payouts recorded against this name, paid or not. */
  jobs: number;
  paid: number;
  owed: number;
};

const ROLE_LABEL: Record<string, string> = {
  editor: "Editor",
  proofer: "Proofer",
  both: "Editor & proofer",
};

const EMPTY = { name: "", email: "", venmo: "", paypal: "", role: "editor", notes: "" };

const inputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none";

export function EditorsListClient({ initialRows }: { initialRows: EditorRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setForm(EMPTY);
    setEditingId(null);
    setError(null);
    setAdding(true);
  };

  const openEdit = (row: EditorRow) => {
    setForm({
      name: row.name, email: row.email, venmo: row.venmo,
      paypal: row.paypal, role: row.role, notes: row.notes,
    });
    setEditingId(row.id);
    setError(null);
    setAdding(true);
  };

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/editors", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not save.");
        return;
      }
      setAdding(false);
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: EditorRow) {
    // The payout history is keyed by name and survives this, which is worth
    // saying plainly — removing the contact does not unspend the money.
    const detail = row.jobs > 0 ? `\n\nTheir ${row.jobs} recorded payout${row.jobs === 1 ? "" : "s"} stay on the payments they belong to.` : "";
    if (!window.confirm(`Remove ${row.name} from Editors?${detail}`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/editors?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={openAdd}
        className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-2 text-[13px] text-text-body hover:border-accent-amber hover:text-text-primary"
      >
        <Plus size={14} /> Add editor
      </button>

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-surface-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className={adminType.label}>{editingId ? "Edit contact" : "New contact"}</p>
            <button type="button" onClick={() => setAdding(false)} className="text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>

          <input
            className={inputClass}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Name"
          />
          {/* The name is the join key to payout history, so a mismatch here is
              not cosmetic: it detaches everything already paid to them. */}
          <p className={adminType.small}>
            Spell it exactly as it appears on payouts — that name is what links their payment history.
          </p>

          <input
            className={inputClass}
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            inputMode="email"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputClass}
              value={form.venmo}
              onChange={e => setForm(f => ({ ...f, venmo: e.target.value }))}
              placeholder="Venmo (@handle)"
            />
            <input
              className={inputClass}
              value={form.paypal}
              onChange={e => setForm(f => ({ ...f, paypal: e.target.value }))}
              placeholder="PayPal (optional)"
            />
          </div>
          <select
            className={inputClass}
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          >
            <option value="editor">Editor</option>
            <option value="proofer">Proofer</option>
            <option value="both">Editor &amp; proofer</option>
          </select>
          <textarea
            className={`${inputClass} min-h-[64px]`}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (rates, turnaround, anything worth remembering)"
          />

          {error && <p className="text-[13px] text-alert-red">{error}</p>}

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-accent-amber px-3 py-2 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add"}
          </button>
        </div>
      )}

      {initialRows.length === 0 ? (
        <p className={`${adminType.small} mt-4`}>Nobody listed yet.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-surface-border">
          {initialRows.map(row => (
            <div key={row.id} className="border-b border-divider px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className={adminType.bodyMd}>
                  {row.name}
                  <span className={`${adminType.small} ml-2`}>{ROLE_LABEL[row.role] ?? row.role}</span>
                </span>
                <span className="flex items-center gap-3">
                  {row.owed > 0.005 && (
                    <span className={adminType.monoNum}>
                      <span className="text-accent-amber-bright">{formatMoney(row.owed)}</span> owed
                    </span>
                  )}
                  {row.paid > 0.005 && (
                    <span className={adminType.monoNum}>{formatMoney(row.paid)} paid</span>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="text-[13px] text-text-muted hover:text-text-primary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    disabled={busy}
                    aria-label={`Remove ${row.name}`}
                    className="text-text-muted hover:text-alert-red disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>

              {/* Contact details as things to act on rather than text to copy:
                  the moment you want a Venmo handle is the moment you are
                  paying someone. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {row.email && (
                  <a
                    href={`mailto:${row.email}`}
                    className={`${adminType.small} flex items-center gap-1 hover:text-accent-amber-bright`}
                  >
                    <Mail size={12} /> {row.email}
                  </a>
                )}
                {row.venmo && <span className={adminType.small}>Venmo {row.venmo}</span>}
                {/* Prefilled only when there is a figure to prefill. A pay link
                    carrying $0.00 is worse than no link. */}
                {row.venmo && row.owed > 0.005 && (
                  <a
                    href={venmoPayUrl(row.venmo, row.owed, `Editing · ${row.name}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-accent-amber-bright hover:underline"
                  >
                    Pay {formatMoney(row.owed)} on Venmo
                  </a>
                )}
                {row.paypal && <span className={adminType.small}>PayPal {row.paypal}</span>}
                {row.jobs > 0 && (
                  <span className={adminType.small}>
                    {row.jobs} payout{row.jobs === 1 ? "" : "s"} recorded
                  </span>
                )}
              </div>

              {row.notes && <p className={`${adminType.small} mt-1`}>{row.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
