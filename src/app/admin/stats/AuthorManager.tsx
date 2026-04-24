"use client";

import { useState, useEffect, useCallback } from "react";

interface Author {
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

const EMPTY_FORM: Omit<Author, "id"> = {
  name: "",
  bio: "",
  website: "",
  amazon: "",
  instagram: "",
  tiktok: "",
  facebook: "",
  goodreads: "",
};

const FIELDS: { key: keyof Omit<Author, "id" | "name" | "bio">; label: string; placeholder: string }[] = [
  { key: "website", label: "Website", placeholder: "https://authorsite.com" },
  { key: "amazon", label: "Amazon author page", placeholder: "https://amazon.com/author/..." },
  { key: "instagram", label: "Instagram URL", placeholder: "https://instagram.com/..." },
  { key: "tiktok", label: "TikTok URL", placeholder: "https://tiktok.com/@..." },
  { key: "facebook", label: "Facebook URL", placeholder: "https://facebook.com/..." },
  { key: "goodreads", label: "Goodreads URL", placeholder: "https://goodreads.com/author/..." },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  const base =
    "w-full bg-[#050814] border border-[#1A2550] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/60 transition";
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}{required && <span className="text-[#D4AF37] ml-0.5">*</span>}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={base}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={base}
        />
      )}
    </div>
  );
}

function AuthorForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Omit<Author, "id">;
  onSave: (data: Omit<Author, "id">) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Author name" value={form.name} onChange={set("name")} placeholder="e.g. Lillian Minx Monroe" required />
      <Field label="Short bio" value={form.bio} onChange={set("bio")} placeholder="One or two sentences about the author…" textarea />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="flex-1 rounded-lg bg-[#D4AF37] py-2.5 text-sm font-bold text-black hover:bg-[#E0C15A] disabled:opacity-50 transition"
        >
          {saving ? "Saving…" : "Save author"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:border-white/40 hover:text-white transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AuthorManager() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/authors");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setAuthors(data.authors || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load authors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (form: Omit<Author, "id">) => {
    setSaving(true);
    try {
      const res = await fetch("/api/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setAuthors((prev) => [...prev, data.author].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add author");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id: string, form: Omit<Author, "id">) => {
    setSaving(true);
    try {
      const res = await fetch("/api/authors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setAuthors((prev) =>
        prev.map((a) => (a.id === id ? data.author : a)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update author");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this author? This won't affect any books.")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/authors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setAuthors((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete author");
    } finally {
      setDeletingId(null);
    }
  };

  const filledLinkCount = (a: Author) =>
    [a.website, a.amazon, a.instagram, a.tiktok, a.facebook, a.goodreads].filter(Boolean).length;

  return (
    <section className="mt-12 pt-12 border-t border-[#1A2550]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Author profiles</h2>
          <p className="mt-1 text-sm text-white/40">Manage links and bios shown in the author popup on Narrated Works.</p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black hover:bg-[#E0C15A] transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add author
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline text-red-400 hover:text-red-300">Dismiss</button>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="mb-6 rounded-2xl border border-[#D4AF37]/30 bg-[#0B1224] p-6">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-bold mb-4">New author</p>
          <AuthorForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
            saving={saving}
          />
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : authors.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#1A2550]">
          <p className="text-white/20 italic text-sm">No authors yet. Add one above.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {authors.map((author) => {
            const isEditing = editingId === author.id;
            const isExpanded = expandedId === author.id;
            const linkCount = filledLinkCount(author);

            return (
              <div
                key={author.id}
                className={`rounded-2xl border bg-[#0B1224] transition ${
                  isEditing ? "border-[#D4AF37]/40" : "border-[#1A2550] hover:border-[#1A2550]/80"
                }`}
              >
                {isEditing ? (
                  <div className="p-6">
                    <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-bold mb-4">Editing — {author.name}</p>
                    <AuthorForm
                      initial={{ name: author.name, bio: author.bio, website: author.website, amazon: author.amazon, instagram: author.instagram, tiktok: author.tiktok, facebook: author.facebook, goodreads: author.goodreads }}
                      onSave={(form) => handleEdit(author.id, form)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <>
                    {/* Row header */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : author.id)}
                      >
                        <p className="font-semibold text-white text-sm">{author.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {author.bio ? (
                            <p className="text-xs text-white/40 truncate max-w-sm">{author.bio}</p>
                          ) : (
                            <p className="text-xs text-white/20 italic">No bio</p>
                          )}
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${linkCount > 0 ? "bg-[#D4AF37]/15 text-[#D4AF37]" : "bg-white/5 text-white/20"}`}>
                            {linkCount} link{linkCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : author.id)}
                          className="rounded-md p-1.5 text-white/25 hover:text-white/70 hover:bg-white/5 transition"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          <svg className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setEditingId(author.id); setExpandedId(null); setAdding(false); }}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/30 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(author.id)}
                          disabled={deletingId === author.id}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-400/50 hover:text-red-400 border border-transparent hover:border-red-500/20 transition disabled:opacity-40"
                        >
                          {deletingId === author.id ? "…" : "Remove"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded link preview */}
                    {isExpanded && (
                      <div className="border-t border-[#1A2550] px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                          {FIELDS.map((f) => (
                            <div key={f.key} className="flex items-center gap-2 text-xs">
                              <span className="text-white/30 w-28 shrink-0">{f.label}</span>
                              {author[f.key] ? (
                                <a href={author[f.key]} target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] hover:underline truncate max-w-[200px]">
                                  {author[f.key].replace(/^https?:\/\/(www\.)?/, "")}
                                </a>
                              ) : (
                                <span className="text-white/15 italic">—</span>
                              )}
                            </div>
                          ))}
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
