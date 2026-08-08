"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext, DragOverlay, MouseSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Play, Pause, MoreVertical, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { GENRES, splitGenre, fmtDuration, detectDuration, uploadToR2 } from "@/lib/demos-shared";

export type DemoRecord = {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  file_url: string | null;
  file_key: string | null;
  duration_seconds: number | null;
  sort_order: number;
  active: boolean;
  featured: boolean;
  created_at: string;
};

/** How many demos the homepage shows. Mirrors HOMEPAGE_DEMO_LIMIT in page.tsx. */
export const FEATURED_LIMIT = 6;

// Decorative "abstract audio" bar heights (percent of strip height) — not
// derived from any real waveform, per the design brief.
const WAVE_BARS = [22, 38, 60, 85, 100, 78, 52, 30, 18, 32, 55, 82, 100, 70, 45, 25, 20, 40, 68, 95, 72, 48, 28, 20];

function OverflowMenu({
  onTestUrls, onFixUrls, testing, fixing,
}: { onTestUrls: () => void; onFixUrls: () => void; testing: boolean; fixing: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
        title="More actions"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-surface-border bg-surface-raised py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); onTestUrls(); }}
            disabled={testing || fixing}
            className="block w-full px-3 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface disabled:opacity-40"
          >
            {testing ? "Testing…" : "Test all URLs"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onFixUrls(); }}
            disabled={testing || fixing}
            className="block w-full px-3 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface disabled:opacity-40"
          >
            {fixing ? "Fixing…" : "Fix URLs"}
          </button>
        </div>
      )}
    </div>
  );
}

function WaveformStrip({
  demo, playingId, setPlayingId,
}: { demo: DemoRecord; playingId: string | null; setPlayingId: (id: string | null) => void }) {
  const isThisPlaying = playingId === demo.id;
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const dur = a.duration || demo.duration_seconds || 0;
      setProgress(dur > 0 ? (a.currentTime / dur) * 100 : 0);
    };
    const onEnded = () => { setProgress(0); setPlayingId(null); };
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("ended", onEnded);
    };
  }, [demo.duration_seconds, setPlayingId]);

  // Enforce single-active-playback: pause this element whenever some other
  // row becomes the active player — same pattern as the public site's demo
  // players (src/app/HomeClient.tsx's activeIndex/audioRefs).
  useEffect(() => {
    if (playingId !== demo.id) audioRef.current?.pause();
  }, [playingId, demo.id]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); setPlayingId(demo.id); }
    else { a.pause(); setPlayingId(null); }
  };

  return (
    <div className="flex shrink-0 items-center gap-2.5" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={toggle}
        disabled={!demo.file_url}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-amber text-background transition hover:brightness-110 disabled:opacity-40"
      >
        {isThisPlaying
          ? <Pause size={13} fill="currentColor" />
          : <Play size={13} fill="currentColor" className="translate-x-0.5" />}
      </button>

      <div className="relative h-10 w-[200px] shrink-0 overflow-hidden rounded-md bg-surface-raised">
        <div className="absolute inset-0 flex items-end justify-between gap-px px-1.5 py-1.5">
          {WAVE_BARS.map((h, i) => (
            <div key={i} className="min-w-0 flex-1 rounded-full bg-text-dim/50" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
          <div
            className="h-full bg-accent-amber transition-[width]"
            style={{ width: `${isThisPlaying ? progress : 0}%` }}
          />
        </div>
        {demo.file_url && <audio ref={audioRef} src={demo.file_url} preload="none" />}
      </div>

      <span className="w-9 shrink-0 text-[12px] text-text-muted">{fmtDuration(demo.duration_seconds) ?? "—"}</span>
    </div>
  );
}

// ── Add-demo modal ──────────────────────────────────────────────────────────

function AddDemoModal({ onAdded, onCancel }: { onAdded: (demo: DemoRecord) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [customGenre, setCustomGenre] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape is an intentional, explicit dismiss — unlike a stray click
  // outside the modal, it can't happen by accident while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const handleFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".mp3")) { alert("MP3 files only."); return; }
    setFile(f);
    const dur = await detectDuration(f);
    setDuration(Math.round(dur) || null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !file) return;
    const finalGenre = genre === "Other" ? customGenre.trim() : genre;
    setBusy(true);
    setProgress(0);
    try {
      const { key, publicUrl } = await uploadToR2(file, setProgress);
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), genre: finalGenre || null, description: desc.trim() || null,
          file_url: publicUrl, file_key: key, duration_seconds: duration, sort_order: 9999,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onAdded(await res.json());
    } catch (e) {
      alert("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const inp = "w-full rounded-lg border border-surface-border bg-background px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none";

  return (
    // Form modal — unlike a confirmation dialog, an accidental outside click
    // here would silently discard whatever the user just typed/uploaded.
    // Cancel button or Escape only.
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className={adminType.title}>New Demo</h2>
          <button type="button" onClick={onCancel} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${adminType.label} mb-1.5 block`}>Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Dark Romance" className={inp} disabled={busy} />
            </div>
            <div>
              <label className={`${adminType.label} mb-1.5 block`}>Genre</label>
              <select value={genre} onChange={e => setGenre(e.target.value)} className={`${inp} cursor-pointer`} disabled={busy}>
                <option value="">Select genre…</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {genre === "Other" && (
            <div>
              <label className={`${adminType.label} mb-1.5 block`}>Custom Genre</label>
              <input value={customGenre} onChange={e => setCustomGenre(e.target.value)} placeholder="Enter genre…" className={inp} disabled={busy} autoFocus />
            </div>
          )}

          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description…" className={inp} disabled={busy} />
          </div>

          <div>
            <label className={`${adminType.label} mb-1.5 block`}>MP3 File *</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
                dragOver ? "border-accent-amber-dim bg-accent-amber-dim/5"
                  : file ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-surface-border hover:border-accent-amber-dim/60"
              }`}
            >
              {file ? (
                <span className="text-sm font-medium text-text-body">{file.name}{duration ? ` — ${fmtDuration(duration)}` : ""}</span>
              ) : (
                <span className="text-sm text-text-muted">Drag & drop or click to choose MP3</span>
              )}
              <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" className="sr-only" disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>

          {busy && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className={adminType.small}>Uploading…</span>
                <span className="text-[13px] text-accent-amber-bright">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-accent-amber transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy}
            className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy || !title.trim() || !file}
            className="flex-1 rounded-full bg-accent-amber py-2.5 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50">
            {busy ? "Uploading…" : "Save Demo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Demo row ─────────────────────────────────────────────────────────────────

function DemoRow({
  demo, expanded, onToggleExpand, busy, knownBroken, playingId, setPlayingId,
  onUpdate, onToggleActive, onToggleFeatured, featuredFull, onDelete,
}: {
  demo: DemoRecord;
  expanded: boolean;
  onToggleExpand: () => void;
  busy: boolean;
  knownBroken?: boolean;
  playingId: string | null;
  setPlayingId: (id: string | null) => void;
  onUpdate: (updated: DemoRecord) => void;
  onToggleActive: () => void;
  onToggleFeatured: () => void;
  featuredFull: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: demo.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: demo.id });
  const setRefs = (el: HTMLDivElement | null) => { setDragRef(el); setDropRef(el); };

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(demo.title);
  const [editGenre, setEditGenre] = useState(() => splitGenre(demo.genre).select);
  const [editCustomGenre, setEditCustomGenre] = useState(() => splitGenre(demo.genre).custom);
  const [editDesc, setEditDesc] = useState(demo.description ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  const [replacing, setReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditTitle(demo.title);
    const { select, custom } = splitGenre(demo.genre);
    setEditGenre(select); setEditCustomGenre(custom);
    setEditDesc(demo.description ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    const finalGenre = editGenre === "Other" ? editCustomGenre.trim() : editGenre;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/demos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: demo.id, title: editTitle.trim(), genre: finalGenre || null, description: editDesc.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdate(await res.json());
      setEditing(false);
    } catch (e) {
      alert("Save failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".mp3")) { alert("MP3 files only."); return; }
    setReplacing(true); setReplaceProgress(0); setReplaceError(null);
    try {
      const duration = Math.round(await detectDuration(file)) || null;
      const { key, publicUrl } = await uploadToR2(file, setReplaceProgress);
      const res = await fetch("/api/demos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: demo.id, file_url: publicUrl, file_key: key, duration_seconds: duration }),
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdate(await res.json());
    } catch (e) {
      setReplaceError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setReplacing(false);
    }
  };

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  const editInp = "w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none";

  return (
    <div ref={setRefs} style={style} className={`rounded-xl border ${demo.active ? "border-surface-border" : "border-surface-border/50 opacity-60"} bg-surface`}>
      <div onClick={onToggleExpand} className="flex cursor-pointer items-center gap-3 p-3">
        <button
          {...attributes} {...listeners}
          onClick={e => e.stopPropagation()}
          className="shrink-0 cursor-grab touch-none text-text-dim hover:text-text-muted active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        <WaveformStrip demo={demo} playingId={playingId} setPlayingId={setPlayingId} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${adminType.title} truncate`}>{demo.title}</span>
            {demo.genre && (
              <span className="shrink-0 rounded bg-pill-neutral-bg px-2 py-0.5 text-[11px] text-pill-neutral-text">{demo.genre}</span>
            )}
          </div>
          {knownBroken && (
            <p className="mt-0.5 text-[11px] font-medium text-alert-red">⚠ Audio not loading — use Fix URLs to repair.</p>
          )}
        </div>

        {/* Featured — which demos the homepage shows, separate from the order
            the full page lists them in. Disabled once six are chosen so the
            limit is visible here rather than silently applied by the query. */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleFeatured(); }}
          disabled={busy || (!demo.featured && featuredFull) || !demo.active}
          title={
            !demo.active
              ? "Hidden demos cannot be featured"
              : demo.featured
                ? "On the homepage — click to remove"
                : featuredFull
                  ? `Homepage is full (${FEATURED_LIMIT}) — remove one first`
                  : "Add to the homepage"
          }
          aria-pressed={demo.featured}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-30 ${
            demo.featured
              ? "bg-[#D4AF37] text-black"
              : "border border-surface-border text-text-muted hover:text-text-primary"
          }`}
        >
          {demo.featured ? "★ Home" : "☆ Home"}
        </button>

        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleActive(); }}
          disabled={busy}
          title={demo.active ? "Active — click to hide" : "Inactive — click to show"}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${demo.active ? "bg-emerald-500" : "bg-surface-raised"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${demo.active ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-surface-border p-4" onClick={e => e.stopPropagation()}>
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${adminType.label} mb-1 block`}>Title *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={editInp} disabled={savingEdit} />
                </div>
                <div>
                  <label className={`${adminType.label} mb-1 block`}>Genre</label>
                  <select value={editGenre} onChange={e => setEditGenre(e.target.value)} className={`${editInp} cursor-pointer`} disabled={savingEdit}>
                    <option value="">No genre</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              {editGenre === "Other" && (
                <div>
                  <label className={`${adminType.label} mb-1 block`}>Custom Genre</label>
                  <input value={editCustomGenre} onChange={e => setEditCustomGenre(e.target.value)} className={editInp} disabled={savingEdit} autoFocus />
                </div>
              )}
              <div>
                <label className={`${adminType.label} mb-1 block`}>Description</label>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className={editInp} disabled={savingEdit} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={savingEdit || !editTitle.trim()}
                  className="rounded-lg bg-accent-amber px-4 py-2 text-[12px] font-bold text-background transition hover:brightness-110 disabled:opacity-40">
                  {savingEdit ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} disabled={savingEdit}
                  className="rounded-lg px-4 py-2 text-[12px] text-text-muted transition-colors hover:text-text-primary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {demo.description && <p className={`${adminType.body} mb-3`}>{demo.description}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={startEdit} disabled={busy || replacing}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40">
                  Edit
                </button>
                <button onClick={() => { setReplaceError(null); replaceRef.current?.click(); }} disabled={busy || replacing}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-40">
                  {replacing ? "…" : "Replace"}
                </button>
                <button onClick={onDelete} disabled={busy || replacing}
                  className="rounded-lg border border-alert-red/30 px-3 py-1.5 text-[12px] font-medium text-alert-red/70 transition-colors hover:text-alert-red disabled:opacity-40">
                  Delete
                </button>
              </div>
            </>
          )}

          {replacing && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className={adminType.small}>Uploading replacement…</span>
                <span className="font-mono text-[12px] text-accent-amber-bright">{replaceProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div className="h-full rounded-full bg-accent-amber transition-all" style={{ width: `${replaceProgress}%` }} />
              </div>
            </div>
          )}
          {replaceError && !replacing && (
            <p className="mt-2 text-[12px] text-alert-red">{replaceError}</p>
          )}

          <input ref={replaceRef} type="file" accept=".mp3,audio/mpeg" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}

// ── Main client ──────────────────────────────────────────────────────────────

export function DemosV2Client({ initialDemos }: { initialDemos: DemoRecord[] }) {
  const [demos, setDemos] = useState<DemoRecord[]>(initialDemos);
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, boolean> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));

  const setBusyFor = (id: string, val: boolean) => setBusy(b => ({ ...b, [id]: val }));

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdded = (demo: DemoRecord) => {
    setDemos(prev => [...prev, demo].map((d, i) => ({ ...d, sort_order: i })));
    setIsAdding(false);
  };

  const handleUpdate = (updated: DemoRecord) =>
    setDemos(prev => prev.map(d => (d.id === updated.id ? updated : d)));

  const handleToggleActive = async (demo: DemoRecord) => {
    setBusyFor(demo.id, true);
    try {
      const res = await fetch("/api/demos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: demo.id, active: !demo.active }),
      });
      if (!res.ok) throw new Error(await res.text());
      handleUpdate(await res.json());
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyFor(demo.id, false);
    }
  };

  const featuredCount = demos.filter(d => d.featured).length;

  const handleToggleFeatured = async (demo: DemoRecord) => {
    setBusyFor(demo.id, true);
    try {
      const res = await fetch("/api/demos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: demo.id, featured: !demo.featured }),
      });
      if (!res.ok) throw new Error(await res.text());
      handleUpdate(await res.json());
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyFor(demo.id, false);
    }
  };

  const handleDelete = async (demo: DemoRecord) => {
    if (!window.confirm(`Delete "${demo.title}"? The R2 file will also be removed.`)) return;
    setBusyFor(demo.id, true);
    try {
      const res = await fetch("/api/demos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: demo.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDemos(prev => prev.filter(d => d.id !== demo.id));
    } catch (e) {
      alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
      setBusyFor(demo.id, false);
    }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = demos.findIndex(d => d.id === active.id);
    const newIndex = demos.findIndex(d => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...demos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    const withOrder = reordered.map((d, i) => ({ ...d, sort_order: i }));
    setDemos(withOrder);

    // Small list (single digits) — persisting every row's sort_order is
    // simpler and cheap enough vs. diffing which ones actually moved.
    Promise.all(withOrder.map(d =>
      fetch("/api/demos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, sort_order: d.sort_order }),
      }),
    )).catch(() => {});
  };

  const handleTestUrls = async () => {
    setTesting(true);
    setTestResults(null);
    setNotice(null);
    const testUrl = (url: string | null): Promise<boolean> => {
      if (!url) return Promise.resolve(false);
      return new Promise(resolve => {
        const audio = new Audio();
        const timer = setTimeout(() => { audio.src = ""; resolve(false); }, 8000);
        audio.onloadedmetadata = () => { clearTimeout(timer); resolve(true); };
        audio.onerror = () => { clearTimeout(timer); resolve(false); };
        audio.src = url;
      });
    };
    const results: Record<string, boolean> = {};
    await Promise.all(demos.map(async d => { results[d.id] = await testUrl(d.file_url); }));
    setTestResults(results);
    const ok = Object.values(results).filter(Boolean).length;
    setNotice(`${ok} / ${demos.length} URLs accessible${ok < demos.length ? " — see flagged rows below" : ""}.`);
    setTesting(false);
  };

  const handleFixUrls = async () => {
    setFixing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/demos/fix-urls", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Fix failed");
      setDemos(json.demos);
      setNotice(json.fixed === 0 ? "All URLs already correct — nothing changed." : `Fixed ${json.fixed} demo URL${json.fixed !== 1 ? "s" : ""}.`);
    } catch (e) {
      setNotice("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFixing(false);
    }
  };

  const draggingDemo = demos.find(d => d.id === activeDragId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className={adminType.titleLg}>Demos</h1>
          <span className={adminType.small}>{demos.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
          >
            + Add Demo
          </button>
          <OverflowMenu onTestUrls={handleTestUrls} onFixUrls={handleFixUrls} testing={testing} fixing={fixing} />
        </div>
      </div>

      {notice && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-4 py-2 text-[13px] text-text-muted">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-text-dim hover:text-text-muted"><X size={14} /></button>
        </div>
      )}

      {isAdding && <AddDemoModal onAdded={handleAdded} onCancel={() => setIsAdding(false)} />}

      {demos.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-surface-border py-16 text-center">
          <p className={adminType.small}>No demos yet.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="mt-5 space-y-2">
            {demos.map(demo => (
              <DemoRow
                key={demo.id}
                demo={demo}
                expanded={expanded.has(demo.id)}
                onToggleExpand={() => toggleExpand(demo.id)}
                busy={!!busy[demo.id]}
                knownBroken={testResults ? testResults[demo.id] === false : undefined}
                playingId={playingId}
                setPlayingId={setPlayingId}
                onUpdate={handleUpdate}
                onToggleActive={() => handleToggleActive(demo)}
                onToggleFeatured={() => handleToggleFeatured(demo)}
                featuredFull={featuredCount >= FEATURED_LIMIT}
                onDelete={() => handleDelete(demo)}
              />
            ))}
          </div>
          <DragOverlay>
            {draggingDemo && (
              <div className="flex items-center gap-3 rounded-xl border border-accent-amber-dim bg-surface p-3 shadow-lg">
                <GripVertical size={16} className="text-text-dim" />
                <span className={adminType.title}>{draggingDemo.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
