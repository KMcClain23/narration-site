"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Mail, Plus, Trash2 } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { formatMoney } from "@/lib/payments";
import { EXPENSE_LABELS, SCHEDULE_C_LABEL, type ExpenseRow } from "@/lib/expenses";
import type { TaxYear } from "@/lib/tax-report";

type Candidate = {
  email_id: string;
  incurred_on: string;
  vendor: string;
  description: string;
  amount: number;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  include?: boolean;
  /** Looks like an expense already recorded, usually a second email about one purchase. */
  likelyDuplicate?: boolean;
  duplicateOf?: string;
};

const inputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none";

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? adminType.small : adminType.body}>{label}</span>
      <span className={`${adminType.monoNum} ${muted ? "text-text-muted" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}

export function ExpensesClient({
  year,
  years,
  summary,
  expenses,
}: {
  year: number;
  years: number[];
  summary: TaxYear;
  expenses: ExpenseRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [needsOutlook, setNeedsOutlook] = useState(false);

  const [form, setForm] = useState({
    incurred_on: new Date().toISOString().split("T")[0],
    vendor: "",
    description: "",
    amount: "",
    label: EXPENSE_LABELS[0].label,
    method: "",
  });

  async function addExpense() {
    if (!form.vendor.trim() || !Number(form.amount)) {
      setError("A vendor and an amount are needed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save that.");
        return;
      }
      setForm(f => ({ ...f, vendor: "", description: "", amount: "" }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  /** Nothing is saved by the scan itself — these are candidates for review. */
  async function scanMail() {
    setBusy(true);
    setError(null);
    setNeedsOutlook(false);
    setScanNote(null);
    try {
      const res = await fetch("/api/expenses/scan-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 40 }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 503 is the route saying the mailbox is not connected, which is the
        // one failure here with an action attached rather than a cause.
        setNeedsOutlook(res.status === 503);
        setError(json.error ?? "Could not read the mail folder.");
        return;
      }
      const found: Candidate[] = (json.receipts ?? []).map((r: Candidate) => ({
        ...r,
        include: !r.likelyDuplicate,
      }));
      setCandidates(found);
      setScanNote(
        `Read ${json.scanned} email${json.scanned === 1 ? "" : "s"}` +
          (json.alreadyImported ? `, ${json.alreadyImported} already imported` : "") +
          `. ${found.length} receipt${found.length === 1 ? "" : "s"} found.`,
      );
    } catch {
      setError("Could not read the mail folder.");
    } finally {
      setBusy(false);
    }
  }

  async function importChosen() {
    const chosen = (candidates ?? []).filter(c => c.include);
    if (!chosen.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: chosen.map(c => ({ ...c, source: "email" })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setCandidates(null);
      setScanNote(`Imported ${json.saved}${json.skipped ? ` · ${json.skipped} already recorded` : ""}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={adminType.titleLg}>Expenses &amp; tax</h1>
        <div className="flex items-center gap-2">
          {/* Four files rather than one: income, expenses and contractor
              totals are three different tables, and an accountant asked for
              "the expenses" wants a sheet whose every row is an expense. */}
          {[
            { part: "summary", label: "Summary" },
            { part: "income", label: "Income" },
            { part: "expenses", label: "Expenses" },
            { part: "contractors", label: "1099s" },
          ].map(x => (
            <a
              key={x.part}
              href={`/api/expenses/export?year=${year}&part=${x.part}`}
              className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-2 text-[13px] text-text-body hover:border-accent-amber hover:text-text-primary"
            >
              <Download size={13} /> {x.label}
            </a>
          ))}
        </div>
        <select
          value={year}
          onChange={e => router.push(`/expenses?year=${e.target.value}`)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent-amber focus:outline-none"
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* The year, as a return would read it. Gross first because that is what
          a 1099 will say, then what left again, then what is actually taxable. */}
      <section className="mt-5 grid gap-4 rounded-xl border border-surface-border bg-surface p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={adminType.label}>Money in</p>
          <Row label="Narration fees" value={formatMoney(summary.ownEarnings)} muted />
          <Row label="Royalties" value={formatMoney(summary.royalties)} muted />
          <Row label="Collected for others" value={formatMoney(summary.collectedForOthers)} muted />
          <div className="border-t border-divider pt-2">
            <Row label="Gross receipts" value={formatMoney(summary.grossReceipts)} />
          </div>
        </div>

        <div className="space-y-2">
          <p className={adminType.label}>Money out</p>
          <Row label="Paid to editors and co-narrators" value={`− ${formatMoney(summary.passedOn)}`} muted />
          <Row label="Other expenses" value={`− ${formatMoney(summary.expenses)}`} muted />
          <div className="border-t border-divider pt-2">
            <Row label={`Taxable for ${year}`} value={formatMoney(summary.net)} />
          </div>
        </div>
      </section>

      {summary.needs1099.length > 0 && (
        <section className="mt-3 rounded-xl border border-accent-amber/40 bg-accent-amber/10 px-4 py-3">
          <p className="text-[13px] text-accent-amber-bright">
            Paid $600 or more this year outside a payment network, so a 1099-NEC is likely due:{" "}
            {summary.needs1099.map(p => `${p.name} (${formatMoney(p.reportable)})`).join(", ")}.
          </p>
        </section>
      )}

      {summary.passedOnByPayee.length > 0 && (
        <section className="mt-3 overflow-hidden rounded-xl border border-surface-border">
          <p className={`${adminType.label} border-b border-surface-border bg-surface px-4 py-2.5`}>
            Paid to contractors
          </p>
          {summary.passedOnByPayee.map(p => (
            <div key={p.name} className="border-b border-divider px-4 py-2.5 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className={adminType.body}>
                  {p.name}
                  {p.methods.length > 0 && (
                    <span className={`${adminType.small} ml-2`}>by {p.methods.join(", ")}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className={adminType.monoNum}>{formatMoney(p.total)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[12px] ${
                      p.needs1099
                        ? "bg-accent-amber/15 text-accent-amber-bright"
                        : "bg-pill-neutral-bg text-pill-neutral-text"
                    }`}
                  >
                    {p.needs1099
                      ? "1099-NEC due"
                      : p.viaProcessor >= p.total - 0.005
                        ? "Network reports it"
                        : "Under $600"}
                  </span>
                </span>
              </div>

              {/* Only worth saying when the two numbers differ. Showing "of
                  which $0 was via a network" on every line would bury the one
                  payee where it actually changes the filing. */}
              {p.viaProcessor > 0.005 && p.reportable > 0.005 && (
                <p className={`${adminType.small} mt-0.5`}>
                  {formatMoney(p.viaProcessor)} through a payment network, which reports it for you.
                  Yours to report: {formatMoney(p.reportable)}.
                </p>
              )}
              {p.unrecorded > 0.005 && (
                <p className={`${adminType.small} mt-0.5 text-accent-amber-bright/80`}>
                  No method recorded on {formatMoney(p.unrecorded)}, so it is counted as yours to
                  report. Set it from Mark paid on the payments page.
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {summary.expensesByLine.length > 0 && (
        <section className="mt-3 overflow-hidden rounded-xl border border-surface-border">
          <p className={`${adminType.label} border-b border-surface-border bg-surface px-4 py-2.5`}>
            By Schedule C line
          </p>
          {summary.expensesByLine.map(l => (
            <div key={l.line} className="flex items-center justify-between border-b border-divider px-4 py-2 last:border-0">
              <span className={adminType.body}>{SCHEDULE_C_LABEL[l.line]}</span>
              <span className={adminType.monoNum}>{formatMoney(l.total)}</span>
            </div>
          ))}
        </section>
      )}

      {/* Add one */}
      <section className="mt-6 rounded-xl border border-surface-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={`${adminType.label} block mb-1`}>Date</span>
            <input type="date" className={inputClass} value={form.incurred_on}
              onChange={e => setForm(f => ({ ...f, incurred_on: e.target.value }))} />
          </label>
          <label className="block min-w-[150px] flex-1">
            <span className={`${adminType.label} block mb-1`}>Vendor</span>
            <input className={inputClass} value={form.vendor} placeholder="B&H Photo"
              onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
          </label>
          <label className="block min-w-[150px] flex-1">
            <span className={`${adminType.label} block mb-1`}>What for</span>
            <input className={inputClass} value={form.description} placeholder="Shock mount"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </label>
          <label className="block w-28">
            <span className={`${adminType.label} block mb-1`}>Amount</span>
            <input className={inputClass} value={form.amount} inputMode="decimal" placeholder="0.00"
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </label>
          <label className="block min-w-[170px]">
            <span className={`${adminType.label} block mb-1`}>Category</span>
            <select className={inputClass} value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}>
              {EXPENSE_LABELS.map(o => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void addExpense()} disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
            <Plus size={15} /> Add
          </button>
          <button type="button" onClick={() => void scanMail()} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-surface-border px-4 py-2 text-sm text-text-body hover:border-accent-amber hover:text-text-primary disabled:opacity-50">
            <Mail size={15} /> {busy ? "Reading…" : "Scan Business Expense"}
          </button>
        </div>
        <p className={`${adminType.small} mt-2`}>
          Categories file themselves: {form.label} counts as{" "}
          {SCHEDULE_C_LABEL[EXPENSE_LABELS.find(l => l.label === form.label)?.scheduleC ?? "other"]}.
        </p>
        {scanNote && <p className={`${adminType.small} mt-1`}>{scanNote}</p>}

        {/* A disconnected mailbox is a thing to fix, not an error to report.
            The link is the fix, so it goes where the complaint would have. */}
        {error && needsOutlook ? (
          <p className="mt-1 text-[13px] text-accent-amber-bright">
            Outlook isn&rsquo;t connected.{" "}
            <a href="/api/auth/microsoft" className="font-medium underline">
              Connect Microsoft 365
            </a>{" "}
            and scan again.
          </p>
        ) : error ? (
          <p className="mt-1 text-[13px] text-alert-red">{error}</p>
        ) : null}
      </section>

      {/* Review before anything is saved, same as the royalty importer. */}
      {candidates && candidates.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-surface-border">
          <div className="flex items-center justify-between border-b border-surface-border bg-surface px-4 py-3">
            <p className={adminType.title}>Review before importing</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setCandidates(null)}
                className="text-sm text-text-muted hover:text-text-primary">Cancel</button>
              <button type="button" onClick={() => void importChosen()} disabled={busy}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50">
                Import {candidates.filter(c => c.include).length}
              </button>
            </div>
          </div>
          {candidates.map((c, i) => (
            <div key={c.email_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-4 py-3 last:border-0 ${c.include ? "" : "opacity-55"}`}>
              <input type="checkbox" checked={c.include}
                onChange={e => setCandidates(list => list!.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                className="h-4 w-4 shrink-0 rounded border-surface-border bg-background text-accent-amber" />
              <span className={`${adminType.monoNum} w-24 shrink-0`}>{c.incurred_on}</span>
              <span className={`${adminType.monoNum} w-24 shrink-0 text-right`}>{formatMoney(c.amount)}</span>
              <span className={`${adminType.body} w-40 shrink-0 truncate`}>{c.vendor}</span>
              <select value={c.label}
                onChange={e => setCandidates(list => list!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="min-w-[170px] flex-1 rounded-lg border border-surface-border bg-background px-2.5 py-1.5 text-sm text-text-primary focus:border-accent-amber focus:outline-none">
                {EXPENSE_LABELS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
              </select>
              {c.likelyDuplicate && (
                <span className="w-full text-[13px] text-accent-amber-bright">
                  Already recorded? Matches {c.duplicateOf}. Unticked — tick it only if this is a
                  separate purchase.
                </span>
              )}
              {c.confidence !== "high" && (
                <span className="w-full text-[13px] text-accent-amber-bright">{c.reason || "Worth checking."}</span>
              )}
            </div>
          ))}
        </section>
      )}

      {/* The year's expenses */}
      <section className="mt-4 overflow-hidden rounded-xl border border-surface-border">
        <div className="flex items-center justify-between border-b border-surface-border bg-surface px-4 py-3">
          <p className={adminType.title}>{year} expenses</p>
          <span className={adminType.monoNum}>{formatMoney(summary.expenses)}</span>
        </div>
        {expenses.length === 0 ? (
          <p className={`${adminType.small} px-4 py-4`}>
            Nothing recorded for {year} yet. Add one above, or scan the Business Expense folder.
          </p>
        ) : (
          expenses.map(e => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-divider px-4 py-2.5 last:border-0">
              <span className={`${adminType.monoNum} w-24 shrink-0`}>{e.incurred_on}</span>
              <span className={`${adminType.bodyMd} min-w-[140px] flex-1 truncate`}>
                {e.vendor}
                {e.description ? <span className={adminType.small}> · {e.description}</span> : null}
              </span>
              <span className={`${adminType.small} w-44 shrink-0`}>
                {e.label} · {SCHEDULE_C_LABEL[e.schedule_c] ?? e.schedule_c}
              </span>
              <span className={`${adminType.monoNum} w-24 shrink-0 text-right`}>{formatMoney(Number(e.amount))}</span>
              <button type="button" onClick={() => void remove(e.id)}
                className="text-text-muted hover:text-alert-red" aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
