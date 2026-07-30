"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import type { Inquiry } from "@/lib/inquiries";

// timeZone must be pinned (not left to default to the runtime's local zone)
// — otherwise the server (UTC on Vercel) and client (browser-local) render
// different date strings for the same instant, which is a hydration
// mismatch. Same fix already applied in production-contacts-constants.ts.
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

// word_count is free text in practice ("Short clip…") as often as a real
// number — only append "words" when it's actually numeric.
function formatWordCount(wc?: string): string | null {
  if (!wc) return null;
  const numeric = wc.replace(/,/g, "");
  return /^\d+$/.test(numeric) ? `${Number(numeric).toLocaleString("en-US")} words` : wc;
}

// Mirrors the archive-age fallback in src/lib/inquiries.ts (server-side) —
// duplicated here rather than imported since that module pulls in the Redis
// client, which has no business in a client bundle.
function isOlderThanDays(inquiry: Inquiry, days: number): boolean {
  const ref = inquiry.archivedAt ?? inquiry.createdAt;
  if (!ref) return false;
  const refTime = new Date(ref).getTime();
  if (isNaN(refTime)) return false;
  return Date.now() - refTime > days * 24 * 60 * 60 * 1000;
}

function GenrePill({ genre }: { genre?: string }) {
  if (!genre) return null;
  return (
    <span className="shrink-0 rounded bg-pill-neutral-bg px-2 py-0.5 text-[11px] text-pill-neutral-text">
      {genre}
    </span>
  );
}

type ConfirmMode = "90days" | "all";

export function InquiriesClient({
  initialActive,
  initialArchived,
}: {
  initialActive: Inquiry[];
  initialArchived: Inquiry[];
}) {
  const [active, setActive] = useState<Inquiry[]>(initialActive);
  const [archived, setArchived] = useState<Inquiry[]>(initialArchived);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const setBusyFor = (id: string, val: boolean) => setBusy(b => ({ ...b, [id]: val }));

  const sortedActive = useMemo(
    () => [...active].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [active],
  );

  const sortedArchived = useMemo(
    () => [...archived].sort((a, b) => {
      const aRef = new Date(a.archivedAt ?? a.createdAt).getTime();
      const bRef = new Date(b.archivedAt ?? b.createdAt).getTime();
      return bRef - aRef;
    }),
    [archived],
  );

  const filteredArchived = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedArchived;
    return sortedArchived.filter(inq =>
      inq.name.toLowerCase().includes(q) ||
      inq.email.toLowerCase().includes(q) ||
      inq.message.toLowerCase().includes(q),
    );
  }, [sortedArchived, search]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleArchive = async (inquiry: Inquiry) => {
    setBusyFor(inquiry.id, true);
    try {
      const res = await fetch("/api/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inquiry.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setActive(prev => prev.filter(i => i.id !== inquiry.id));
      setArchived(prev => [{ ...inquiry, archivedAt: new Date().toISOString() }, ...prev]);
    } catch (e) {
      alert("Archive failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyFor(inquiry.id, false);
    }
  };

  const handleRestore = async (inquiry: Inquiry) => {
    setBusyFor(inquiry.id, true);
    try {
      const res = await fetch("/api/inquiries/archived", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inquiry.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setArchived(prev => prev.filter(i => i.id !== inquiry.id));
      const { archivedAt: _archivedAt, ...restored } = inquiry;
      setActive(prev => [restored, ...prev]);
    } catch (e) {
      alert("Restore failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyFor(inquiry.id, false);
    }
  };

  const handleDeleteSingle = async (inquiry: Inquiry) => {
    setBusyFor(inquiry.id, true);
    try {
      const res = await fetch("/api/inquiries/archived", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inquiry.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setArchived(prev => prev.filter(i => i.id !== inquiry.id));
    } catch (e) {
      alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
      setBusyFor(inquiry.id, false);
    }
  };

  // Bulk actions operate on the full archived set, not the search-filtered
  // view — "Delete all archived" means all, regardless of what's typed in
  // the search box above.
  const confirmCount = confirmMode === "90days"
    ? archived.filter(inq => isOlderThanDays(inq, 90)).length
    : archived.length;

  const confirmBulkDelete = async () => {
    if (!confirmMode) return;
    setBulkBusy(true);
    try {
      const body = confirmMode === "90days" ? { olderThanDays: 90 } : { all: true };
      const res = await fetch("/api/inquiries/archived", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setArchived(prev =>
        confirmMode === "all" ? [] : prev.filter(inq => !isOlderThanDays(inq, 90)),
      );
      setConfirmMode(null);
    } catch (e) {
      alert("Bulk delete failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      {/* ── Active ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className={adminType.titleLg}>Inquiries</h1>
        <span className={adminType.small}>{active.length}</span>
      </div>

      <div className="mt-5 space-y-4">
        {sortedActive.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-border py-16 text-center">
            <p className={adminType.small}>No inquiries at the moment</p>
          </div>
        ) : (
          sortedActive.map(inq => {
            const wordCount = formatWordCount(inq.word_count);
            return (
              <div key={inq.id} className="rounded-2xl border border-surface-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className={adminType.title}>{inq.name}</h3>
                    <p className="mt-0.5 truncate font-mono text-[13px] text-accent-amber-bright">{inq.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`${adminType.small} whitespace-nowrap`}>{formatDate(inq.createdAt)}</p>
                    <button
                      type="button"
                      onClick={() => handleArchive(inq)}
                      disabled={!!busy[inq.id]}
                      className="mt-2 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                    >
                      {busy[inq.id] ? "Archiving…" : "Archive"}
                    </button>
                  </div>
                </div>
                <p className={`${adminType.body} mt-4 whitespace-pre-wrap leading-relaxed`}>{inq.message}</p>
                {(inq.genre || wordCount) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <GenrePill genre={inq.genre} />
                    {wordCount && <span className={adminType.small}>{wordCount}</span>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Archived ───────────────────────────────────────────────────── */}
      <div className="mt-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className={adminType.title}>Archived</h2>
          <span className={adminType.small}>{archived.length}</span>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search archived inquiries"
              className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmMode("90days")}
              disabled={archived.length === 0}
              className="rounded-full border border-surface-border px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Delete all older than 90 days
            </button>
            <button
              type="button"
              onClick={() => setConfirmMode("all")}
              disabled={archived.length === 0}
              className="rounded-full border border-surface-border px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Delete all archived
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-surface-border">
          {filteredArchived.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className={adminType.small}>
                {archived.length === 0 ? "No archived inquiries." : "No archived inquiries match your search."}
              </p>
            </div>
          ) : (
            filteredArchived.map((inq, i) => {
              const isExpanded = expanded.has(inq.id);
              const wordCount = formatWordCount(inq.word_count);
              return (
                <div key={inq.id} className={i > 0 ? "border-t border-surface-border" : ""}>
                  <div
                    onClick={() => toggleExpand(inq.id)}
                    className="cursor-pointer px-4 py-3 transition-colors hover:bg-surface-raised"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={adminType.bodyMd}>{inq.name}</span>
                          <span className={`${adminType.small} font-mono`}>{inq.email}</span>
                          <GenrePill genre={inq.genre} />
                        </div>
                        {!isExpanded && (
                          <p className="mt-0.5 truncate text-[13px] text-text-muted">
                            {truncate(inq.message, 80)}
                          </p>
                        )}
                      </div>
                      <span className={`${adminType.small} shrink-0 whitespace-nowrap`}>
                        {formatDate(inq.createdAt)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                        <p className={`${adminType.body} whitespace-pre-wrap leading-relaxed`}>{inq.message}</p>
                        {(inq.genre || wordCount) && (
                          <div className="flex flex-wrap items-center gap-2">
                            <GenrePill genre={inq.genre} />
                            {wordCount && <span className={adminType.small}>{wordCount}</span>}
                          </div>
                        )}
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => handleRestore(inq)}
                            disabled={!!busy[inq.id]}
                            className="text-[12px] font-medium text-emerald-400/70 transition-colors hover:text-emerald-400 disabled:opacity-40"
                          >
                            {busy[inq.id] ? "Restoring…" : "Restore"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(inq)}
                            disabled={!!busy[inq.id]}
                            className="text-[12px] font-medium text-alert-red/70 transition-colors hover:text-alert-red disabled:opacity-40"
                          >
                            {busy[inq.id] ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Bulk delete confirmation ───────────────────────────────────── */}
      {confirmMode && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setConfirmMode(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-6">
            <h3 className={adminType.title}>
              {confirmMode === "90days"
                ? `Delete ${confirmCount} inquiries older than 90 days?`
                : `Delete all ${confirmCount} archived inquiries?`}
            </h3>
            <p className={`${adminType.body} mt-2`}>This permanently removes them. You can&apos;t undo this.</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmMode(null)}
                disabled={bulkBusy}
                className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                disabled={bulkBusy}
                className="flex-1 rounded-full bg-alert-red py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {bulkBusy ? "Deleting…" : `Delete ${confirmCount} inquiries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
