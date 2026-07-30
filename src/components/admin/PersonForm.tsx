"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { adminType } from "@/lib/design-tokens";

export type PersonType = "author" | "co-narrator" | "production-company";
export type PersonFormMode = "contacts" | "quick-add";

// Superset of fields across all three person types — not every type uses
// every field (see FIELD_CONFIG below). Keeping one shared shape avoids
// per-type generics; unused fields are simply omitted from a type's config.
export type Person = {
  id: string;
  name: string;
  email: string;
  bio: string;
  website: string;
  amazon: string;
  instagram: string;
  tiktok: string;
  threads: string;
  facebook: string;
  goodreads: string;
  photo_url: string | null;
  location: string;
  preferred_contact: string;
  genres: string[];
  notes: string;
};

export const EMPTY_PERSON: Person = {
  id: "", name: "", email: "", bio: "", website: "",
  amazon: "", instagram: "", tiktok: "", threads: "", facebook: "", goodreads: "",
  photo_url: null, location: "", preferred_contact: "", genres: [], notes: "",
};

type TextFieldKey = Exclude<keyof Person, "id" | "genres" | "photo_url">;

type FieldDef =
  | { key: TextFieldKey; label: string; kind: "text" | "email" | "url" | "textarea" }
  | { key: "genres"; label: string; kind: "tags" };

type TypeConfig = {
  labelSingular: string;
  essentials: FieldDef[];
  more: FieldDef[];
  apiPath: string;
  uploadPersonType: "author" | "co_narrator";
};

// Only the 'author' entry is functional in Stage 4.1. The other two are
// deliberately stubbed (real fields TBD in Stages 4.2/4.3) so this component
// never needs a structural refactor when those stages land — just richer
// config entries.
const FIELD_CONFIG: Record<PersonType, TypeConfig> = {
  author: {
    labelSingular: "Author",
    essentials: [
      { key: "email", label: "Email", kind: "email" },
      { key: "bio", label: "Short bio", kind: "textarea" },
      { key: "website", label: "Website", kind: "url" },
    ],
    more: [
      { key: "amazon", label: "Amazon Author page", kind: "url" },
      { key: "instagram", label: "Instagram", kind: "url" },
      { key: "tiktok", label: "TikTok", kind: "url" },
      { key: "threads", label: "Threads", kind: "url" },
      { key: "facebook", label: "Facebook", kind: "url" },
      { key: "goodreads", label: "Goodreads", kind: "url" },
      { key: "location", label: "Location", kind: "text" },
      { key: "preferred_contact", label: "Preferred contact method", kind: "text" },
      { key: "genres", label: "Genres", kind: "tags" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    apiPath: "/api/authors",
    uploadPersonType: "author",
  },
  "co-narrator": {
    labelSingular: "Co-Narrator",
    essentials: [
      { key: "email", label: "Email", kind: "email" },
      { key: "bio", label: "Short bio", kind: "textarea" },
      { key: "website", label: "Website", kind: "url" },
    ],
    more: [
      { key: "amazon", label: "Amazon page", kind: "url" },
      { key: "instagram", label: "Instagram", kind: "url" },
      { key: "tiktok", label: "TikTok", kind: "url" },
      // No Threads for co-narrators yet — pending a Stage 4.2 product
      // decision (co_narrators has no threads column today either).
      { key: "facebook", label: "Facebook", kind: "url" },
      { key: "goodreads", label: "Goodreads", kind: "url" },
      // location/preferred_contact/genres/notes don't exist on co_narrators
      // yet — Stage 4.2 decides what it actually needs before adding them.
    ],
    apiPath: "/api/co-narrators",
    uploadPersonType: "co_narrator",
  },
  "production-company": {
    labelSingular: "Production Company",
    essentials: [
      { key: "email", label: "Email", kind: "email" },
      { key: "bio", label: "Short bio", kind: "textarea" },
      { key: "website", label: "Website", kind: "url" },
    ],
    more: [
      { key: "instagram", label: "Instagram", kind: "url" },
      { key: "facebook", label: "Facebook", kind: "url" },
    ],
    // Neither this API route nor upload support for this type exist yet —
    // Stage 4.3 builds both. Structure is here so that stage is additive.
    apiPath: "/api/production-companies",
    uploadPersonType: "author",
  },
};

const inputClass =
  "mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none";

function Field({
  def, value, onChange, error,
}: {
  def: Extract<FieldDef, { kind: "text" | "email" | "url" | "textarea" }>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="block">
      <span className={adminType.label}>{def.label}</span>
      {def.kind === "textarea" ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          type={def.kind === "email" ? "email" : def.kind === "url" ? "url" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
        />
      )}
      {error && <span className="mt-1 block text-[12px] text-alert-red">{error}</span>}
    </label>
  );
}

function TagsField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };

  return (
    <label className="block">
      <span className={adminType.label}>{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-surface-border bg-background px-2 py-1.5">
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-pill-neutral-bg px-2 py-0.5 text-[12px] text-pill-neutral-text"
          >
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-text-primary">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          }}
          onBlur={commit}
          placeholder={value.length ? "" : "Type and press Enter…"}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
        />
      </div>
    </label>
  );
}

export function PersonForm({
  type,
  mode,
  person,
  onSaved,
  onCancel,
}: {
  type: PersonType;
  mode: PersonFormMode;
  /** Omit (or pass null) to create a new person. */
  person?: Person | null;
  onSaved: (person: Person) => void;
  onCancel: () => void;
}) {
  const config = FIELD_CONFIG[type];
  const isCreate = !person?.id;
  const [form, setForm] = useState<Person>(person ?? EMPTY_PERSON);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<TextFieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Stable id for the photo's storage key even before the record is created —
  // the upload route only needs a unique string, not a real DB id yet.
  const uploadIdRef = useRef(person?.id || crypto.randomUUID());

  const bioRequired = mode === "contacts";

  const setField = (key: TextFieldKey, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/upload-person-photo/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType: config.uploadPersonType,
          id: uploadIdRef.current,
          name: form.name || "unnamed",
          contentType: file.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setForm(f => ({ ...f, photo_url: data.publicUrl }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const validate = (): boolean => {
    const next: Partial<Record<TextFieldKey, string>> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (bioRequired && !form.bio.trim()) next.bio = "Short bio is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(config.apiPath, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      const saved: Person = { ...form, ...(data.author ?? data.co_narrator ?? {}) };
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save — changes were not applied.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-h-[85vh] flex-col rounded-lg border border-surface-border bg-surface">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {formError && (
          <div className="mb-4 rounded-lg border border-alert-red/30 bg-alert-red/10 px-3 py-2 text-sm text-alert-red">
            {formError}
          </div>
        )}

        {/* Essentials */}
        <p className={adminType.label}>Essentials</p>
        <div className="mt-3 space-y-4">
          <div className="flex items-center gap-4">
            <PersonAvatar name={form.name || "?"} photoUrl={form.photo_url} size={64} />
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:border-accent-amber-dim hover:text-text-primary disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
          </div>

          <label className="block">
            <span className={adminType.label}>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={e => setField("name", e.target.value)}
              className={inputClass}
            />
            {errors.name && <span className="mt-1 block text-[12px] text-alert-red">{errors.name}</span>}
          </label>

          {config.essentials.map(def =>
            def.kind === "tags" ? null : (
              <Field
                key={def.key}
                def={def}
                value={form[def.key]}
                onChange={v => setField(def.key, v)}
                error={def.key === "bio" ? errors.bio : undefined}
              />
            )
          )}
        </div>

        {/* More (collapsed by default) */}
        <button
          type="button"
          onClick={() => setMoreOpen(v => !v)}
          className="mt-5 flex items-center gap-1.5 text-text-muted transition-colors hover:text-text-primary"
        >
          {moreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className={adminType.label}>More</span>
        </button>

        {moreOpen && (
          <div className="mt-3 space-y-4">
            {config.more.map(def =>
              def.kind === "tags" ? (
                <TagsField key={def.key} label={def.label} value={form.genres} onChange={v => setForm(f => ({ ...f, genres: v }))} />
              ) : (
                <Field key={def.key} def={def} value={form[def.key]} onChange={v => setField(def.key, v)} />
              )
            )}
          </div>
        )}
      </div>

      {/* Actions — outside the scrolling body so Save/Cancel are always reachable */}
      <div className="flex shrink-0 gap-3 border-t border-surface-border p-5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-full bg-accent-amber py-2.5 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${config.labelSingular}`}
        </button>
      </div>
    </div>
  );
}
