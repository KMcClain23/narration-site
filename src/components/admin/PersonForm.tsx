"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { adminType } from "@/lib/design-tokens";
import { zipRoster, STATUSES, CANONICAL_GENRES } from "@/lib/production-contacts-constants";

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
  skills: string[];
  representation: string;
  notes: string;
  // Production-company-specific — empty/placeholder for author/co-narrator.
  label: string;
  status: string;
  address: string;
  contact_info: string;
  finding_source: string;
  date_contacted: string;
  next_contact_date: string;
  job_titles: string[];
  contact_names: string[];
};

export const EMPTY_PERSON: Person = {
  id: "", name: "", email: "", bio: "", website: "",
  amazon: "", instagram: "", tiktok: "", threads: "", facebook: "", goodreads: "",
  photo_url: null, location: "", preferred_contact: "", genres: [], skills: [], representation: "", notes: "",
  label: "", status: "", address: "", contact_info: "", finding_source: "",
  date_contacted: "", next_contact_date: "", job_titles: [], contact_names: [],
};

type TagFieldKey = "genres" | "skills";
type SelectFieldKey = "status";
type DateFieldKey = "date_contacted" | "next_contact_date";
type TextFieldKey = Exclude<keyof Person, "id" | "photo_url" | TagFieldKey | SelectFieldKey | DateFieldKey | "job_titles" | "contact_names">;

type FieldDef =
  | { key: TextFieldKey; label: string; kind: "text" | "email" | "url" | "textarea" }
  | { key: TagFieldKey; label: string; kind: "tags"; suggestions?: string[] }
  | { key: SelectFieldKey; label: string; kind: "select"; options: readonly { value: string; label: string }[] }
  | { key: DateFieldKey; label: string; kind: "date" }
  | { key: "roster"; label: string; kind: "roster" };

type TypeConfig = {
  labelSingular: string;
  nameLabel: string;
  hasPhoto: boolean;
  essentials: FieldDef[];
  more: FieldDef[];
  apiPath: string;
  uploadPersonType?: "author" | "co_narrator";
};

// Only the 'author' entry is functional in Stage 4.1. The other two are
// deliberately stubbed (real fields TBD in Stages 4.2/4.3) so this component
// never needs a structural refactor when those stages land — just richer
// config entries.
const FIELD_CONFIG: Record<PersonType, TypeConfig> = {
  author: {
    labelSingular: "Author",
    nameLabel: "Name",
    hasPhoto: true,
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
    nameLabel: "Name",
    hasPhoto: true,
    essentials: [
      { key: "email", label: "Email", kind: "email" },
      { key: "bio", label: "Short bio", kind: "textarea" },
      { key: "website", label: "Website", kind: "url" },
    ],
    more: [
      { key: "amazon", label: "Amazon page", kind: "url" },
      { key: "instagram", label: "Instagram", kind: "url" },
      { key: "tiktok", label: "TikTok", kind: "url" },
      // No Threads for co-narrators — confirmed the old CoNarratorManager UI
      // never had one and co_narrators has no threads column (per design
      // decision: narrators are less active there than authors).
      { key: "facebook", label: "Facebook", kind: "url" },
      { key: "goodreads", label: "Goodreads", kind: "url" },
      { key: "location", label: "Location", kind: "text" },
      { key: "preferred_contact", label: "Preferred contact method", kind: "text" },
      { key: "skills", label: "Skills", kind: "tags" },
      { key: "representation", label: "Representation", kind: "text" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    apiPath: "/api/co-narrators",
    uploadPersonType: "co_narrator",
  },
  "production-company": {
    labelSingular: "Production Company",
    nameLabel: "Company name",
    hasPhoto: false,
    essentials: [
      { key: "label", label: "Label", kind: "text" },
      { key: "status", label: "Status", kind: "select", options: STATUSES },
      { key: "website", label: "Website", kind: "url" },
      { key: "preferred_contact", label: "Preferred contact method", kind: "text" },
    ],
    more: [
      { key: "address", label: "Address", kind: "text" },
      { key: "roster", label: "Contact people", kind: "roster" },
      { key: "contact_info", label: "Contact info", kind: "textarea" },
      { key: "finding_source", label: "Finding source", kind: "text" },
      { key: "genres", label: "Genres", kind: "tags", suggestions: CANONICAL_GENRES },
      { key: "date_contacted", label: "Last contacted", kind: "date" },
      { key: "next_contact_date", label: "Next contact date", kind: "date" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
    apiPath: "/api/production-companies",
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

function TagsField({
  label, value, onChange, suggestions,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const listId = suggestions ? `taglist-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined;

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
          list={listId}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
        />
      </div>
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className={adminType.label}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={adminType.label}>{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

// job_titles and contact_names are two independent text[] columns — see
// zipRoster's comment. Fully controlled: re-zips from the two arrays on
// every render, edits build a new pair of arrays and hand them back up.
const rosterInputClass =
  "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none";

function RosterField({
  label, names, jobTitles, onChange,
}: {
  label: string;
  names: string[];
  jobTitles: string[];
  onChange: (names: string[], jobTitles: string[]) => void;
}) {
  const rows = zipRoster(names, jobTitles);

  const update = (next: { name: string; jobTitle: string }[]) => {
    onChange(next.map(r => r.name), next.map(r => r.jobTitle));
  };

  return (
    <div>
      <span className={adminType.label}>{label}</span>
      <div className="mt-1 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={e => update(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
              placeholder="Name"
              className={rosterInputClass}
            />
            <input
              value={row.jobTitle}
              onChange={e => update(rows.map((r, j) => (j === i ? { ...r, jobTitle: e.target.value } : r)))}
              placeholder="Job title"
              className={rosterInputClass}
            />
            <button
              type="button"
              onClick={() => update(rows.filter((_, j) => j !== i))}
              className="shrink-0 text-text-dim transition-colors hover:text-alert-red"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => update([...rows, { name: "", jobTitle: "" }])}
          className="text-xs font-medium text-accent-amber-dim transition-colors hover:text-accent-amber"
        >
          + Add person
        </button>
      </div>
    </div>
  );
}

// Dispatches a single FieldDef to the right editor. Defined outside
// PersonForm so it's a plain function, not recreated every render.
function renderField(
  def: FieldDef,
  form: Person,
  setField: (key: TextFieldKey, value: string) => void,
  setForm: (updater: (f: Person) => Person) => void,
  error?: string
) {
  switch (def.kind) {
    case "text":
    case "email":
    case "url":
    case "textarea":
      return <Field key={def.key} def={def} value={form[def.key]} onChange={v => setField(def.key, v)} error={error} />;
    case "tags":
      return (
        <TagsField
          key={def.key}
          label={def.label}
          value={form[def.key]}
          suggestions={def.suggestions}
          onChange={v => setForm(f => ({ ...f, [def.key]: v }))}
        />
      );
    case "select":
      return (
        <SelectField
          key={def.key}
          label={def.label}
          value={form[def.key]}
          options={def.options}
          onChange={v => setForm(f => ({ ...f, [def.key]: v }))}
        />
      );
    case "date":
      return (
        <DateField
          key={def.key}
          label={def.label}
          value={form[def.key]}
          onChange={v => setForm(f => ({ ...f, [def.key]: v }))}
        />
      );
    case "roster":
      return (
        <RosterField
          key={def.key}
          label={def.label}
          names={form.contact_names}
          jobTitles={form.job_titles}
          onChange={(names, jobTitles) => setForm(f => ({ ...f, contact_names: names, job_titles: jobTitles }))}
        />
      );
  }
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

  // Escape is an intentional, explicit dismiss — unlike a stray click
  // outside the modal, it can't happen by accident while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const bioRequired = mode === "contacts" && config.essentials.some(f => f.key === "bio");

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
      const saved: Person = { ...form, ...(data.author ?? data.co_narrator ?? data.production_company ?? {}) };
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
          {config.hasPhoto && (
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
          )}

          <label className="block">
            <span className={adminType.label}>{config.nameLabel}</span>
            <input
              type="text"
              value={form.name}
              onChange={e => setField("name", e.target.value)}
              className={inputClass}
            />
            {errors.name && <span className="mt-1 block text-[12px] text-alert-red">{errors.name}</span>}
          </label>

          {config.essentials.map(def => renderField(def, form, setField, setForm, def.key === "bio" ? errors.bio : undefined))}
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
            {config.more.map(def => renderField(def, form, setField, setForm))}
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
