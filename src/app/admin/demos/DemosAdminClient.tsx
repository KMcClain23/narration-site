"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
  created_at: string;
};

const GENRES = [
  "Romance", "Dark Romance", "Romantasy", "Thriller",
  "Fantasy", "Contemporary", "Drama", "Multi-Character", "Other",
];

function fmtDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function detectDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio();
    const url   = URL.createObjectURL(file);
    audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(url); };
    audio.onerror          = () => { resolve(0);              URL.revokeObjectURL(url); };
    audio.src = url;
  });
}

async function uploadToR2(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ key: string; publicUrl: string }> {
  const res = await fetch("/api/demos/upload-url", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ filename: file.name, contentType: "audio/mpeg" }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, key, publicUrl } = await res.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "audio/mpeg");
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload  = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — network error or SSL issue with R2 endpoint. Check the browser console."));
    xhr.onabort = () => reject(new Error("Upload aborted."));
    xhr.send(file);
  });

  return { key, publicUrl };
}

// ── Add-demo form ─────────────────────────────────────────────────────────────

function AddDemoForm({ onAdded, onCancel }: {
  onAdded: (demo: DemoRecord) => void;
  onCancel: () => void;
}) {
  const [title,    setTitle]    = useState("");
  const [genre,    setGenre]    = useState("");
  const [desc,     setDesc]     = useState("");
  const [file,     setFile]     = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy,     setBusy]     = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".mp3")) { alert("MP3 files only."); return; }
    setFile(f);
    const dur = await detectDuration(f);
    setDuration(Math.round(dur) || null);
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !file) return;
    setBusy(true);
    setProgress(0);
    try {
      const { key, publicUrl } = await uploadToR2(file, setProgress);
      const res = await fetch("/api/demos", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title: title.trim(), genre: genre || null,
          description: desc.trim() || null,
          file_url: publicUrl, file_key: key,
          duration_seconds: duration,
          sort_order: 9999,
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

  const inp  = "w-full bg-[#0C0F40] border border-[#252D6E] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60 transition-all";
  const sel  = `${inp} appearance-none cursor-pointer`;

  return (
    <div className="bg-[#0A0C36] border border-[#252D6E] rounded-2xl p-6 mb-6 space-y-4">
      <h2 className="text-[#D4AF37] font-bold text-lg">New Demo</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10.5px] uppercase tracking-widest text-white/50 mb-1.5">Title *</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Dark Romance" className={inp} disabled={busy}
          />
        </div>
        <div>
          <label className="block text-[10.5px] uppercase tracking-widest text-white/50 mb-1.5">Genre</label>
          <select value={genre} onChange={e => setGenre(e.target.value)} className={sel} disabled={busy}>
            <option value="">Select genre…</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10.5px] uppercase tracking-widest text-white/50 mb-1.5">Description</label>
        <input
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Brief description…" className={inp} disabled={busy}
        />
      </div>

      {/* Drag-and-drop file zone */}
      <div>
        <label className="block text-[10.5px] uppercase tracking-widest text-white/50 mb-1.5">
          MP3 File *
        </label>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-all ${
            dragOver
              ? "border-[#D4AF37]/70 bg-[#D4AF37]/5"
              : file
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-[#252D6E] hover:border-[#D4AF37]/40"
          }`}
        >
          {file ? (
            <>
              <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-white/70 font-medium">{file.name}</span>
              {duration && <span className="text-xs text-white/40">{fmtDuration(duration)}</span>}
            </>
          ) : (
            <>
              <svg className="h-6 w-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-white/40">Drag & drop or click to choose MP3</span>
            </>
          )}
          <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" className="sr-only" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      </div>

      {/* Progress bar */}
      {busy && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/40">Uploading…</span>
            <span className="text-xs text-[#D4AF37]">{progress}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D4AF37] rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={handleSubmit}
          disabled={busy || !title.trim() || !file}
          className="flex items-center gap-2 bg-[#D4AF37] text-[#06082E] font-bold text-sm px-6 py-2.5 rounded-full hover:bg-[#F0D060] transition disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Save Demo"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-sm text-white/40 hover:text-white/70 transition px-4 py-2 rounded-full"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Individual demo card ──────────────────────────────────────────────────────

function DemoCard({
  demo, index, total, busy,
  onUpdate, onToggleActive, onDelete, onMoveUp, onMoveDown,
}: {
  demo: DemoRecord;
  index: number;
  total: number;
  busy: boolean;
  onUpdate: (updated: DemoRecord) => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // ── Inline edit state ───────────────────────────────────────────────────────
  const [editing,    setEditing]    = useState(false);
  const [editTitle,  setEditTitle]  = useState(demo.title);
  const [editGenre,  setEditGenre]  = useState(demo.genre  ?? "");
  const [editDesc,   setEditDesc]   = useState(demo.description ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  // Sync edit fields if demo prop changes externally
  useEffect(() => {
    if (!editing) {
      setEditTitle(demo.title);
      setEditGenre(demo.genre ?? "");
      setEditDesc(demo.description ?? "");
    }
  }, [demo, editing]);

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/demos", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:          demo.id,
          title:       editTitle.trim(),
          genre:       editGenre || null,
          description: editDesc.trim() || null,
        }),
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

  // ── Replace state ───────────────────────────────────────────────────────────
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [replacing,       setReplacing]       = useState(false);
  const [replaceError,    setReplaceError]    = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const handleReplaceFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".mp3")) { alert("MP3 files only."); return; }
    setReplacing(true);
    setReplaceProgress(0);
    setReplaceError(null);
    try {
      const duration = Math.round(await detectDuration(file)) || null;
      const { key, publicUrl } = await uploadToR2(file, setReplaceProgress);
      const res = await fetch("/api/demos", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: demo.id, file_url: publicUrl, file_key: key, duration_seconds: duration }),
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdate(await res.json());
    } catch (e) {
      setReplaceError(e instanceof Error ? e.message : "Upload failed — check console for details.");
    } finally {
      setReplacing(false);
    }
  };

  // ── Shared styles ───────────────────────────────────────────────────────────
  const iconBtn  = "p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition disabled:opacity-30";
  const editInp  = "w-full bg-[#06082E] border border-[#252D6E] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#D4AF37]/60 transition";
  const editSel  = `${editInp} appearance-none contract-select cursor-pointer`;

  return (
    <div className={`bg-[#0A0C36] border rounded-2xl overflow-hidden transition-all ${
      demo.active ? "border-[#252D6E]" : "border-[#1A1F50] opacity-60"
    }`}>
      <div className="flex items-start gap-4 p-5">

        {/* Sort arrows */}
        <div className="flex flex-col gap-0.5 shrink-0 mt-1">
          <button onClick={onMoveUp}   disabled={busy || editing || index === 0}        className={iconBtn} title="Move up">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
          </button>
          <button onClick={onMoveDown} disabled={busy || editing || index === total - 1} className={iconBtn} title="Move down">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            /* ── Edit mode ── */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">Title *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className={editInp} placeholder="Demo title" disabled={savingEdit} />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">Genre</label>
                  <select value={editGenre} onChange={e => setEditGenre(e.target.value)}
                    className={editSel} disabled={savingEdit}>
                    <option value="">No genre</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">Description</label>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  className={editInp} placeholder="Short description…" disabled={savingEdit} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveEdit} disabled={savingEdit || !editTitle.trim()}
                  className="text-[12px] font-bold px-4 py-1.5 rounded-lg bg-[#D4AF37] text-[#06082E] hover:bg-[#F0D060] transition disabled:opacity-40">
                  {savingEdit ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); }} disabled={savingEdit}
                  className="text-[12px] px-4 py-1.5 rounded-lg text-white/40 hover:text-white/70 transition">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-bold text-white">{demo.title}</span>
                {demo.genre && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                    {demo.genre}
                  </span>
                )}
                {demo.duration_seconds && (
                  <span className="text-[11px] text-white/30">{fmtDuration(demo.duration_seconds)}</span>
                )}
              </div>
              {demo.description && (
                <p className="text-sm text-white/50 mb-3">{demo.description}</p>
              )}
              {demo.file_url && (
                <audio controls src={demo.file_url} className="w-full h-9 mb-1" style={{ accentColor: "#D4AF37" }} />
              )}
            </>
          )}

          {/* Replace progress */}
          {replacing && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/40">Uploading replacement…</span>
                <span className="text-xs text-[#D4AF37] font-mono">{replaceProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#D4AF37] rounded-full transition-all" style={{ width: `${replaceProgress}%` }} />
              </div>
            </div>
          )}
          {replaceError && !replacing && (
            <div className="mt-2 flex items-start gap-2 bg-red-950/50 border border-red-500/30 rounded-lg px-3 py-2">
              <span className="text-red-400 text-xs leading-relaxed">{replaceError}</span>
              <button onClick={() => setReplaceError(null)} className="ml-auto text-red-400/50 hover:text-red-400 shrink-0 text-sm leading-none">✕</button>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Active toggle */}
          <button
            onClick={onToggleActive} disabled={busy || editing}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
              demo.active ? "bg-emerald-500" : "bg-white/15"
            }`}
            title={demo.active ? "Active — click to hide" : "Inactive — click to show"}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              demo.active ? "translate-x-4" : "translate-x-0.5"
            }`} />
          </button>

          <div className="flex gap-1 mt-1">
            {/* Edit */}
            {!editing && (
              <button
                onClick={() => setEditing(true)} disabled={busy || replacing}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-[#252D6E] text-white/50 hover:text-white hover:border-[#3A4585] transition disabled:opacity-40"
                title="Edit title / genre / description"
              >
                Edit
              </button>
            )}
            {/* Replace audio */}
            {!editing && (
              <button
                onClick={() => { setReplaceError(null); replaceRef.current?.click(); }}
                disabled={busy || replacing}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-[#252D6E] text-white/50 hover:text-white hover:border-[#3A4585] transition disabled:opacity-40"
                title="Replace audio file"
              >
                {replacing ? "…" : "Replace"}
              </button>
            )}
            {/* Delete */}
            {!editing && (
              <button
                onClick={onDelete} disabled={busy || replacing}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-400/40 transition disabled:opacity-40"
                title="Delete demo"
              >
                Delete
              </button>
            )}
          </div>

          <input
            ref={replaceRef} type="file" accept=".mp3,audio/mpeg" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ""; }}
          />
        </div>
      </div>
    </div>
  );
}

// Existing hardcoded demos — used only for the one-time import.
// URLs point to files at the bucket root (pre-Demo Manager uploads).
const LEGACY_DEMOS = [
  { title: "LGBTQ+ Romance",           genre: "Romance",          description: "Bright pacing, playful emotional tone",      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-Positive%2CFlirtatious.mp3" },
  { title: "Romantasy",                genre: "Romantasy",        description: "Atmospheric, grounded fantasy emotion",       src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%2C%20Dark%20Romance%2CDeeep%20Loss.mp3" },
  { title: "Feminine Voice",           genre: "Romance",          description: "Male & Female Dialogue",                      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3" },
  { title: "Romance Duet",             genre: "Romance",          description: "British accent, romantic restraint",          src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3" },
  { title: "Child POV Drama",          genre: "Drama",            description: "Raw emotion",                                 src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20(5-year-old%20boy)%2C%20Emotional%20Trauma%2CWithnessing%20Violence%2C%20-%20Sample.mp3" },
  { title: "Multi-Character Dialogue", genre: "Multi-Character",  description: "Clear character separation, vocal range",    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3" },
];

// ── Main client component ─────────────────────────────────────────────────────

export default function DemosAdminClient({ initialDemos }: { initialDemos: DemoRecord[] }) {
  const [demos,       setDemos]       = useState<DemoRecord[]>(initialDemos);
  const [isAdding,    setIsAdding]    = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [fixingUrls,  setFixingUrls]  = useState(false);
  const [fixResult,   setFixResult]   = useState<string | null>(null);
  const [busy,        setBusy]        = useState<Record<string, boolean>>({});

  const setBusyFor = (id: string, val: boolean) =>
    setBusy(b => ({ ...b, [id]: val }));

  const handleAdded = (demo: DemoRecord) => {
    setDemos(prev => {
      const next = [...prev, demo];
      // Re-assign sort_order so the new item sits at the end
      return next.map((d, i) => ({ ...d, sort_order: i }));
    });
    setIsAdding(false);
  };

  const handleToggleActive = async (demo: DemoRecord) => {
    setBusyFor(demo.id, true);
    try {
      const res = await fetch("/api/demos", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: demo.id, active: !demo.active }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: DemoRecord = await res.json();
      setDemos(prev => prev.map(d => d.id === demo.id ? updated : d));
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
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: demo.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDemos(prev => prev.filter(d => d.id !== demo.id));
    } catch (e) {
      alert("Delete failed: " + (e instanceof Error ? e.message : String(e)));
      setBusyFor(demo.id, false);
    }
  };

  const handleMove = async (index: number, dir: "up" | "down") => {
    const swapIdx = dir === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= demos.length) return;

    const reordered = [...demos];
    [reordered[index], reordered[swapIdx]] = [reordered[swapIdx], reordered[index]];
    const withOrder = reordered.map((d, i) => ({ ...d, sort_order: i }));
    setDemos(withOrder);

    // Persist both affected rows
    await Promise.all([index, swapIdx].map(i =>
      fetch("/api/demos", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: withOrder[i].id, sort_order: withOrder[i].sort_order }),
      })
    ));
  };

  const handleUpdate = (updated: DemoRecord) =>
    setDemos(prev => prev.map(d => d.id === updated.id ? updated : d));

  const handleFixUrls = async () => {
    setFixingUrls(true);
    setFixResult(null);
    try {
      const res = await fetch("/api/demos/fix-urls", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Fix failed");
      setDemos(json.demos);
      setFixResult(
        json.fixed === 0
          ? "All URLs already correct — nothing changed."
          : `Fixed ${json.fixed} demo URL${json.fixed !== 1 ? "s" : ""}.${json.errors?.length ? ` (${json.errors.length} error${json.errors.length !== 1 ? "s" : ""} — see console)` : ""}`,
      );
      if (json.errors?.length) console.error("[fix-urls] errors:", json.errors);
    } catch (e) {
      setFixResult("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFixingUrls(false);
    }
  };

  // One-time migration: insert all hardcoded demos into Supabase
  const handleImport = async () => {
    if (!window.confirm("Import all 6 existing demos into Supabase? This runs once.")) return;
    setImporting(true);
    try {
      const inserted: DemoRecord[] = [];
      for (let i = 0; i < LEGACY_DEMOS.length; i++) {
        const d = LEGACY_DEMOS[i];
        // Derive file_key from URL (everything after the host)
        const fileKey = decodeURIComponent(new URL(d.src).pathname.slice(1));
        const res = await fetch("/api/demos", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            title:       d.title,
            genre:       d.genre,
            description: d.description,
            file_url:    d.src,
            file_key:    fileKey,
            sort_order:  i,
          }),
        });
        if (!res.ok) throw new Error(`Failed on "${d.title}": ${await res.text()}`);
        inserted.push(await res.json());
      }
      setDemos(inserted);
    } catch (e) {
      alert("Import failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <a href="/admin/stats" className="text-sm text-white/40 hover:text-white/80 transition">
              ← Admin
            </a>
            <h1 className="text-3xl font-bold text-[#D4AF37]">Demo Manager</h1>
            <span className="text-xs text-white/30 font-mono">{demos.length} demo{demos.length !== 1 ? "s" : ""}</span>
          </div>
          <button
            onClick={() => setIsAdding(v => !v)}
            className="flex items-center gap-2 bg-[#D4AF37] text-[#06082E] font-bold text-sm px-5 py-2.5 rounded-full hover:bg-[#F0D060] transition active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Add Demo
          </button>
        </div>

        {/* Add form */}
        {isAdding && (
          <AddDemoForm onAdded={handleAdded} onCancel={() => setIsAdding(false)} />
        )}

        {/* Fix URLs banner — only shown when demos exist */}
        {demos.length > 0 && (
          <div className="flex items-center justify-between bg-[#0A0C36] border border-[#1E2660] rounded-xl px-4 py-2.5 mb-4 gap-3 flex-wrap">
            <p className="text-xs text-white/40">
              If audio files fail to load, click <strong className="text-white/60">Fix URLs</strong> to rewrite all
              file_url values to use the correct R2 public base URL.
            </p>
            <button
              onClick={handleFixUrls}
              disabled={fixingUrls}
              className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#252D6E] text-white/50 hover:text-white hover:border-[#3A4585] transition disabled:opacity-40"
            >
              {fixingUrls ? "Fixing…" : "Fix URLs"}
            </button>
          </div>
        )}

        {/* Fix result */}
        {fixResult && (
          <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 mb-4 text-xs ${
            fixResult.startsWith("Error")
              ? "bg-red-950/40 border border-red-500/30 text-red-300"
              : "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
          }`}>
            <span>{fixResult}</span>
            <button onClick={() => setFixResult(null)} className="text-white/30 hover:text-white/60 shrink-0">✕</button>
          </div>
        )}

        {/* Hint */}
        <p className="text-xs text-white/25 mb-4">
          Use ▲ ▼ to reorder · Toggle the switch to show/hide on the public site
        </p>

        {/* Demo list / empty state */}
        {demos.length === 0 ? (
          <div className="text-center py-16 space-y-5">
            <p className="text-white/30 text-sm">No demos in Supabase yet.</p>
            <button
              onClick={handleImport}
              disabled={importing}
              className="inline-flex items-center gap-2 border border-[#D4AF37]/40 text-[#D4AF37] text-sm font-bold px-6 py-3 rounded-full hover:bg-[#D4AF37]/10 transition disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {importing ? "Importing…" : "Import existing demos"}
            </button>
            <p className="text-white/20 text-xs">Inserts all 6 current demos from the site into Supabase.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {demos.map((demo, i) => (
              <DemoCard
                key={demo.id}
                demo={demo}
                index={i}
                total={demos.length}
                busy={!!busy[demo.id]}
                onUpdate={handleUpdate}
                onToggleActive={() => handleToggleActive(demo)}
                onDelete={() => handleDelete(demo)}
                onMoveUp={() => handleMove(i, "up")}
                onMoveDown={() => handleMove(i, "down")}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
