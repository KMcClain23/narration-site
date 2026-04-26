"use client";

import { useState, useEffect, useCallback } from "react";

interface CoNarrator {
  id: string;
  name: string;
  bio: string;
  website: string;
  amazon: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  goodreads: string;
}

const EMPTY_FORM: Omit<CoNarrator, "id"> = {
  name: "",
  bio: "",
  website: "",
  amazon: "",
  instagram: "",
  tiktok: "",
  facebook: "",
  goodreads: "",
};

const LINK_FIELDS = [
  { key: "website",   label: "Website",   placeholder: "https://..." },
  { key: "amazon",    label: "Amazon",    placeholder: "https://amazon.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "tiktok",    label: "TikTok",    placeholder: "https://tiktok.com/@..." },
  { key: "facebook",  label: "Facebook",  placeholder: "https://facebook.com/..." },
  { key: "goodreads", label: "Goodreads", placeholder: "https://goodreads.com/..." },
];

export default function CoNarratorManager() {
  const [coNarrators, setCoNarrators] = useState<CoNarrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<CoNarrator, "id">>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/co-narrators");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCoNarrators(data.co_narrators || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load co-narrators");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/co-narrators", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (editingId) {
        setCoNarrators(prev => prev.map(n => n.id === editingId ? data.co_narrator : n));
      } else {
        setCoNarrators(prev => [...prev, data.co_narrator]);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      const res = await fetch("/api/co-narrators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setCoNarrators(prev => prev.filter(n => n.id !== id));
    } catch {
      setError("Delete failed");
    }
  };

  const startEdit = (n: CoNarrator) => {
    setEditingId(n.id);
    setForm({ name: n.name, bio: n.bio, website: n.website, amazon: n.amazon, instagram: n.instagram, tiktok: n.tiktok, facebook: n.facebook, goodreads: n.goodreads });
    setExpandedId(n.id);
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  return (
    <section className="mt-12 pt-12 border-t border-[#1A2070]">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Co-narrator profiles</h2>
          <p className="mt-1 text-sm text-white/40">Manage links and bios shown in the co-narrator popup on Narrated Works.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Add / Edit form */}
      <div className="rounded-2xl border border-[#1A2070] bg-[#0A0D3A] p-5 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
          {editingId ? "Edit co-narrator" : "Add a co-narrator"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-1">Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ann Dahlia"
              className="w-full rounded-lg bg-[#06082E] border border-[#1A2070] p-3 text-sm outline-none focus:border-[#D4AF37]/60 text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-white/40 uppercase tracking-wider block mb-1">Bio</label>
            <textarea
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={3}
              placeholder="Short bio about this narrator..."
              className="w-full rounded-lg bg-[#06082E] border border-[#1A2070] p-3 text-sm outline-none focus:border-[#D4AF37]/60 text-white resize-none"
            />
          </div>
          {LINK_FIELDS.map(field => (
            <div key={field.key}>
              <label className="text-xs text-white/40 uppercase tracking-wider block mb-1">{field.label}</label>
              <input
                value={(form as Record<string, string>)[field.key]}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full rounded-lg bg-[#06082E] border border-[#1A2070] p-3 text-sm outline-none focus:border-[#D4AF37]/60 text-white"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-5 py-2.5 rounded-full text-sm transition disabled:opacity-50"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Add co-narrator"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}
              className="border border-white/20 text-white/60 hover:text-white px-5 py-2.5 rounded-full text-sm transition">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-10 text-center">
          <div className="inline-block h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : coNarrators.length === 0 ? (
        <div className="py-10 text-center rounded-2xl border border-dashed border-[#1A2070]">
          <p className="text-white/20 italic text-sm">No co-narrators yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coNarrators.map(n => {
            const isExpanded = expandedId === n.id;
            const links = LINK_FIELDS.filter(f => (n as unknown as Record<string, string>)[f.key]);
            return (
              <div key={n.id} className="rounded-2xl border border-[#1A2070] bg-[#0A0D3A] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : n.id)}>
                  <div>
                    <p className="font-semibold text-white">{n.name}</p>
                    {n.bio && <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{n.bio}</p>}
                    {!n.bio && !links.length && <p className="text-xs text-yellow-400/60 mt-0.5">No bio or links yet — click Edit to add</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={e => { e.stopPropagation(); startEdit(n); }}
                      className="text-xs font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition">
                      Edit
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); handleDelete(n.id, n.name); }}
                      className="text-xs font-bold text-red-400/60 hover:text-red-400 border border-red-400/20 px-3 py-1.5 rounded-full hover:bg-red-400/10 transition">
                      Delete
                    </button>
                    <svg className={`h-4 w-4 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-white/6 pt-3">
                    {links.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {links.map(f => (
                          <a key={f.key} href={(n as unknown as Record<string, string>)[f.key]} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#D4AF37] border border-[#D4AF37]/25 px-3 py-1 rounded-full hover:bg-[#D4AF37]/10 transition inline-flex items-center gap-1">
                            {f.label} ↗
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/30 italic">No links added yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
