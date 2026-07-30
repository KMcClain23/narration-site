"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { adminType } from "@/lib/design-tokens";
import { sanitizeName } from "@/lib/sanitize-name";
import { PersonForm, type Person } from "@/components/admin/PersonForm";

export type AuthorRow = {
  id: string;
  slug: string;
  name: string;
  email: string;
  bio: string;
  photo_url: string | null;
  bookCount: number;
  lastActivity: string | null;
};

type SortKey = "name" | "email" | "bookCount" | "lastActivity";

// timeZone pinned to UTC — this renders both server-side (SSR, host machine
// is UTC) and client-side (hydration, browser is in local time); without a
// fixed zone the two can disagree on which calendar day a timestamp near
// midnight falls on, causing a React hydration mismatch (error #418).
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function AuthorsListClient({ initialRows }: { initialRows: AuthorRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? initialRows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.bio.toLowerCase().includes(q))
      : initialRows;

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "email") cmp = a.email.localeCompare(b.email);
      else if (sortKey === "bookCount") cmp = a.bookCount - b.bookCount;
      else cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
      return cmp * sortDir;
    });
    return sorted;
  }, [initialRows, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "bookCount", label: "Books" },
    { key: "lastActivity", label: "Last activity" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, or bio…"
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="shrink-0 rounded-full bg-accent-amber-dim px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
        >
          + Add author
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-surface-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface">
              <th className="w-[56px] px-4 py-2.5" />
              {columns.map(col => (
                <th key={col.key} className="px-4 py-2.5 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`flex items-center gap-1 ${adminType.label} hover:text-text-body`}
                  >
                    {col.label}
                    {sortKey === col.key && (sortDir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  No authors match your search.
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/contacts/authors/${row.slug}`)}
                  className="cursor-pointer border-b border-surface-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-2.5">
                    <PersonAvatar name={row.name} photoUrl={row.photo_url} size={40} />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-text-primary">{row.name}</td>
                  <td className="px-4 py-2.5 text-text-body">{row.email || "—"}</td>
                  <td className="px-4 py-2.5 text-text-body">{row.bookCount}</td>
                  <td className="px-4 py-2.5 text-text-muted">{formatDate(row.lastActivity)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div
          // Form modal — unlike a confirmation dialog, an accidental outside
          // click here would silently discard whatever the user just typed.
          // Cancel button or Escape only.
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-lg">
            <PersonForm
              type="author"
              mode="contacts"
              onCancel={() => setShowAddModal(false)}
              onSaved={(person: Person) => {
                setShowAddModal(false);
                router.push(`/contacts/authors/${sanitizeName(person.name)}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
