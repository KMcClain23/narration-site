"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── types ────────────────────────────────────────────────────────────────────

type EmailCandidate = { email: string; senderName: string; subject: string };

type GatherState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "none" }
  | { status: "error"; message: string };

interface CoNarrator {
  id: string;
  name: string;
  bio: string;
  email?: string;
  website: string;
  amazon: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  goodreads: string;
}

const EMPTY_FORM: Omit<CoNarrator, "id"> = {
  name: "", bio: "", email: "",
  website: "", amazon: "", instagram: "", tiktok: "", facebook: "", goodreads: "",
};

const LINK_FIELDS: { key: keyof Omit<CoNarrator, "id">; label: string; placeholder: string }[] = [
  { key: "website",   label: "Website",   placeholder: "https://..." },
  { key: "amazon",    label: "Amazon",    placeholder: "https://amazon.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "tiktok",    label: "TikTok",    placeholder: "https://tiktok.com/@..." },
  { key: "facebook",  label: "Facebook",  placeholder: "https://facebook.com/..." },
  { key: "goodreads", label: "Goodreads", placeholder: "https://goodreads.com/..." },
];

// ─── shared input/textarea helper ────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, textarea, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean; type?: string; required?: boolean;
}) {
  const base = "w-full bg-[#050814] border border-[#1A2070] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/60 transition";
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}{required && <span className="text-[#D4AF37] ml-0.5">*</span>}
      </label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={base} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} />}
    </div>
  );
}

// ─── inline edit form ─────────────────────────────────────────────────────────

function CoNarratorForm({
  initial, onSave, onCancel, saving,
  gatherCandidates, currentSavedEmail, onGatherEmail,
}: {
  initial: Omit<CoNarrator, "id">;
  onSave: (data: Omit<CoNarrator, "id">) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  gatherCandidates?: EmailCandidate[];
  currentSavedEmail?: string;
  onGatherEmail?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const isSingleMatch = gatherCandidates?.length === 1 && !currentSavedEmail;

  return (
    <form
      onSubmit={async e => { e.preventDefault(); await onSave(form); }}
      className="space-y-4"
    >
      <Field label="Co-narrator name" value={form.name} onChange={set("name")} placeholder="e.g. Ann Dahlia" required />

      {/* Email + gather button */}
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label="Email (for status notifications)"
              value={form.email ?? ""}
              onChange={set("email")}
              placeholder="narrator@example.com"
              type="email"
            />
          </div>
          {onGatherEmail && (
            <button
              type="button"
              onClick={onGatherEmail}
              className="shrink-0 rounded-lg border border-white/15 px-3 py-2.5 text-[11px] font-semibold text-white/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition"
            >
              {(currentSavedEmail || form.email) ? "Change email →" : "Gather email →"}
            </button>
          )}
        </div>

        {/* Single match hint */}
        {isSingleMatch && (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            Found 1 match — confirm or change below
          </p>
        )}

        {/* Candidate picker */}
        {gatherCandidates && gatherCandidates.length > 0 && !isSingleMatch && (
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#D4AF37]/70 font-semibold mb-2">
              {gatherCandidates.length} candidate{gatherCandidates.length !== 1 ? "s" : ""} found — click to select
            </p>
            {gatherCandidates.map(c => {
              const isCurrent = c.email.toLowerCase() === (currentSavedEmail ?? "").toLowerCase();
              const isSelected = c.email.toLowerCase() === (form.email ?? "").toLowerCase();
              return (
                <button key={c.email} type="button"
                  onClick={() => set("email")(c.email)}
                  className={`w-full text-left rounded-lg px-3 py-2 transition-colors border ${
                    isSelected ? "border-[#D4AF37]/50 bg-[#D4AF37]/15" : "border-white/6 bg-black/20 hover:border-white/15 hover:bg-black/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{c.email}</span>
                    {isCurrent && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">saved</span>}
                    {isSelected && !isCurrent && (
                      <svg className="h-3 w-3 text-[#D4AF37] shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                  {c.subject && <p className="text-[10px] text-white/35 mt-0.5 truncate">from: &ldquo;{c.subject}&rdquo;</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Field label="Short bio" value={form.bio} onChange={set("bio")} placeholder="A line or two about this narrator…" textarea />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LINK_FIELDS.map(f => (
          <Field key={f.key} label={f.label} value={(form as Record<string, string>)[f.key] ?? ""} onChange={set(f.key)} placeholder={f.placeholder} />
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving || !form.name.trim()}
          className="flex-1 rounded-lg bg-[#D4AF37] py-2.5 text-sm font-bold text-black hover:bg-[#E0C15A] disabled:opacity-50 transition">
          {saving ? "Saving…" : "Save co-narrator"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:border-white/40 hover:text-white transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CoNarratorManager() {
  const [coNarrators, setCoNarrators] = useState<CoNarrator[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [adding, setAdding]           = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [gatherStates, setGatherStates] = useState<Record<string, GatherState>>({});
  const [gatherPending, setGatherPending] = useState<Record<string, EmailCandidate[]>>({});
  const [gatherAll, setGatherAll] = useState<{ phase: "idle" | "running" | "done"; found: number; total: number }>
    ({ phase: "idle", found: 0, total: 0 });
  const gatherAllRunning = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/co-narrators");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCoNarrators(data.co_narrators || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load co-narrators");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const handleAdd = async (form: Omit<CoNarrator, "id">) => {
    setSaving(true);
    try {
      const res  = await fetch("/api/co-narrators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setCoNarrators(prev => [...prev, data.co_narrator].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add co-narrator"); }
    finally { setSaving(false); }
  };

  const handleEdit = async (id: string, form: Omit<CoNarrator, "id">) => {
    setSaving(true);
    try {
      const res  = await fetch("/api/co-narrators", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...form }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setCoNarrators(prev => prev.map(n => n.id === id ? data.co_narrator : n).sort((a, b) => a.name.localeCompare(b.name)));
      setGatherPending(prev => { const n = { ...prev }; delete n[id]; return n; });
      setEditingId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update co-narrator"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this co-narrator? This won't affect any books.")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/co-narrators", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error("Failed to delete");
      setCoNarrators(prev => prev.filter(n => n.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete co-narrator"); }
    finally { setDeletingId(null); }
  };

  const cancelEdit = (id?: string) => {
    if (id) setGatherPending(prev => { const n = { ...prev }; delete n[id]; return n; });
    setEditingId(null);
    setAdding(false);
  };

  // ── gather email ──────────────────────────────────────────────────────────────

  const setGs = (id: string, state: GatherState) =>
    setGatherStates(prev => ({ ...prev, [id]: state }));

  const saveEmail = async (narrator: CoNarrator, email: string) => {
    const res = await fetch("/api/co-narrators", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: narrator.id, name: narrator.name, bio: narrator.bio, email,
        website: narrator.website, amazon: narrator.amazon, instagram: narrator.instagram,
        tiktok: narrator.tiktok, facebook: narrator.facebook, goodreads: narrator.goodreads }),
    });
    if (res.ok) {
      const d = await res.json();
      setCoNarrators(prev => prev.map(n => n.id === narrator.id ? d.co_narrator : n));
    }
  };

  const gatherEmailFor = async (narrator: CoNarrator, bulkMode = false): Promise<boolean> => {
    setGs(narrator.id, { status: "loading" });
    try {
      const res = await fetch("/api/email-gather-author", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: narrator.name }),
      });
      const d = await res.json();
      if (!res.ok) { setGs(narrator.id, { status: "error", message: d.error ?? "Failed" }); return false; }

      const candidates: EmailCandidate[] = d.candidates ?? [];
      if (candidates.length === 0) { setGs(narrator.id, { status: "none" }); return false; }

      if (bulkMode) {
        await saveEmail(narrator, candidates[0].email);
        setGs(narrator.id, { status: "idle" });
        return true;
      }

      const prefill = (candidates.length === 1 && !narrator.email) ? candidates[0].email : narrator.email ?? "";
      setGatherPending(prev => ({ ...prev, [narrator.id]: candidates }));
      setEditingId(narrator.id);
      setExpandedId(null);
      setAdding(false);
      // If editing open already, update form email via a workaround: the form re-mounts with new initial
      setGs(narrator.id, { status: "idle" });
      // Store prefill in a way the form can read
      void prefill; // form reads from gatherPending + narrator.email
      return false;
    } catch {
      setGs(narrator.id, { status: "error", message: "Network error" });
      return false;
    }
  };

  const gatherAllMissing = async () => {
    if (gatherAllRunning.current) return;
    const missing = coNarrators.filter(n => !n.email);
    if (!missing.length) return;
    gatherAllRunning.current = true;
    setGatherAll({ phase: "running", found: 0, total: missing.length });
    let found = 0;
    for (const narrator of missing) {
      const ok = await gatherEmailFor(narrator, true);
      if (ok) found++;
      setGatherAll(prev => ({ ...prev, found }));
    }
    setGatherAll({ phase: "done", found, total: missing.length });
    gatherAllRunning.current = false;
  };

  const filledLinkCount = (n: CoNarrator) =>
    [n.website, n.amazon, n.instagram, n.tiktok, n.facebook, n.goodreads].filter(Boolean).length;

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <section className="mt-12 pt-12 border-t border-[#1A2070]">

      {/* Section header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Co-narrator profiles</h2>
          <p className="mt-1 text-sm text-white/40">Manage links and bios shown in the co-narrator popup on Narrated Works.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Gather all missing emails */}
          {coNarrators.some(n => !n.email) && (
            <div className="flex flex-col items-end gap-1">
              <button onClick={gatherAllMissing} disabled={gatherAll.phase === "running"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white hover:border-white/30 transition disabled:opacity-40">
                {gatherAll.phase === "running" ? (
                  <><span className="h-3 w-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />Gathering {gatherAll.found}/{gatherAll.total}…</>
                ) : (
                  <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Gather all missing</>
                )}
              </button>
              {gatherAll.phase === "done" && (
                <p className="text-[11px] text-white/40">Found emails for {gatherAll.found} of {gatherAll.total} co-narrators</p>
              )}
            </div>
          )}

          {!adding && (
            <button onClick={() => { setAdding(true); setEditingId(null); }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black hover:bg-[#E0C15A] transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add co-narrator
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline text-red-400 hover:text-red-300">Dismiss</button>
        </div>
      )}

      {/* Add form — inline at top */}
      {adding && (
        <div className="mb-6 rounded-2xl border border-[#D4AF37]/30 bg-[#0A0D3A] p-6">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-bold mb-4">New co-narrator</p>
          <CoNarratorForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
            saving={saving}
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : coNarrators.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#1A2070]">
          <p className="text-white/20 italic text-sm">No co-narrators yet. Add one above.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {coNarrators.map(narrator => {
            const isEditing  = editingId === narrator.id;
            const isExpanded = expandedId === narrator.id;
            const linkCount  = filledLinkCount(narrator);
            const gs: GatherState = gatherStates[narrator.id] ?? { status: "idle" };
            const pending = gatherPending[narrator.id];

            return (
              <div key={narrator.id}
                className={`rounded-2xl border bg-[#0A0D3A] transition ${isEditing ? "border-[#D4AF37]/40" : "border-[#1A2070] hover:border-[#1A2070]/80"}`}>

                {isEditing ? (
                  /* ── Inline edit form ── */
                  <div className="p-6">
                    <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-bold mb-4">Editing — {narrator.name}</p>
                    <CoNarratorForm
                      initial={{
                        name:      narrator.name,
                        bio:       narrator.bio      ?? "",
                        email:     (pending?.length === 1 && !narrator.email) ? pending[0].email : narrator.email ?? "",
                        website:   narrator.website  ?? "",
                        amazon:    narrator.amazon   ?? "",
                        instagram: narrator.instagram ?? "",
                        tiktok:    narrator.tiktok   ?? "",
                        facebook:  narrator.facebook ?? "",
                        goodreads: narrator.goodreads ?? "",
                      }}
                      gatherCandidates={pending}
                      currentSavedEmail={narrator.email ?? ""}
                      onGatherEmail={() => gatherEmailFor(narrator)}
                      onSave={form => handleEdit(narrator.id, form)}
                      onCancel={() => cancelEdit(narrator.id)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <>
                    {/* ── Collapsed row ── */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : narrator.id)}>
                        <p className="font-semibold text-white text-sm">{narrator.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {narrator.bio
                            ? <p className="text-xs text-white/40 truncate max-w-xs">{narrator.bio}</p>
                            : <p className="text-xs text-white/20 italic">No bio</p>}
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${linkCount > 0 ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "bg-white/5 text-white/20"}`}>
                            {linkCount} link{linkCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px]">
                          {narrator.email
                            ? <span className="text-emerald-400/70">{narrator.email}</span>
                            : <span className="text-white/20 italic">No email</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Gather state indicators */}
                        {gs.status === "loading" && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
                            <span className="h-3 w-3 border border-white/30 border-t-white/60 rounded-full animate-spin" />
                            Searching…
                          </span>
                        )}
                        {gs.status === "none" && (
                          <span className="text-[11px] text-white/30 cursor-pointer" onClick={() => setGs(narrator.id, { status: "idle" })}>
                            No emails found
                          </span>
                        )}
                        {gs.status === "error" && (
                          <span className="text-[11px] text-red-400/70 cursor-pointer hover:text-red-300" onClick={() => setGs(narrator.id, { status: "idle" })}>
                            {gs.message} ✕
                          </span>
                        )}
                        {gs.status === "idle" && (
                          <button type="button" onClick={() => gatherEmailFor(narrator)}
                            className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white/50 hover:text-[#D4AF37] border border-white/8 hover:border-[#D4AF37]/30 transition">
                            {narrator.email ? "Change email →" : "Gather email →"}
                          </button>
                        )}

                        {/* Clear email X */}
                        {narrator.email && gs.status !== "loading" && (
                          <button type="button" title="Clear email"
                            onClick={() => { setGatherPending(prev => { const p = { ...prev }; delete p[narrator.id]; return p; }); setEditingId(narrator.id); setExpandedId(null); }}
                            className="text-white/20 hover:text-red-400 transition p-1 rounded" aria-label="Clear email">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        )}

                        {/* Expand toggle */}
                        <button onClick={() => setExpandedId(isExpanded ? null : narrator.id)}
                          className="rounded-md p-1.5 text-white/25 hover:text-white/70 hover:bg-white/5 transition"
                          aria-label={isExpanded ? "Collapse" : "Expand"}>
                          <svg className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                          </svg>
                        </button>

                        <button onClick={() => { setEditingId(narrator.id); setExpandedId(null); setAdding(false); }}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/30 transition">
                          Edit
                        </button>

                        <button onClick={() => handleDelete(narrator.id)}
                          disabled={deletingId === narrator.id}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-400/50 hover:text-red-400 border border-transparent hover:border-red-500/20 transition disabled:opacity-40">
                          {deletingId === narrator.id ? "…" : "Remove"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded links preview */}
                    {isExpanded && (
                      <div className="border-t border-[#1A2070] px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                          {LINK_FIELDS.map(f => {
                            const val = (narrator as unknown as Record<string, string>)[f.key];
                            return (
                              <div key={f.key} className="flex items-center gap-2 text-xs">
                                <span className="text-white/30 w-28 shrink-0">{f.label}</span>
                                {val
                                  ? <a href={val} target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] hover:underline truncate max-w-[200px]">{val.replace(/^https?:\/\/(www\.)?/, "")}</a>
                                  : <span className="text-white/15 italic">—</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
