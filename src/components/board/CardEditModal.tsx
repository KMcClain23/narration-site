"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { adminType } from "@/lib/design-tokens";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import type { NarrationFormat, ArchivedReason } from "@/types/book";

// Full board_cards row shape needed across all four tabs (only Details is
// built out this stage — Production/Content/Links fields are carried in the
// type now so Stage 6.2 doesn't need a breaking type change).
export type FullBoardCard = {
  id: string;
  title: string;
  subtitle: string;
  cover_url: string;
  author: string;
  co_narrator: string; // JSON-encoded array string — see board-card-utils.ts
  author_notes: string;
  narration_format: NarrationFormat | null;
  is_confidential: boolean;
  deadline: string;
  status: string;
  word_count: number;
  payment_type: string;
  pfh_rate: number;
  first15_due: string;
  first_15_complete: boolean;
  production_type: "indie" | "company" | null;
  production_company: string | null;
  description: string;
  tags: string[];
  trigger_warnings: string[];
  audible_link: string;
  ar_link: string;
  spotify_link: string;
  script_url: string;
  archived_at: string | null;
  archived_reason: ArchivedReason | null;
  archived_notes: string | null;
};

function mapToFullBoardCard(row: Record<string, unknown>): FullBoardCard {
  return {
    id: String(row.id),
    title: (row.title as string) ?? "",
    subtitle: (row.subtitle as string) ?? "",
    cover_url: (row.cover_url as string) ?? "",
    author: (row.author as string) ?? "",
    co_narrator: (row.co_narrator as string) ?? "",
    author_notes: (row.author_notes as string) ?? "",
    narration_format: (row.narration_format as NarrationFormat) ?? null,
    is_confidential: Boolean(row.is_confidential),
    deadline: (row.deadline as string) ?? "",
    status: (row.status as string) ?? "contracted",
    word_count: (row.word_count as number) ?? 0,
    payment_type: (row.payment_type as string) ?? "pfh",
    pfh_rate: (row.pfh_rate as number) ?? 0,
    first15_due: (row.first15_due as string) ?? "",
    first_15_complete: Boolean(row.first_15_complete),
    production_type: (row.production_type as "indie" | "company") ?? null,
    production_company: (row.production_company as string) ?? null,
    description: (row.description as string) ?? "",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    trigger_warnings: Array.isArray(row.trigger_warnings) ? (row.trigger_warnings as string[]) : [],
    audible_link: (row.audible_link as string) ?? "",
    ar_link: (row.ar_link as string) ?? "",
    spotify_link: (row.spotify_link as string) ?? "",
    script_url: (row.script_url as string) ?? "",
    archived_at: (row.archived_at as string) ?? null,
    archived_reason: (row.archived_reason as ArchivedReason) ?? null,
    archived_notes: (row.archived_notes as string) ?? null,
  };
}

const STATUSES = [
  { value: "audition", label: "Audition", bg: "bg-purple-500/15", border: "border-purple-500/25", text: "text-purple-300" },
  { value: "contracted", label: "Contracted", bg: "bg-blue-500/15", border: "border-blue-500/25", text: "text-blue-300" },
  { value: "prepping", label: "Prepping", bg: "bg-status-prepping/15", border: "border-status-prepping/25", text: "text-status-prepping" },
  { value: "recording", label: "Recording", bg: "bg-yellow-500/15", border: "border-yellow-500/25", text: "text-yellow-300" },
  { value: "editing", label: "Editing", bg: "bg-orange-500/15", border: "border-orange-500/25", text: "text-orange-300" },
  { value: "released", label: "Released", bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-300" },
] as const;

function statusMeta(value: string) {
  return STATUSES.find(s => s.value === value) ?? STATUSES[1];
}

const NARRATION_FORMATS = ["solo", "dual", "duet", "multicast"] as const;
const ARCHIVE_REASONS = ["recasted", "canceled", "other"] as const;
const ARCHIVE_REASON_LABEL: Record<string, string> = { recasted: "Recasted", canceled: "Canceled", other: "Other" };

type TabId = "details" | "production" | "content" | "links";
const TABS: { id: TabId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "production", label: "Production" },
  { id: "content", label: "Content" },
  { id: "links", label: "Links" },
];

function formatArchivedDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // timeZone pinned to UTC — server/client must render the same string or
  // React throws a hydration mismatch (bit us for real in Stage 5).
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

function StatusPill({ value }: { value: string }) {
  const s = statusMeta(value);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function CardEditModal({
  cardId,
  onClose,
  onSaved,
  authorNames,
  coNarratorNames,
}: {
  cardId: string;
  onClose: () => void;
  onSaved: (card: FullBoardCard) => void;
  authorNames: string[];
  coNarratorNames: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FullBoardCard | null>(null);
  const [savedForm, setSavedForm] = useState<FullBoardCard | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [authorQuery, setAuthorQuery] = useState("");
  const [authorDropOpen, setAuthorDropOpen] = useState(false);
  const authorDropRef = useRef<HTMLDivElement>(null);
  const [cnQuery, setCnQuery] = useState("");
  const [cnDropOpen, setCnDropOpen] = useState(false);
  const cnDropRef = useRef<HTMLDivElement>(null);
  const cnInputRef = useRef<HTMLInputElement>(null);

  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState<typeof ARCHIVE_REASONS[number]>("recasted");
  const [archiveNotes, setArchiveNotes] = useState("");
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/board?id=${cardId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (!d.card) throw new Error(d.error || "Card not found.");
        const full = mapToFullBoardCard(d.card);
        setForm(full);
        setSavedForm(full);
        setAuthorQuery(full.author);
      })
      .catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load card."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cardId]);

  // Escape closes; click-outside intentionally does not — this is a form
  // modal, matching the admin-wide rule from Stage 5 (Cancel/Escape only).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (authorDropRef.current && !authorDropRef.current.contains(e.target as Node)) setAuthorDropOpen(false);
      if (cnDropRef.current && !cnDropRef.current.contains(e.target as Node)) setCnDropOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const isDirty = useMemo(
    () => (form && savedForm ? JSON.stringify(form) !== JSON.stringify(savedForm) : false),
    [form, savedForm],
  );

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const urlRes = await fetch("/api/upload-cover/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Cover upload failed.");
      const putRes = await fetch(urlData.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Cover upload failed.");
      setForm(p => (p ? { ...p, cover_url: urlData.publicUrl } : p));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Cover upload failed.");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { id, ...fields } = form;
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save changes.");
      const saved = mapToFullBoardCard(d.card);
      setForm(saved);
      setSavedForm(saved);
      setSaveSuccess(true);
      onSaved(saved);
      setTimeout(onClose, 500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save changes.");
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!form) return;
    setArchiving(true);
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          archived_at: new Date().toISOString(),
          archived_reason: archiveReason,
          archived_notes: archiveNotes.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to archive project.");
      onSaved(mapToFullBoardCard(d.card));
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to archive project.");
      setArchiving(false);
      setArchiveConfirmOpen(false);
    }
  };

  const handleRestore = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, archived_at: null, archived_reason: null, archived_notes: null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to restore project.");
      const restored = mapToFullBoardCard(d.card);
      setForm(restored);
      setSavedForm(restored);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to restore project.");
    } finally {
      setSaving(false);
    }
  };

  const saveButtonLabel = saving ? (saveSuccess ? "Saved ✓" : "Saving…") : "Save Changes";

  const renderDetailsTab = () => {
    if (!form) return null;
    const selectedCoNarrators = parseCoNarrators(form.co_narrator);
    const cnQ = cnQuery.trim().toLowerCase();
    const cnMatches = (cnQ ? coNarratorNames.filter(n => n.toLowerCase().includes(cnQ)) : coNarratorNames)
      .filter(n => !selectedCoNarrators.includes(n));
    const cnCanAddFree = cnQ && !coNarratorNames.some(n => n.toLowerCase() === cnQ) && !selectedCoNarrators.some(n => n.toLowerCase() === cnQ);

    const authorQ = authorQuery.trim().toLowerCase();
    const authorMatches = authorQ.length === 0 ? authorNames : authorNames.filter(n => n.toLowerCase().includes(authorQ));

    const inputCls = "w-full rounded-lg border border-surface-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none transition-colors";

    return (
      <div className="space-y-8">
        {/* Section 1: Basics */}
        <div className="space-y-4">
          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Book title *</label>
            <input value={form.title} onChange={e => setForm(p => p && { ...p, title: e.target.value })}
              placeholder="e.g. Whiskey & Lies" className={inputCls} />
          </div>
          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Subtitle</label>
            <input value={form.subtitle} onChange={e => setForm(p => p && { ...p, subtitle: e.target.value })}
              placeholder="e.g. Sultry Secrets Book 4" className={inputCls} />
          </div>
          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Cover image</label>
            <label className="flex items-center gap-3 rounded-lg border border-dashed border-surface-border px-3 py-3 cursor-pointer transition-colors hover:border-accent-amber-dim/60">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadCover(e.target.files[0]); }} />
              {uploadingCover ? (
                <span className="flex items-center gap-2 text-xs text-accent-amber-bright">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-amber-bright border-t-transparent" />
                  Uploading…
                </span>
              ) : form.cover_url ? (
                <>
                  <img src={form.cover_url} alt="Cover" className="h-10 w-7 rounded object-cover" />
                  <span className={adminType.small}>Click to replace</span>
                </>
              ) : (
                <span className={adminType.small}>Upload cover image</span>
              )}
            </label>
          </div>
        </div>

        <div className="border-t border-surface-border pt-6">
          <p className={`${adminType.label} mb-4`}>People</p>
          <div className="space-y-4">
            <div className="block" ref={authorDropRef}>
              <label className={`${adminType.label} mb-1.5 block`}>Author</label>
              <div className="relative">
                <input
                  type="text"
                  value={authorQuery}
                  onChange={e => { setAuthorQuery(e.target.value); setForm(p => p && { ...p, author: e.target.value }); setAuthorDropOpen(true); }}
                  onFocus={() => setAuthorDropOpen(true)}
                  placeholder="e.g. E.A. Harper"
                  className={inputCls}
                />
                {authorDropOpen && authorMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-2xl">
                    {authorMatches.map(name => (
                      <button key={name} type="button"
                        onClick={() => { setAuthorQuery(name); setForm(p => p && { ...p, author: name }); setAuthorDropOpen(false); }}
                        className="block w-full px-3 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface hover:text-text-primary">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="block" ref={cnDropRef}>
              <label className={`${adminType.label} mb-1.5 block`}>Co-narrators</label>
              <div className="relative">
                <div
                  className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-surface-border bg-background px-3 py-2 transition-colors focus-within:border-accent-amber-dim cursor-text"
                  onClick={() => cnInputRef.current?.focus()}
                >
                  {selectedCoNarrators.map(name => (
                    <span key={name} className="flex shrink-0 items-center gap-1 rounded-full bg-pill-neutral-bg px-2 py-0.5 text-xs text-pill-neutral-text">
                      {name}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setForm(p => p && { ...p, co_narrator: JSON.stringify(parseCoNarrators(p.co_narrator).filter(n => n !== name)) }); }}
                        className="leading-none text-pill-neutral-text/60 transition-colors hover:text-pill-neutral-text">
                        ×
                      </button>
                    </span>
                  ))}
                  <input ref={cnInputRef} type="text" value={cnQuery}
                    onChange={e => { setCnQuery(e.target.value); setCnDropOpen(true); }}
                    onFocus={() => setCnDropOpen(true)}
                    placeholder={selectedCoNarrators.length === 0 ? "Add co-narrator…" : ""}
                    className="min-w-[100px] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none" />
                </div>
                {cnDropOpen && (cnMatches.length > 0 || cnCanAddFree) && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-2xl">
                    {cnMatches.map(name => (
                      <button key={name} type="button"
                        onClick={() => { setForm(p => p && { ...p, co_narrator: JSON.stringify([...parseCoNarrators(p.co_narrator), name]) }); setCnQuery(""); setCnDropOpen(false); }}
                        className="block w-full px-3 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface hover:text-text-primary">
                        {name}
                      </button>
                    ))}
                    {cnCanAddFree && (
                      <button type="button"
                        onClick={() => { setForm(p => p && { ...p, co_narrator: JSON.stringify([...parseCoNarrators(p.co_narrator), cnQuery.trim()]) }); setCnQuery(""); setCnDropOpen(false); }}
                        className="block w-full px-3 py-2 text-left text-sm text-accent-amber-bright transition-colors hover:bg-surface">
                        Add &ldquo;{cnQuery.trim()}&rdquo;
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <span className={`${adminType.label} mb-1.5 flex items-center`}>
                Narration format
                <InfoTooltip>
                  <p><strong>Solo:</strong> One narrator performs everything.</p>
                  <p><strong>Dual:</strong> Two narrators alternating chapters or POVs.</p>
                  <p><strong>Duet:</strong> Both narrators perform every scene together.</p>
                  <p><strong>Multicast:</strong> Three or more narrators, often a full cast.</p>
                </InfoTooltip>
              </span>
              <div className="flex gap-1 rounded-lg border border-surface-border bg-background p-1">
                {NARRATION_FORMATS.map(fmt => (
                  <button key={fmt} type="button"
                    onClick={() => setForm(p => p && { ...p, narration_format: p.narration_format === fmt ? null : fmt })}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                      form.narration_format === fmt ? "bg-accent-amber text-background" : "text-text-muted hover:bg-surface-raised hover:text-text-primary"
                    }`}>
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-surface-border pt-6">
          <p className={`${adminType.label} mb-4`}>Timing</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${adminType.label} mb-1.5 block`}>Deadline</label>
              <input type="date" value={form.deadline} onChange={e => setForm(p => p && { ...p, deadline: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className={`${adminType.label} mb-1.5 block`}>Status</label>
              <select value={form.status} onChange={e => setForm(p => p && { ...p, status: e.target.value })}
                className={`${inputCls} cursor-pointer`}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-surface-border pt-6">
          <p className={`${adminType.label} mb-4`}>Flags</p>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={form.is_confidential}
              onChange={e => setForm(p => p && { ...p, is_confidential: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-surface-border bg-background text-accent-amber focus:outline-none focus:ring-2 focus:ring-accent-amber-dim" />
            <span className="flex items-center text-sm font-medium text-text-primary">
              Confidential (Under NDA)
              <InfoTooltip variant="inline">
                <p>Hides title, author, and cover from the public site. Internal fields remain visible to you. Use for projects you can&apos;t publicly announce yet.</p>
              </InfoTooltip>
            </span>
          </label>
        </div>

        {/* Section 5: Archive */}
        <div className="border-t border-surface-border pt-8 mt-2">
          {form.archived_at ? (
            <div className="rounded-lg border border-surface-border bg-background p-4">
              <p className={adminType.small}>
                Archived on {formatArchivedDate(form.archived_at)} · Reason:{" "}
                <span className="font-medium text-text-body">{ARCHIVE_REASON_LABEL[form.archived_reason ?? "other"]}</span>
              </p>
              {form.archived_notes && (
                <p className="mt-2 text-[13px] leading-relaxed text-text-muted whitespace-pre-wrap">{form.archived_notes}</p>
              )}
              <button type="button" onClick={handleRestore} disabled={saving}
                className="mt-3 rounded-full border border-surface-border px-4 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40">
                {saving ? "Restoring…" : "Restore"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setArchiveConfirmOpen(true)}
              className="rounded-full border border-surface-border px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text-primary">
              Archive Project
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4">
      {/* Form modal — click-outside intentionally disabled (Stage 5 rule);
          Cancel button or Escape only. */}
      <div className="flex w-full max-w-[900px] flex-col rounded-xl border border-surface-border bg-surface shadow-2xl" style={{ maxHeight: "85vh" }}>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-amber border-t-transparent" />
          </div>
        ) : loadError || !form ? (
          <div className="p-8 text-center">
            <p className="text-sm text-alert-red">{loadError ?? "Failed to load card."}</p>
            <button onClick={onClose} className="mt-4 rounded-full border border-surface-border px-4 py-2 text-sm text-text-body transition-colors hover:text-text-primary">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Sticky header */}
            <div className="flex shrink-0 items-center gap-4 border-b border-surface-border p-5">
              <div className="relative h-[90px] w-[60px] shrink-0 overflow-hidden rounded bg-background">
                {form.cover_url && <Image src={form.cover_url} alt={form.title} fill className="object-contain" sizes="60px" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`${adminType.titleLg} truncate`}>{form.title || "Untitled"}</h2>
                <div className="mt-1.5"><StatusPill value={form.status} /></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-full border border-surface-border px-4 py-2 text-sm text-text-body transition-colors hover:text-text-primary">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50">
                  {saveButtonLabel}
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex shrink-0 gap-1 border-b border-surface-border px-5">
              {TABS.map(t => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === t.id ? "text-accent-amber" : "text-text-muted hover:text-text-body"
                  }`}>
                  {t.label}
                  {activeTab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-amber" />}
                </button>
              ))}
            </div>

            {saveError && (
              <div className="mx-5 mt-4 flex shrink-0 items-center justify-between rounded-lg border border-alert-red/30 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
                <span>{saveError}</span>
                <button onClick={() => setSaveError(null)} className="text-alert-red/60 hover:text-alert-red">✕</button>
              </div>
            )}

            {/* Scrollable body — all four tabs render; inactive ones are
                display:none (not unmounted), so edits survive tab switches. */}
            <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
              <div className={activeTab === "details" ? "block" : "hidden"}>
                {renderDetailsTab()}
              </div>
              <div className={activeTab === "production" ? "block" : "hidden"}>
                <p className={`${adminType.body} py-16 text-center text-text-muted`}>Coming in Stage 6.2</p>
              </div>
              <div className={activeTab === "content" ? "block" : "hidden"}>
                <p className={`${adminType.body} py-16 text-center text-text-muted`}>Coming in Stage 6.2</p>
              </div>
              <div className={activeTab === "links" ? "block" : "hidden"}>
                <p className={`${adminType.body} py-16 text-center text-text-muted`}>Coming in Stage 6.2</p>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-surface-border px-5 py-4">
              {isDirty && !saving && <span className="mr-auto text-[13px] text-accent-amber-bright">Unsaved changes</span>}
              <button type="button" onClick={onClose}
                className="rounded-full border border-surface-border px-5 py-2.5 text-sm text-text-body transition-colors hover:text-text-primary">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-full bg-accent-amber px-5 py-2.5 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50">
                {saveButtonLabel}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Archive confirmation — confirmation dialog, click-outside dismisses */}
      {archiveConfirmOpen && form && (
        <div
          className="fixed inset-0 z-[310] flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setArchiveConfirmOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-6">
            <h3 className="mb-2 text-base font-bold text-text-primary">Archive &ldquo;{form.title}&rdquo;?</h3>
            <p className="mb-4 text-sm text-text-muted">
              This will be hidden from the board and public site, but kept in the Archive.
            </p>
            <div className="mb-4 flex gap-4 text-sm text-text-body">
              {ARCHIVE_REASONS.map(r => (
                <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="archive-reason" checked={archiveReason === r}
                    onChange={() => setArchiveReason(r)} className="accent-accent-amber" />
                  {ARCHIVE_REASON_LABEL[r]}
                </label>
              ))}
            </div>
            <textarea value={archiveNotes} onChange={e => setArchiveNotes(e.target.value)} rows={3}
              placeholder="Notes (optional)…"
              className="mb-5 w-full rounded-lg border border-surface-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none resize-none" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setArchiveConfirmOpen(false)}
                className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary">
                Cancel
              </button>
              <button type="button" onClick={handleArchive} disabled={archiving}
                className="flex-1 rounded-full bg-surface-raised py-2.5 text-sm font-bold text-text-primary transition hover:brightness-110 disabled:opacity-50">
                {archiving ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
