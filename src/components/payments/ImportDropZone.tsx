"use client";

import { useState } from "react";
import { AlertTriangle, Check, FileUp } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { formatMoney, type MoneyCard } from "@/lib/payments";
import { planImport, toBulkPayload, type ParsedRow, type PlanRow } from "@/lib/payment-import";

// Drop a statement or export here and it becomes payment rows — after review.
//
// The review step is not optional. These are financial records, an extraction
// can be wrong, and a processor export routinely contains a declined charge
// sitting next to the successful retry of the same amount. Every row is shown
// with its project and its amount before anything is written.

const ACCEPTED = ".xlsx,.xlsm,.csv,.tsv,.txt,.pdf,image/png,image/jpeg";

const CONFIDENCE_HINT: Record<ParsedRow["confidence"], string> = {
  high: "",
  medium: "worth checking",
  low: "verify against the document",
};

export function ImportDropZone({
  cards,
  onImported,
}: {
  cards: MoneyCard[];
  onImported: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const matchCards = cards.map(c => ({ id: c.id, title: c.title, author: c.author }));

  async function ingest(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setPlan(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/payments/parse-document", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not read that file.");
        return;
      }
      const rows: ParsedRow[] = json.rows ?? [];
      if (rows.length === 0) {
        setError("No payment rows found in that file.");
        return;
      }
      setDocType(json.document_type ?? null);

      const next = planImport(rows, matchCards);

      // Nothing to decide — every row matched a project, none was declined or
      // low-confidence — so importing it is the only thing the review screen
      // would have been used for. Review exists for the ambiguous cases, not
      // as a toll on every file.
      const needsAttention = next.some(
        p => !p.cardId || !p.include || p.row.confidence !== "high",
      );
      if (!needsAttention) {
        await importRows(next);
        return;
      }
      setPlan(next);
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingest(file);
  }

  function update(i: number, patch: Partial<PlanRow>) {
    setPlan(p => (p ? p.map((row, j) => (j === i ? { ...row, ...patch } : row)) : p));
  }

  async function importRows(rows: PlanRow[]) {
    const chosen = rows.filter(p => p.include && p.cardId);
    if (chosen.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: chosen.map(toBulkPayload) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      const dupes = (json.skipped ?? []).length;
      setResult(
        `Imported ${json.imported}${dupes ? ` · ${dupes} already recorded` : ""}.`,
      );
      setPlan(null);
      setDocType(null);
      onImported();
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (plan) await importRows(plan);
  }

  const selected = plan?.filter(p => p.include && p.cardId) ?? [];
  const selectedTotal = selected.reduce((s, p) => s + p.row.amount, 0);

  return (
    <section className="mt-6">
      {/* One row rather than a tall panel: dropping a file is occasional, and
          the drop target only has to be findable, not the largest thing on the
          page. Status shares the row instead of growing it. */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed px-4 py-2.5 transition-colors ${
          dragging ? "border-accent-amber bg-accent-amber/5" : "border-surface-border bg-surface"
        }`}
      >
        <FileUp size={15} className="shrink-0 text-text-muted" />
        <span className={adminType.bodyMd}>
          {busy ? "Reading…" : "Drop a statement, payout export or invoice"}
        </span>
        <span className={adminType.small}>
          Excel, CSV, PDF or image ·{" "}
          <label className="cursor-pointer text-accent-amber-bright hover:underline">
            choose a file
            <input
              type="file"
              className="hidden"
              accept={ACCEPTED}
              disabled={busy}
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void ingest(f);
              }}
            />
          </label>
        </span>

        {error && <span className="ml-auto text-[13px] text-alert-red">{error}</span>}
        {result && (
          <span className="ml-auto flex items-center gap-1.5 text-[13px] text-capacity-light">
            <Check size={14} /> {result}
          </span>
        )}
      </div>

      {plan && (
        <div className="mt-4 overflow-hidden rounded-xl border border-surface-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface px-4 py-3">
            <div>
              <p className={adminType.title}>Review before importing</p>
              <p className={adminType.small}>
                {docType ? `Read as ${docType.replace(/_/g, " ")} · ` : ""}
                {plan.length} row{plan.length === 1 ? "" : "s"} found. Nothing is saved until you import.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={adminType.monoNum}>
                {selected.length} selected · {formatMoney(selectedTotal)}
              </span>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="rounded-lg px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || selected.length === 0}
                className="rounded-lg bg-accent-amber px-4 py-2 text-sm font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
              >
                {busy ? "Importing…" : `Import ${selected.length}`}
              </button>
            </div>
          </div>

          <div className="admin-scrollbar max-h-[420px] overflow-y-auto">
            {plan.map((p, i) => {
              const hint = CONFIDENCE_HINT[p.row.confidence];
              const blocked = !p.cardId;
              return (
                <div
                  key={i}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-4 py-3 last:border-0 ${
                    p.include ? "" : "opacity-55"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={p.include}
                    disabled={blocked}
                    onChange={e => update(i, { include: e.target.checked })}
                    className="h-4 w-4 shrink-0 rounded border-surface-border bg-background text-accent-amber disabled:opacity-40"
                  />

                  <span className={`${adminType.monoNum} w-24 shrink-0`}>{p.row.date || "—"}</span>
                  <span className={`${adminType.monoNum} w-24 shrink-0 text-right text-text-primary`}>
                    {formatMoney(p.row.amount)}
                  </span>
                  <span className={`${adminType.body} w-40 shrink-0 truncate`}>
                    {p.row.client_name || "—"}
                  </span>

                  {/* Always a picker, never a fixed label: a confident match can
                      still be wrong, and the reviewer needs to override it
                      without leaving the screen. */}
                  <select
                    value={p.cardId ?? ""}
                    onChange={e =>
                      update(i, { cardId: e.target.value || null, include: Boolean(e.target.value) })
                    }
                    className="min-w-[200px] flex-1 rounded-lg border border-surface-border bg-background px-2.5 py-1.5 text-sm text-text-primary focus:border-accent-amber focus:outline-none"
                  >
                    <option value="">— choose a project —</option>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>

                  {(p.reason || hint) && (
                    <span className="flex w-full items-start gap-1.5 text-[13px] text-text-muted">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-amber-bright" />
                      <span>
                        {p.reason}
                        {p.reason && hint ? " · " : ""}
                        {hint}
                        {p.row.notes ? ` — ${p.row.notes}` : ""}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

