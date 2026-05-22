"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: number;
  company: string;
  label: string;
  status: string;
  jobTitles: string[];
  contactNames: string[];
  contactInfo: string;
  address: string;
  website: string;
  findingSource: string;
  preferredContact: string;
  dateContacted: string;
  nextContactDate: string;
  genres: string[];
  notes: string;
};

type Override = {
  status?: string;
  dateContacted?: string;
  nextContactDate?: string;
  notes?: string;
};

type ViewMode = "table" | "card";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: "",         label: "Needs Contact",    bg: "bg-red-500/15",     border: "border-red-500/25",     text: "text-red-300"     },
  { value: "contacted", label: "Contacted",        bg: "bg-amber-500/15",   border: "border-amber-500/25",   text: "text-amber-300"   },
  { value: "waiting",  label: "Waiting on Reply",  bg: "bg-blue-500/15",    border: "border-blue-500/25",    text: "text-blue-300"    },
  { value: "replied",  label: "Received Reply",    bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-300" },
] as const;

const CANONICAL_GENRES = new Set([
  "Biography","Business","Childrens","Classics","Comics",
  "Erotica","Faith-based","Fantasy","Fiction","Health",
  "History","Horror","Humor","LGBTQ+","LitPRG","Memoir",
  "Mystery","Non-fiction","Romance","Sci-Fi","Self-Help",
  "Short Story/Anthology","Suspense","Thriller","Travel",
  "True Crime","Western","Young Adult",
]);

const STORAGE_KEY = "dmn_contacts_overrides";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function realGenres(genres: string[]) {
  return genres.filter(g => CANONICAL_GENRES.has(g));
}

function genreNotes(genres: string[]) {
  return genres.filter(g => !CANONICAL_GENRES.has(g));
}

function extractEmails(info: string): string[] {
  return (info.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []);
}

function statusMeta(value: string) {
  return STATUSES.find(s => s.value === value) ?? STATUSES[0];
}

function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: string }) {
  const s = statusMeta(value);
  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text} whitespace-nowrap`}>
      {s.label}
    </span>
  );
}

// ─── Status select ────────────────────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:border-[#D4AF37]/40 cursor-pointer"
    >
      {STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export default function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [view, setView]               = useState<ViewMode>("table");
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [overrides, setOverrides]     = useState<Record<number, Override>>({});
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [hydrated, setHydrated]       = useState(false);

  // Load from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setOverrides(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {}
  }, [overrides, hydrated]);

  const updateOverride = (id: number, updates: Partial<Override>) => {
    setOverrides(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...updates } }));
  };

  const markContacted = (id: number) => {
    updateOverride(id, {
      status: "contacted",
      dateContacted: new Date().toISOString().split("T")[0],
    });
  };

  const getStatus = (c: Contact) => overrides[c.id]?.status ?? c.status ?? "";

  // All genre options for filter
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => realGenres(c.genres).forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered contacts
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (q) {
        const haystack = [c.company, ...c.contactNames, c.contactInfo].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== null && getStatus(c) !== statusFilter) return false;
      if (genreFilter !== null && !realGenres(c.genres).includes(genreFilter)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, search, statusFilter, genreFilter, overrides]);

  const statusCounts = useMemo(() =>
    Object.fromEntries(STATUSES.map(s => [s.value, contacts.filter(c => getStatus(c) === s.value).length])),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, overrides]);

  return (
    <div className="space-y-6">

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company, contact, or email…"
            className="w-full bg-[#0A0D3A] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5 shrink-0">
          <button onClick={() => setView("table")}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${view === "table" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
            Table
          </button>
          <button onClick={() => setView("card")}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${view === "card" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
            Cards
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(null)}
          className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${statusFilter === null ? "bg-white/10 border-white/20 text-white" : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"}`}>
          All ({contacts.length})
        </button>
        {STATUSES.map(s => (
          <button key={s.value}
            onClick={() => setStatusFilter(statusFilter === s.value ? null : s.value)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${statusFilter === s.value ? `${s.bg} ${s.border} ${s.text}` : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"}`}>
            {s.label} ({statusCounts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-widest shrink-0">Genre:</span>
        <button
          onClick={() => setGenreFilter(null)}
          className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${genreFilter === null ? "bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]" : "border-white/10 text-white/35 hover:text-white/60"}`}>
          All
        </button>
        {allGenres.map(g => (
          <button key={g}
            onClick={() => setGenreFilter(genreFilter === g ? null : g)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${genreFilter === g ? "bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]" : "border-white/10 text-white/35 hover:text-white/60"}`}>
            {g}
          </button>
        ))}
      </div>

      {/* Result count */}
      {(search || statusFilter !== null || genreFilter !== null) && (
        <p className="text-xs text-white/35">
          Showing {filtered.length} of {contacts.length} contacts
          {(search || statusFilter !== null || genreFilter !== null) && (
            <button onClick={() => { setSearch(""); setStatusFilter(null); setGenreFilter(null); }}
              className="ml-3 text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors">
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* ── TABLE VIEW ────────────────────────────────────────────────────── */}
      {view === "table" && (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.02]">
                  {["Company", "Contact(s)", "Email", "Status", "Preferred", "Genres", "Notes"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const status = getStatus(c);
                  const emails = extractEmails(c.contactInfo);
                  const genres = realGenres(c.genres);
                  const notes = overrides[c.id]?.notes ?? c.notes;
                  const nextDate = overrides[c.id]?.nextContactDate ?? c.nextContactDate;
                  const isExpanded = expandedId === c.id;

                  return (
                    <>
                      <tr key={c.id}
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group">

                        {/* Company */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="font-semibold text-sm text-white leading-snug">{c.company}</p>
                          {c.preferredContact === "By Invite ONLY" && (
                            <span className="text-[9px] text-amber-400/70 font-bold uppercase tracking-wider">Invite Only</span>
                          )}
                        </td>

                        {/* Contacts */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="space-y-0.5">
                            {c.contactNames.slice(0, 2).map((name, i) => (
                              <p key={i} className="text-xs text-white/60 leading-snug truncate">{name.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}</p>
                            ))}
                            {c.contactNames.length > 2 && (
                              <p className="text-[10px] text-white/30">+{c.contactNames.length - 2} more</p>
                            )}
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="space-y-0.5">
                            {emails.slice(0, 2).map(email => (
                              <a key={email} href={`mailto:${email}`} onClick={e => e.stopPropagation()}
                                className="block text-[11px] text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors truncate">
                                {email}
                              </a>
                            ))}
                            {emails.length === 0 && (
                              <span className="text-[11px] text-white/20 italic">—</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <StatusSelect value={status} onChange={v => updateOverride(c.id, { status: v })} />
                        </td>

                        {/* Preferred */}
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-white/50">{c.preferredContact || "—"}</span>
                        </td>

                        {/* Genres */}
                        <td className="px-4 py-3 max-w-[160px]">
                          <div className="flex flex-wrap gap-1">
                            {genres.slice(0, 3).map(g => (
                              <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/6 text-white/40 border border-white/8">{g}</span>
                            ))}
                            {genres.length > 3 && (
                              <span className="text-[9px] text-white/25">+{genres.length - 3}</span>
                            )}
                          </div>
                        </td>

                        {/* Notes */}
                        <td className="px-4 py-3 max-w-[160px]">
                          <p className="text-[11px] text-white/40 truncate" title={notes || undefined}>
                            {notes || (nextDate ? <span className={`font-medium ${isOverdue(nextDate) ? "text-red-400" : "text-white/40"}`}>Next: {fmtDate(nextDate)}</span> : "—")}
                          </p>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr key={`${c.id}-exp`} className="border-b border-white/8 bg-[#06082E]/60">
                          <td colSpan={7} className="px-4 py-5">
                            <ExpandedRow
                              contact={c}
                              override={overrides[c.id] ?? {}}
                              onUpdate={u => updateOverride(c.id, u)}
                              onMarkContacted={() => markContacted(c.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-white/25 text-sm">
                      No contacts match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CARD VIEW ─────────────────────────────────────────────────────── */}
      {view === "card" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const status = getStatus(c);
            const s = statusMeta(status);
            const emails = extractEmails(c.contactInfo);
            const genres = realGenres(c.genres);
            const gNotes = genreNotes(c.genres);
            const override = overrides[c.id] ?? {};
            const notes = override.notes ?? c.notes;
            const dateContacted = override.dateContacted ?? c.dateContacted;
            const nextDate = override.nextContactDate ?? c.nextContactDate;

            return (
              <div key={c.id} className={`rounded-2xl border bg-[#0A0D3A] p-5 flex flex-col gap-4 ${s.border}`}>

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white leading-snug">{c.company}</h3>
                    {c.findingSource && (
                      <p className="text-[10px] text-white/30 mt-0.5">via {c.findingSource}</p>
                    )}
                  </div>
                  <StatusBadge value={status} />
                </div>

                {/* Contacts */}
                {c.contactNames.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Contacts</p>
                    <div className="space-y-1">
                      {c.contactNames.map((name, i) => (
                        <p key={i} className="text-xs text-white/65 leading-snug">
                          {name.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emails */}
                {emails.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Email</p>
                    <div className="space-y-1">
                      {emails.map(email => (
                        <a key={email} href={`mailto:${email}`}
                          className="block text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors break-all">
                          {email}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preferred contact */}
                {c.preferredContact && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Via</span>
                    <span className={`text-[11px] font-semibold ${c.preferredContact === "By Invite ONLY" ? "text-amber-400" : "text-white/60"}`}>
                      {c.preferredContact}
                    </span>
                  </div>
                )}

                {/* Genres */}
                {genres.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Genres</p>
                    {gNotes.length > 0 && (
                      <p className="text-[10px] text-amber-400/60 mb-1.5 italic">{gNotes.join(" · ")}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {genres.map(g => (
                        <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 text-white/45 border border-white/8">{g}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Address */}
                {c.address && (
                  <p className="text-[10px] text-white/30">{c.address}</p>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Contacted</p>
                    <input type="date" value={dateContacted}
                      onChange={e => updateOverride(c.id, { dateContacted: e.target.value })}
                      className="w-full text-[11px] bg-black/30 border border-white/8 rounded-lg px-2 py-1 text-white/60 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${nextDate && isOverdue(nextDate) ? "text-red-400/70" : "text-white/25"}`}>
                      Next Contact
                    </p>
                    <input type="date" value={nextDate}
                      onChange={e => updateOverride(c.id, { nextContactDate: e.target.value })}
                      className={`w-full text-[11px] bg-black/30 border rounded-lg px-2 py-1 focus:outline-none transition ${nextDate && isOverdue(nextDate) ? "border-red-500/30 text-red-300 focus:border-red-400/60" : "border-white/8 text-white/60 focus:border-[#D4AF37]/40"}`}/>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Notes</p>
                  <textarea
                    value={notes}
                    onChange={e => updateOverride(c.id, { notes: e.target.value })}
                    placeholder="Add notes…"
                    rows={2}
                    className="w-full text-[11px] bg-black/30 border border-white/8 rounded-lg px-2 py-1.5 text-white/60 placeholder:text-white/15 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none"
                  />
                </div>

                {/* Status + action */}
                <div className="flex items-center gap-2 pt-1 border-t border-white/8">
                  <StatusSelect value={status} onChange={v => updateOverride(c.id, { status: v })} />
                  {status !== "contacted" && status !== "replied" && (
                    <button onClick={() => markContacted(c.id)}
                      className="flex-1 text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-1.5 rounded-lg transition-colors">
                      Mark Contacted
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-white/25 text-sm">
              No contacts match your filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expanded row (table detail panel) ───────────────────────────────────────

function ExpandedRow({
  contact: c, override, onUpdate, onMarkContacted,
}: {
  contact: Contact;
  override: Override;
  onUpdate: (u: Partial<Override>) => void;
  onMarkContacted: () => void;
}) {
  const emails = extractEmails(c.contactInfo);
  const genres = realGenres(c.genres);
  const gNotes = genreNotes(c.genres);
  const notes = override.notes ?? c.notes;
  const dateContacted = override.dateContacted ?? c.dateContacted;
  const nextDate = override.nextContactDate ?? c.nextContactDate;
  const status = override.status ?? c.status ?? "";

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">

      {/* All contacts */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">All Contacts</p>
        <div className="space-y-1">
          {c.contactNames.map((name, i) => (
            <p key={i} className="text-xs text-white/65 leading-snug">
              {name.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}
            </p>
          ))}
        </div>
        {emails.length > 0 && (
          <div className="mt-3 space-y-1">
            {emails.map(email => (
              <a key={email} href={`mailto:${email}`}
                className="block text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors break-all">
                {email}
              </a>
            ))}
          </div>
        )}
        {c.address && <p className="mt-2 text-[10px] text-white/30 leading-snug">{c.address}</p>}
        {c.website && c.website !== "LINK" && (
          <p className="mt-1 text-[10px] text-white/25">{c.website}</p>
        )}
      </div>

      {/* Genres */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Genres</p>
        {gNotes.length > 0 && (
          <p className="text-[10px] text-amber-400/60 mb-2 italic leading-relaxed">{gNotes.join(" · ")}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {genres.map(g => (
            <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/6 text-white/40 border border-white/8">{g}</span>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-white/30">
          <span className="text-white/20 uppercase tracking-widest">Via </span>{c.preferredContact || "—"}
        </p>
      </div>

      {/* Dates */}
      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Date Contacted</p>
          <input type="date" value={dateContacted}
            onChange={e => onUpdate({ dateContacted: e.target.value })}
            className="w-full text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1.5 text-white/60 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${nextDate && isOverdue(nextDate) ? "text-red-400/70" : "text-white/25"}`}>
            Next Contact
          </p>
          <input type="date" value={nextDate}
            onChange={e => onUpdate({ nextContactDate: e.target.value })}
            className={`w-full text-[11px] bg-[#0A0D3A] border rounded-lg px-2 py-1.5 focus:outline-none transition ${nextDate && isOverdue(nextDate) ? "border-red-500/30 text-red-300 focus:border-red-400/60" : "border-white/10 text-white/60 focus:border-[#D4AF37]/40"}`}/>
        </div>
        {status !== "contacted" && status !== "replied" && (
          <button onClick={onMarkContacted}
            className="w-full text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-2 rounded-lg transition-colors">
            Mark Contacted Today
          </button>
        )}
      </div>

      {/* Notes */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Notes</p>
        <textarea
          value={notes}
          onChange={e => onUpdate({ notes: e.target.value })}
          placeholder="Add notes…"
          rows={5}
          className="w-full text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1.5 text-white/60 placeholder:text-white/15 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none"
        />
      </div>
    </div>
  );
}
