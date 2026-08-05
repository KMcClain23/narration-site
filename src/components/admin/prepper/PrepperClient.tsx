"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";

export interface ManuscriptRow {
  id: string;
  title: string;
  author: string | null;
  status: "processing" | "ready" | "failed";
  source_format: "pdf" | "docx";
  created_at: string;
  chapterCount: number;
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

async function uploadManuscript(file: File, onProgress: (pct: number) => void): Promise<{ key: string; format: "pdf" | "docx" }> {
  const contentType =
    file.name.toLowerCase().endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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

function StatusBadge({ status }: { status: ManuscriptRow["status"] }) {
  const styles: Record<ManuscriptRow["status"], string> = {
    processing: "bg-pill-neutral-bg text-pill-neutral-text",
    ready: "bg-capacity-light/15 text-capacity-light",
    failed: "bg-alert-red/15 text-alert-red",
  };
  const labels: Record<ManuscriptRow["status"], string> = {
    processing: "Processing…",
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
      setError("Only .pdf or .docx files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.(pdf|docx)$/i, ""));
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
        created_at: new Date().toISOString(),
        chapterCount: 0,
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
                <span className="text-sm text-text-muted">Drag & drop or click to choose a PDF or DOCX</span>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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

function ManuscriptCard({ manuscript }: { manuscript: ManuscriptRow }) {
  const inner = (
    <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface p-4 transition-colors hover:border-accent-amber-dim/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${adminType.title} truncate`}>{manuscript.title}</span>
          <StatusBadge status={manuscript.status} />
        </div>
        <p className={`${adminType.small} mt-0.5`}>
          {manuscript.author || "Unknown author"}
          {manuscript.status === "ready" && ` · ${manuscript.chapterCount} chapter${manuscript.chapterCount === 1 ? "" : "s"}`}
          {` · ${manuscript.source_format.toUpperCase()}`}
        </p>
      </div>
    </div>
  );

  if (manuscript.status !== "ready") return inner;

  return (
    <Link href={`/admin/manuscripts/${manuscript.id}`} className="block">
      {inner}
    </Link>
  );
}

export function PrepperClient({ initialManuscripts }: { initialManuscripts: ManuscriptRow[] }) {
  const [manuscripts, setManuscripts] = useState<ManuscriptRow[]>(initialManuscripts);
  const [isUploading, setIsUploading] = useState(false);

  // Poll any manuscript still in "processing" until it flips to ready/failed
  // — Phase 2's parse is a single, short-lived job (no per-chapter progress
  // to show yet), so a plain interval is enough here.
  useEffect(() => {
    const pending = manuscripts.filter((m) => m.status === "processing");
    if (!pending.length) return;

    const interval = setInterval(async () => {
      await Promise.all(
        pending.map(async (m) => {
          try {
            const res = await fetch(`/api/admin/manuscripts/${m.id}`);
            if (!res.ok) return;
            const json = await res.json();
            if (json.status && json.status !== "processing") {
              setManuscripts((prev) =>
                prev.map((row) =>
                  row.id === m.id ? { ...row, status: json.status, chapterCount: json.chapterCount ?? row.chapterCount } : row
                )
              );
            }
          } catch {
            // transient — next tick retries
          }
        })
      );
    }, 3000);

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
              <ManuscriptCard key={m.id} manuscript={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
