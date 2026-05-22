"use client";

import { useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Contact = {
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
  updatedAt?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: "",          label: "Needs Contact",   bg: "bg-red-500/15",     border: "border-red-500/25",     text: "text-red-300"     },
  { value: "contacted", label: "Contacted",        bg: "bg-amber-500/15",   border: "border-amber-500/25",   text: "text-amber-300"   },
  { value: "waiting",   label: "Waiting on Reply", bg: "bg-blue-500/15",    border: "border-blue-500/25",    text: "text-blue-300"    },
  { value: "replied",   label: "Received Reply",   bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-300" },
] as const;

const CANONICAL_GENRES = new Set([
  "Biography","Business","Childrens","Classics","Comics",
  "Erotica","Faith-based","Fantasy","Fiction","Health",
  "History","Horror","Humor","LGBTQ+","LitPRG","Memoir",
  "Mystery","Non-fiction","Romance","Sci-Fi","Self-Help",
  "Short Story/Anthology","Suspense","Thriller","Travel",
  "True Crime","Western","Young Adult",
]);

const EMPTY_CONTACT: Omit<Contact, "id"> = {
  company: "", label: "", status: "", jobTitles: [], contactNames: [],
  contactInfo: "", address: "", website: "", findingSource: "",
  preferredContact: "", dateContacted: "", nextContactDate: "",
  genres: [], notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const realGenres  = (g: string[]) => g.filter(x => CANONICAL_GENRES.has(x));
const genreNotes  = (g: string[]) => g.filter(x => !CANONICAL_GENRES.has(x));
const extractEmails = (s: string) =>
  (s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []);
const statusMeta  = (v: string) => STATUSES.find(s => s.value === v) ?? STATUSES[0];
const isOverdue   = (d: string) => !!d && new Date(d) < new Date(new Date().toDateString());
const fmtDate     = (d: string) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
};
const arrToLines  = (a: string[]) => a.join("\n");
const linesToArr  = (s: string)   => s.split("\n").map(l => l.trim()).filter(Boolean);

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: string }) {
  const s = statusMeta(value);
  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border whitespace-nowrap ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:border-[#D4AF37]/40 cursor-pointer">
      {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  contact, onSave, onClose,
}: {
  contact: Partial<Contact> & { id?: number };
  onSave: (data: Omit<Contact, "id" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !contact.id;
  const [form, setForm] = useState({
    company:          contact.company          ?? "",
    label:            contact.label            ?? "",
    status:           contact.status           ?? "",
    jobTitles:        arrToLines(contact.jobTitles    ?? []),
    contactNames:     arrToLines(contact.contactNames ?? []),
    contactInfo:      contact.contactInfo      ?? "",
    address:          contact.address          ?? "",
    website:          contact.website          ?? "",
    findingSource:    contact.findingSource    ?? "",
    preferredContact: contact.preferredContact ?? "",
    dateContacted:    contact.dateContacted    ?? "",
    nextContactDate:  contact.nextContactDate  ?? "",
    genres:           arrToLines(contact.genres ?? []),
    notes:            contact.notes            ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.company.trim()) { setError("Company name is required."); return; }
    setSaving(true);
    try {
      await onSave({
        company:          form.company.trim(),
        label:            form.label.trim(),
        status:           form.status,
        jobTitles:        linesToArr(form.jobTitles),
        contactNames:     linesToArr(form.contactNames),
        contactInfo:      form.contactInfo.trim(),
        address:          form.address.trim(),
        website:          form.website.trim(),
        findingSource:    form.findingSource.trim(),
        preferredContact: form.preferredContact.trim(),
        dateContacted:    form.dateContacted,
        nextContactDate:  form.nextContactDate,
        genres:           linesToArr(form.genres),
        notes:            form.notes.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl bg-[#0A0D3A] border border-white/10 rounded-2xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <h2 className="font-bold text-white text-lg">{isNew ? "Add Contact" : `Edit — ${contact.company}`}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Row 1 */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Company *</span>
              <input value={form.company} onChange={e => set("company", e.target.value)}
                placeholder="Blackstone Publishing"
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Label</span>
              <input value={form.label} onChange={e => set("label", e.target.value)}
                placeholder="e.g. Personal Priority"
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
          </div>

          {/* Contact names */}
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Contact Names</span>
            <span className="text-[10px] text-white/25 ml-2">one per line</span>
            <textarea value={form.contactNames} onChange={e => set("contactNames", e.target.value)}
              placeholder={"Jane Smith, Casting Director\nJohn Doe, Producer"}
              rows={3}
              className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none font-mono"/>
          </label>

          {/* Contact info */}
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Contact Info</span>
            <span className="text-[10px] text-white/25 ml-2">emails, links, notes — one per line</span>
            <textarea value={form.contactInfo} onChange={e => set("contactInfo", e.target.value)}
              placeholder={"casting@studio.com\nsubmissions@studio.com"}
              rows={3}
              className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none font-mono"/>
          </label>

          {/* Job titles + Preferred contact */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Job Titles</span>
              <span className="text-[10px] text-white/25 ml-2">one per line</span>
              <textarea value={form.jobTitles} onChange={e => set("jobTitles", e.target.value)}
                placeholder={"Casting Director\nProducer"}
                rows={2}
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none font-mono"/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Preferred Contact</span>
              <input value={form.preferredContact} onChange={e => set("preferredContact", e.target.value)}
                placeholder="e.g. Form On Website"
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
          </div>

          {/* Genres */}
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Genres</span>
            <span className="text-[10px] text-white/25 ml-2">one per line</span>
            <textarea value={form.genres} onChange={e => set("genres", e.target.value)}
              placeholder={"Romance\nFantasy\nThriller"}
              rows={3}
              className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none font-mono"/>
          </label>

          {/* Address + website */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Address</span>
              <input value={form.address} onChange={e => set("address", e.target.value)}
                placeholder="City, State, Country"
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Website</span>
              <input value={form.website} onChange={e => set("website", e.target.value)}
                placeholder="https://..."
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
          </div>

          {/* Finding source + status */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Finding Source</span>
              <input value={form.findingSource} onChange={e => set("findingSource", e.target.value)}
                placeholder="e.g. Narrator's Roadmap"
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Status</span>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 transition cursor-pointer">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {/* Dates */}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Date Contacted</span>
              <input type="date" value={form.dateContacted} onChange={e => set("dateContacted", e.target.value)}
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Next Contact Date</span>
              <input type="date" value={form.nextContactDate} onChange={e => set("nextContactDate", e.target.value)}
                className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
            </label>
          </div>

          {/* Notes */}
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-white/40 font-bold">Notes</span>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="Any notes about this contact…"
              rows={3}
              className="mt-1.5 w-full bg-black/30 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none"/>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-white/15 text-sm text-white/70 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-full bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold text-sm transition-colors disabled:opacity-50">
            {saving ? "Saving…" : isNew ? "Add Contact" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContactsClient({ contacts: initial }: { contacts: Contact[] }) {
  const [contacts, setContacts]     = useState(initial);
  const [view, setView]             = useState<"table" | "card">("table");
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter]   = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [editTarget, setEditTarget]     = useState<Contact | null | "new">(null);
  const [saving, setSaving]             = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);

  // ── API helpers ──────────────────────────────────────────────────────────

  const apiUpdate = async (id: number, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    setSaving(id);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const d = await res.json();
      if (d.contact) setContacts(prev => prev.map(c => c.id === id ? d.contact : c));
    } finally {
      setSaving(null);
    }
  };

  const apiCreate = async (data: Omit<Contact, "id" | "updatedAt">) => {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "Failed to create contact");
    if (d.contact) setContacts(prev => [...prev, d.contact].sort((a, b) => a.company.localeCompare(b.company)));
  };

  const apiDelete = async (id: number) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
  };

  const markContacted = (id: number) =>
    apiUpdate(id, { status: "contacted", dateContacted: new Date().toISOString().split("T")[0] });

  // ── Derived data ─────────────────────────────────────────────────────────

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => realGenres(c.genres).forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(c => {
      if (q) {
        const hay = [c.company, ...c.contactNames, c.contactInfo].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== null && c.status !== statusFilter) return false;
      if (genreFilter  !== null && !realGenres(c.genres).includes(genreFilter)) return false;
      return true;
    });
  }, [contacts, search, statusFilter, genreFilter]);

  const statusCounts = useMemo(() =>
    Object.fromEntries(STATUSES.map(s => [s.value, contacts.filter(c => c.status === s.value).length])),
  [contacts]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Search + add + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search company, contact, or email…"
            className="w-full bg-[#0A0D3A] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <button onClick={() => setEditTarget("new")}
          className="inline-flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#E0C15A] text-black text-xs font-bold px-4 py-2.5 rounded-full transition-colors shrink-0">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Add Contact
        </button>
        <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5 shrink-0">
          {(["table", "card"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors capitalize ${view === v ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
              {v === "table" ? "Table" : "Cards"}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter(null)}
          className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${statusFilter === null ? "bg-white/10 border-white/20 text-white" : "border-white/10 text-white/40 hover:text-white/70"}`}>
          All ({contacts.length})
        </button>
        {STATUSES.map(s => (
          <button key={s.value} onClick={() => setStatusFilter(statusFilter === s.value ? null : s.value)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${statusFilter === s.value ? `${s.bg} ${s.border} ${s.text}` : "border-white/10 text-white/40 hover:text-white/70"}`}>
            {s.label} ({statusCounts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {/* Genre filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-widest shrink-0">Genre:</span>
        <button onClick={() => setGenreFilter(null)}
          className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${genreFilter === null ? "bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]" : "border-white/10 text-white/35 hover:text-white/60"}`}>
          All
        </button>
        {allGenres.map(g => (
          <button key={g} onClick={() => setGenreFilter(genreFilter === g ? null : g)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${genreFilter === g ? "bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]" : "border-white/10 text-white/35 hover:text-white/60"}`}>
            {g}
          </button>
        ))}
      </div>

      {(search || statusFilter !== null || genreFilter !== null) && (
        <p className="text-xs text-white/35">
          Showing {filtered.length} of {contacts.length} contacts
          <button onClick={() => { setSearch(""); setStatusFilter(null); setGenreFilter(null); }}
            className="ml-3 text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors">
            Clear filters
          </button>
        </p>
      )}

      {/* ── TABLE VIEW ──────────────────────────────────────────────────── */}
      {view === "table" && (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.02]">
                  {["Company","Contact(s)","Email","Status","Preferred","Genres","Next Date",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const emails  = extractEmails(c.contactInfo);
                  const genres  = realGenres(c.genres);
                  const isExp   = expandedId === c.id;
                  const isSaving = saving === c.id;

                  return (
                    <>
                      <tr key={c.id}
                        onClick={() => setExpandedId(isExp ? null : c.id)}
                        className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer ${isExp ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="font-semibold text-sm text-white leading-snug">{c.company}</p>
                          {c.label && <p className="text-[10px] text-[#D4AF37]/60 mt-0.5">{c.label}</p>}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          {c.contactNames.slice(0, 2).map((n, i) => (
                            <p key={i} className="text-xs text-white/60 truncate leading-snug">
                              {n.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}
                            </p>
                          ))}
                          {c.contactNames.length > 2 && <p className="text-[10px] text-white/25">+{c.contactNames.length - 2} more</p>}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]" onClick={e => e.stopPropagation()}>
                          {emails.slice(0, 2).map(em => (
                            <a key={em} href={`mailto:${em}`}
                              className="block text-[11px] text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors truncate">{em}</a>
                          ))}
                          {emails.length === 0 && <span className="text-[11px] text-white/20 italic">—</span>}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <StatusSelect value={c.status} onChange={v => apiUpdate(c.id, { status: v })} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-white/50">{c.preferredContact || "—"}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[140px]">
                          <div className="flex flex-wrap gap-1">
                            {genres.slice(0, 3).map(g => (
                              <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/6 text-white/40 border border-white/8">{g}</span>
                            ))}
                            {genres.length > 3 && <span className="text-[9px] text-white/25">+{genres.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.nextContactDate
                            ? <span className={`text-[11px] font-medium ${isOverdue(c.nextContactDate) ? "text-red-400" : "text-white/45"}`}>
                                {fmtDate(c.nextContactDate)}
                              </span>
                            : <span className="text-[11px] text-white/20">—</span>
                          }
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isSaving && <div className="h-3.5 w-3.5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>}
                          </div>
                        </td>
                      </tr>

                      {isExp && (
                        <tr key={`${c.id}-exp`} className="border-b border-white/8 bg-[#06082E]/60">
                          <td colSpan={8} className="px-4 py-5">
                            <ExpandedRow
                              contact={c}
                              saving={isSaving}
                              onUpdate={u => apiUpdate(c.id, u)}
                              onMarkContacted={() => markContacted(c.id)}
                              onEdit={() => setEditTarget(c)}
                              onDelete={() => setDeleteConfirm(c)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-white/25 text-sm">No contacts match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CARD VIEW ───────────────────────────────────────────────────── */}
      {view === "card" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const s      = statusMeta(c.status);
            const emails = extractEmails(c.contactInfo);
            const genres = realGenres(c.genres);
            const gNotes = genreNotes(c.genres);
            const isSaving = saving === c.id;

            return (
              <div key={c.id} className={`rounded-2xl border bg-[#0A0D3A] p-5 flex flex-col gap-4 ${s.border}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white leading-snug">{c.company}</h3>
                    {c.findingSource && <p className="text-[10px] text-white/30 mt-0.5">via {c.findingSource}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSaving && <div className="h-3.5 w-3.5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>}
                    <StatusBadge value={c.status} />
                  </div>
                </div>

                {c.contactNames.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Contacts</p>
                    {c.contactNames.map((n, i) => (
                      <p key={i} className="text-xs text-white/65 leading-snug">
                        {n.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}
                      </p>
                    ))}
                  </div>
                )}

                {emails.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Email</p>
                    {emails.map(em => (
                      <a key={em} href={`mailto:${em}`}
                        className="block text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors break-all">{em}</a>
                    ))}
                  </div>
                )}

                {c.preferredContact && (
                  <p className="text-[11px]">
                    <span className="text-white/25 uppercase tracking-widest text-[10px]">Via </span>
                    <span className={c.preferredContact === "By Invite ONLY" ? "text-amber-400 font-semibold" : "text-white/60"}>
                      {c.preferredContact}
                    </span>
                  </p>
                )}

                {genres.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Genres</p>
                    {gNotes.length > 0 && <p className="text-[10px] text-amber-400/60 mb-1.5 italic">{gNotes.join(" · ")}</p>}
                    <div className="flex flex-wrap gap-1">
                      {genres.map(g => (
                        <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/6 text-white/45 border border-white/8">{g}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Contacted</p>
                    <input type="date" value={c.dateContacted}
                      onChange={e => apiUpdate(c.id, { dateContacted: e.target.value })}
                      className="w-full text-[11px] bg-black/30 border border-white/8 rounded-lg px-2 py-1 text-white/60 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.nextContactDate && isOverdue(c.nextContactDate) ? "text-red-400/70" : "text-white/25"}`}>Next Contact</p>
                    <input type="date" value={c.nextContactDate}
                      onChange={e => apiUpdate(c.id, { nextContactDate: e.target.value })}
                      className={`w-full text-[11px] bg-black/30 border rounded-lg px-2 py-1 focus:outline-none transition ${c.nextContactDate && isOverdue(c.nextContactDate) ? "border-red-500/30 text-red-300 focus:border-red-400/60" : "border-white/8 text-white/60 focus:border-[#D4AF37]/40"}`}/>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Notes</p>
                  <textarea value={c.notes} onChange={e => apiUpdate(c.id, { notes: e.target.value })}
                    placeholder="Add notes…" rows={2}
                    className="w-full text-[11px] bg-black/30 border border-white/8 rounded-lg px-2 py-1.5 text-white/60 placeholder:text-white/15 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none"/>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-white/8">
                  <StatusSelect value={c.status} onChange={v => apiUpdate(c.id, { status: v })} />
                  {c.status !== "contacted" && c.status !== "replied" && (
                    <button onClick={() => markContacted(c.id)}
                      className="flex-1 text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-1.5 rounded-lg transition-colors">
                      Mark Contacted
                    </button>
                  )}
                  <button onClick={() => setEditTarget(c)} title="Edit all fields"
                    className="p-1.5 text-white/30 hover:text-white/70 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-white/25 text-sm">No contacts match your filters.</div>
          )}
        </div>
      )}

      {/* ── Edit / Add modal ───────────────────────────────────────────── */}
      {editTarget && (
        <EditModal
          contact={editTarget === "new" ? EMPTY_CONTACT : editTarget}
          onSave={async data => {
            if (editTarget === "new") {
              await apiCreate(data);
            } else {
              await apiUpdate(editTarget.id, data);
            }
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Delete confirmation ────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/65 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="w-full max-w-sm bg-[#0A0D3A] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-white text-base mb-2">Delete contact?</h3>
            <p className="text-sm text-white/55 mb-6 leading-relaxed">
              <span className="text-white font-semibold">{deleteConfirm.company}</span> will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-full border border-white/15 text-sm text-white/70 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => { apiDelete(deleteConfirm.id); setDeleteConfirm(null); }}
                className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Expanded row (table detail panel) ───────────────────────────────────────

function ExpandedRow({
  contact: c, saving, onUpdate, onMarkContacted, onEdit, onDelete,
}: {
  contact: Contact;
  saving: boolean;
  onUpdate: (u: Partial<Contact>) => void;
  onMarkContacted: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const emails = extractEmails(c.contactInfo);
  const genres = realGenres(c.genres);
  const gNotes = genreNotes(c.genres);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">All Contacts</p>
        <div className="space-y-1">
          {c.contactNames.map((n, i) => (
            <p key={i} className="text-xs text-white/65 leading-snug">{n.replace(/\s*(LinkedIn|Facebook)\s*/gi, "").trim()}</p>
          ))}
        </div>
        {emails.length > 0 && (
          <div className="mt-3 space-y-1">
            {emails.map(em => (
              <a key={em} href={`mailto:${em}`} className="block text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors break-all">{em}</a>
            ))}
          </div>
        )}
        {c.address && <p className="mt-2 text-[10px] text-white/30 leading-snug">{c.address}</p>}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-2">Genres</p>
        {gNotes.length > 0 && <p className="text-[10px] text-amber-400/60 mb-2 italic leading-relaxed">{gNotes.join(" · ")}</p>}
        <div className="flex flex-wrap gap-1">
          {genres.map(g => <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/6 text-white/40 border border-white/8">{g}</span>)}
        </div>
        <p className="mt-3 text-[10px] text-white/30">
          <span className="text-white/20 uppercase tracking-widest">Via </span>{c.preferredContact || "—"}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Date Contacted</p>
          <input type="date" value={c.dateContacted}
            onChange={e => onUpdate({ dateContacted: e.target.value })}
            className="w-full text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1.5 text-white/60 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.nextContactDate && isOverdue(c.nextContactDate) ? "text-red-400/70" : "text-white/25"}`}>Next Contact</p>
          <input type="date" value={c.nextContactDate}
            onChange={e => onUpdate({ nextContactDate: e.target.value })}
            className={`w-full text-[11px] bg-[#0A0D3A] border rounded-lg px-2 py-1.5 focus:outline-none transition ${c.nextContactDate && isOverdue(c.nextContactDate) ? "border-red-500/30 text-red-300 focus:border-red-400/60" : "border-white/10 text-white/60 focus:border-[#D4AF37]/40"}`}/>
        </div>
        {c.status !== "contacted" && c.status !== "replied" && (
          <button onClick={onMarkContacted} disabled={saving}
            className="w-full text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Mark Contacted Today"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Notes</p>
          <textarea value={c.notes} onChange={e => onUpdate({ notes: e.target.value })}
            placeholder="Add notes…" rows={4}
            className="w-full text-[11px] bg-[#0A0D3A] border border-white/10 rounded-lg px-2 py-1.5 text-white/60 placeholder:text-white/15 focus:outline-none focus:border-[#D4AF37]/40 transition resize-none"/>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit}
            className="flex-1 text-xs font-bold text-white/70 border border-white/15 hover:border-white/30 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
            Edit all fields
          </button>
          <button onClick={onDelete}
            className="px-3 py-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors text-xs font-bold">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
