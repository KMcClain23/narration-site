"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";

export interface ManuscriptRow {
  id: string;
  title: string;
  author: string | null;
  status: "processing" | "ready" | "failed";
  source_format: "pdf" | "docx" | "txt";
  /** Why a parse failed, or a warning about a parse that succeeded poorly. */
  error_message: string | null;
  created_at: string;
  /**
   * Numbered chapters only. A parsed book also contains front and back matter
   * — prologue, acknowledgements and the like — which are chapters as far as
   * the database is concerned but are not chapters as far as anyone reading
   * the book is concerned. Counting the rows reported 41 for a 39-chapter
   * book, which does not match the spine, the TOC, or the reader's own
   * chapter list.
   */
  chapterCount: number;
  /** Front/back matter sections, counted separately from real chapters. */
  sectionCount: number;
  /** Chapters with a non-null summary — Phase 3's own resumability signal,
   *  reused here to tell "chapters parsed" apart from "dialogue extraction
   *  finished too" instead of both flattening into one "Ready" badge. */
  chaptersExtracted: number;
  /** Chapters that were attempted and failed extraction, and were skipped. */
  chaptersFailed: number;
  wordCount: number;
}

type DisplayStatus = "processing" | "extracting" | "ready" | "failed";

/**
 * Everything extraction has to get through — chapters plus front/back matter.
 * Distinct from chapterCount, which is what a reader would call a chapter;
 * extraction processes every section regardless.
 */
function totalSections(m: ManuscriptRow): number {
  return m.chapterCount + m.sectionCount;
}

function displayStatus(m: ManuscriptRow): DisplayStatus {
  if (m.status !== "ready") return m.status;
  const total = totalSections(m);
  if (total > 0 && m.chaptersExtracted < total) return "extracting";
  return "ready";
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

/**
 * How often to re-check a manuscript that is still processing.
 *
 * A chapter takes roughly 35 seconds, so polling every 3 seconds showed the
 * same number ten times over and bought no extra visibility. It was also
 * actively harmful: each poll writes a request line to the platform log, and
 * at that rate a single open Prepper tab filled the whole 100-line log window
 * in about three minutes. Anything worth investigating had already scrolled
 * away by the time anyone looked — which is exactly what happened when we
 * tried to find out why a manuscript had disappeared.
 */
const POLL_INTERVAL_MS = 12_000;

async function uploadManuscript(file: File, onProgress: (pct: number) => void): Promise<{ key: string; format: "pdf" | "docx" | "txt" }> {
  const name = file.name.toLowerCase();
  // Sent explicitly rather than trusting file.type, which browsers leave empty
  // for .txt often enough that relying on it would reject valid uploads.
  const contentType = name.endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : name.endsWith(".txt")
      ? "text/plain"
      : "application/pdf";

  const res = await fetch("/api/admin/manuscripts/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to get upload URL");
  const { uploadUrl, key, format } = await res.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — network error."));
    xhr.send(file);
  });

  return { key, format };
}

function StatusBadge({ manuscript }: { manuscript: ManuscriptRow }) {
  const status = displayStatus(manuscript);
  const styles: Record<DisplayStatus, string> = {
    processing: "bg-pill-neutral-bg text-pill-neutral-text",
    extracting: "bg-pill-neutral-bg text-pill-neutral-text",
    ready: "bg-capacity-light/15 text-capacity-light",
    failed: "bg-alert-red/15 text-alert-red",
  };
  const labels: Record<DisplayStatus, string> = {
    processing: "Parsing chapters…",
    extracting: `Extracting dialogue… (${manuscript.chaptersExtracted}/${totalSections(manuscript)})`,
    ready: "Ready",
    failed: "Failed",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function UploadModal({
  onCreated,
  onCancel,
}: {
  onCreated: (manuscript: ManuscriptRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = stage !== "idle";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const handleFile = (f: File) => {
    const ok = ALLOWED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setError("Only .pdf, .docx, or .txt files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.(pdf|docx|txt)$/i, ""));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !file) return;
    setError(null);
    setStage("uploading");
    setProgress(0);
    try {
      const { key, format } = await uploadManuscript(file, setProgress);
      setStage("creating");
      const res = await fetch("/api/admin/manuscripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), author: author.trim() || undefined, key, format }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create manuscript");
      onCreated({
        id: json.id,
        title: title.trim(),
        author: author.trim() || null,
        status: "processing",
        source_format: format,
        error_message: null,
        created_at: new Date().toISOString(),
        chapterCount: 0,
        sectionCount: 0,
        chaptersExtracted: 0,
        chaptersFailed: 0,
        wordCount: 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStage("idle");
    }
  };

  const inp =
    "w-full rounded-lg border border-surface-border bg-background px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber-dim focus:outline-none";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className={adminType.title}>New Manuscript</h2>
          <button type="button" onClick={onCancel} disabled={busy} className="text-text-muted hover:text-text-primary disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" className={inp} disabled={busy} />
          </div>
          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Author</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" className={inp} disabled={busy} />
          </div>

          <div>
            <label className={`${adminType.label} mb-1.5 block`}>Manuscript File *</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => !busy && inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${
                dragOver
                  ? "border-accent-amber-dim bg-accent-amber-dim/5"
                  : file
                    ? "border-capacity-light/50 bg-capacity-light/5"
                    : "border-surface-border hover:border-accent-amber-dim/60"
              }`}
            >
              {file ? (
                <span className="text-sm font-medium text-text-body">{file.name}</span>
              ) : (
                <span className="text-sm text-text-muted">Drag &amp; drop or click to choose a PDF, DOCX, or TXT</span>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="sr-only"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          </div>

          {stage === "uploading" && (
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
          {stage === "creating" && (
            <p className={adminType.small}>Starting chapter parsing…</p>
          )}
          {error && <p className="text-[12px] text-alert-red">{error}</p>}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !title.trim() || !file}
            className="flex-1 rounded-full bg-accent-amber py-2.5 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50"
          >
            {stage === "uploading" ? "Uploading…" : stage === "creating" ? "Starting…" : "Upload & Parse"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManuscriptCard({
  manuscript,
  onDelete,
  deleting,
}: {
  manuscript: ManuscriptRow;
  onDelete: () => void;
  deleting: boolean;
}) {
  const details = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${adminType.title} truncate`}>{manuscript.title}</span>
        <StatusBadge manuscript={manuscript} />
      </div>
      <p className={`${adminType.small} mt-0.5`}>
        {manuscript.author || "Unknown author"}
        {manuscript.chapterCount > 0 && ` · ${manuscript.chapterCount} chapter${manuscript.chapterCount === 1 ? "" : "s"}`}
        {manuscript.sectionCount > 0 && ` (+${manuscript.sectionCount} front/back matter)`}
        {manuscript.wordCount > 0 && ` · ${manuscript.wordCount.toLocaleString()} words`}
        {` · ${manuscript.source_format.toUpperCase()}`}
      </p>
      {/* Shown for a warning on an otherwise-successful parse as well as an
          outright failure — a book that parsed into garbled chapters is the
          more dangerous of the two, because nothing else about the row says so. */}
      {manuscript.error_message && (
        <p
          className={`mt-1.5 text-xs leading-snug ${
            manuscript.status === "failed" ? "text-alert-red" : "text-accent-amber-dim"
          }`}
        >
          {manuscript.error_message}
        </p>
      )}
      {/* A book with skipped chapters still reads as finished everywhere else:
          status is "ready" and the extracted count stops short without saying
          why. This is the only place that gap is visible without a query. */}
      {manuscript.chaptersFailed > 0 && (
        <p className="mt-1.5 text-xs leading-snug text-alert-red">
          {manuscript.chaptersFailed} chapter{manuscript.chaptersFailed === 1 ? "" : "s"} failed
          extraction and {manuscript.chaptersFailed === 1 ? "was" : "were"} skipped — dialogue is
          missing {manuscript.chaptersFailed === 1 ? "there" : "in those chapters"}.
        </p>
      )}
    </div>
  );

  // Clickable as soon as chapters exist — extraction filling in gradually
  // is a fine degrading experience (plain text where highlighting hasn't
  // landed yet), not a reason to block the reader entirely.
  const clickable = manuscript.status === "ready";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface p-4 transition-colors hover:border-accent-amber-dim/50">
      {clickable ? (
        <Link href={`/admin/manuscripts/${manuscript.id}`} className="flex min-w-0 flex-1 items-center gap-4">
          {details}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-4">{details}</div>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        title="Delete manuscript"
        className="shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-alert-red/10 hover:text-alert-red disabled:opacity-40"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function PrepperClient({ initialManuscripts }: { initialManuscripts: ManuscriptRow[] }) {
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>(initialManuscripts);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Which manuscripts still exist, readable synchronously. The poller below
  // closes over a snapshot of `manuscripts` taken when its effect ran, so it
  // can't tell that a row was deleted a moment ago — it needs a value it can
  // re-read at await-time, after its request has already come back.
  const liveIds = useRef<Set<string>>(new Set(initialManuscripts.map((m) => m.id)));
  useEffect(() => {
    liveIds.current = new Set(manuscripts.map((m) => m.id));
  }, [manuscripts]);

  const handleDelete = async (m: ManuscriptRow) => {
    if (!window.confirm(`Delete "${m.title}"? This removes all parsed chapters, characters, and dialogue highlighting. This cannot be undone.`)) {
      return;
    }
    setDeletingId(m.id);
    // Retired before the request goes out, not after it comes back: clearing
    // the interval on the next render only stops future ticks, and a tick
    // already awaiting mid-flight would otherwise still GET this id and take
    // a 404 for a manuscript that is on its way out.
    liveIds.current.delete(m.id);
    try {
      const res = await fetch(`/api/admin/manuscripts/${m.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete");
      setManuscripts((prev) => prev.filter((row) => row.id !== m.id));
      setDeletingId(null);
    } catch (e) {
      // The row is staying, so put it back in rotation — otherwise a failed
      // delete silently leaves a still-processing manuscript unpolled and its
      // badge frozen at whatever it last read.
      liveIds.current.add(m.id);
      alert(e instanceof Error ? e.message : "Failed to delete manuscript.");
      setDeletingId(null);
    }
  };

  // Poll anything still mid-pipeline — parsing (status: "processing") or
  // extracting (status: "ready" but chaptersExtracted hasn't caught up to
  // chapterCount yet, now that process/route.ts auto-chains into extraction)
  // — until both phases finish.
  useEffect(() => {
    const pending = manuscripts.filter((m) => displayStatus(m) === "processing" || displayStatus(m) === "extracting");
    if (!pending.length) return;

    const interval = setInterval(async () => {
      await Promise.all(
        pending.map(async (m) => {
          if (!liveIds.current.has(m.id)) return;
          try {
            const res = await fetch(`/api/admin/manuscripts/${m.id}`);
            // Re-checked after the await: this tick may have been in flight
            // when the manuscript was deleted, and applying its response would
            // resurrect a row that is already gone from the list.
            if (!liveIds.current.has(m.id) || !res.ok) return;
            const json = await res.json();
            setManuscripts((prev) =>
              prev.map((row) =>
                row.id === m.id
                  ? {
                      ...row,
                      status: json.status ?? row.status,
                      chapterCount: json.chapterCount ?? row.chapterCount,
                      sectionCount: json.sectionCount ?? row.sectionCount,
                      chaptersExtracted: json.chaptersExtracted ?? row.chaptersExtracted,
                      chaptersFailed: json.chaptersFailed ?? row.chaptersFailed,
                      // Read as ?? null rather than ?? row.error_message so a
                      // reason that clears server-side clears here too, instead
                      // of a stale failure sticking to a row that has recovered.
                      error_message: json.error_message ?? null,
                    }
                  : row
              )
            );
          } catch {
            // transient — next tick retries
          }
        })
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [manuscripts]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className={adminType.titleLg}>Prepper</h1>
        <button
          type="button"
          onClick={() => setIsUploading(true)}
          className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
        >
          + New Manuscript
        </button>
      </div>
      <p className={`${adminType.body} mt-2`}>
        Upload a manuscript to extract chapters, characters, and dialogue for narration prep.
      </p>

      {isUploading && (
        <UploadModal
          onCreated={(m) => { setManuscripts((prev) => [m, ...prev]); setIsUploading(false); }}
          onCancel={() => setIsUploading(false)}
        />
      )}

      <div className="mt-8">
        <p className={adminType.label}>Parsed Books</p>
        {manuscripts.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-surface-border py-16 text-center">
            <p className={adminType.small}>No manuscripts yet — upload one to get started.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {manuscripts.map((m) => (
              <ManuscriptCard
                key={m.id}
                manuscript={m}
                onDelete={() => handleDelete(m)}
                deleting={deletingId === m.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
