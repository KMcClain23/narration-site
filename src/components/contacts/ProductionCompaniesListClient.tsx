"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { sanitizeName } from "@/lib/sanitize-name";
import { STATUSES, statusMeta, isOverdue, formatDateSafe, realGenres } from "@/lib/production-contacts-constants";
import { PersonForm, type Person } from "@/components/admin/PersonForm";

export type ProductionCompanyRow = {
  id: string;
  slug: string;
  company: string;
  label: string;
  status: string;
  genres: string[];
  preferred_contact: string;
  date_contacted: string | null;
  next_contact_date: string | null;
};

function StatusPill({ value }: { value: string }) {
  const s = statusMeta(value);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

function GenreCell({ genres }: { genres: string[] }) {
  const real = realGenres(genres);
  if (real.length === 0) return <span className="text-text-faint">—</span>;
  const shown = real.slice(0, 2);
  const extra = real.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(g => (
        <span key={g} className="rounded bg-pill-neutral-bg px-1.5 py-0.5 text-[11px] text-pill-neutral-text">{g}</span>
      ))}
      {extra > 0 && <span className="text-[11px] text-text-faint">+{extra} more</span>}
    </div>
  );
}

export function ProductionCompaniesListClient({ initialRows }: { initialRows: ProductionCompanyRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    initialRows.forEach(r => realGenres(r.genres).forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [initialRows]);

  const statusCounts = useMemo(
    () => Object.fromEntries(STATUSES.map(s => [s.value, initialRows.filter(r => r.status === s.value).length])),
    [initialRows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter(r => {
      if (q && !r.company.toLowerCase().includes(q) && !r.label.toLowerCase().includes(q) && !r.genres.some(g => g.toLowerCase().includes(q))) return false;
      if (statusFilter !== null && r.status !== statusFilter) return false;
      if (genreFilter !== null && !r.genres.includes(genreFilter)) return false;
      return true;
    }).sort((a, b) => a.company.localeCompare(b.company));
  }, [initialRows, query, statusFilter, genreFilter]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by company, label, or genre…"
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="shrink-0 rounded-full bg-accent-amber-dim px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
        >
          + Add company
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${statusFilter === null ? "border-surface-border bg-surface-raised text-text-primary" : "border-surface-border text-text-muted hover:text-text-body"}`}
        >
          All ({initialRows.length})
        </button>
        {STATUSES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatusFilter(prev => (prev === s.value ? null : s.value))}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${statusFilter === s.value ? `${s.bg} ${s.border} ${s.text}` : "border-surface-border text-text-muted hover:text-text-body"}`}
          >
            {s.label} ({statusCounts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {allGenres.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={adminType.label}>Genre:</span>
          <button
            type="button"
            onClick={() => setGenreFilter(null)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${genreFilter === null ? "border-accent-amber-dim bg-accent-amber-dim/15 text-accent-amber-bright" : "border-surface-border text-text-faint hover:text-text-muted"}`}
          >
            All
          </button>
          {allGenres.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGenreFilter(prev => (prev === g ? null : g))}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${genreFilter === g ? "border-accent-amber-dim bg-accent-amber-dim/15 text-accent-amber-bright" : "border-surface-border text-text-faint hover:text-text-muted"}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface">
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Company</th>
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Status</th>
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Genres</th>
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Last contacted</th>
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Next contact</th>
              <th className={`px-4 py-2.5 text-left ${adminType.label}`}>Preferred contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  No companies match your search.
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/contacts/production-companies/${row.slug}`)}
                  className="cursor-pointer border-b border-surface-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-text-primary">{row.company}</p>
                    {row.label && <p className="text-[12px] text-text-muted">{row.label}</p>}
                  </td>
                  <td className="px-4 py-2.5"><StatusPill value={row.status} /></td>
                  <td className="px-4 py-2.5"><GenreCell genres={row.genres} /></td>
                  <td className="px-4 py-2.5 text-text-body">{row.date_contacted ? formatDateSafe(row.date_contacted) : "—"}</td>
                  <td className={`px-4 py-2.5 ${row.next_contact_date && isOverdue(row.next_contact_date) ? "font-medium text-alert-red" : "text-text-body"}`}>
                    {row.next_contact_date ? formatDateSafe(row.next_contact_date) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-text-body">{row.preferred_contact || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="w-full max-w-lg">
            <PersonForm
              type="production-company"
              mode="contacts"
              onCancel={() => setShowAddModal(false)}
              onSaved={(person: Person) => {
                setShowAddModal(false);
                router.push(`/contacts/production-companies/${sanitizeName(person.name)}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
