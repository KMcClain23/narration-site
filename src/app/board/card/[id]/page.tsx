"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const CHAPTER_STATUSES = [
  { id: "not_started", label: "Not Started", color: "bg-white/10 text-white/40",        dot: "bg-white/30" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500/20 text-blue-300",      dot: "bg-blue-400" },
  { id: "editing",     label: "Editing",     color: "bg-yellow-500/20 text-yellow-300",  dot: "bg-yellow-400" },
  { id: "submitted",   label: "Submitted",   color: "bg-purple-500/20 text-purple-300",  dot: "bg-purple-400" },
  { id: "live",        label: "Live",        color: "bg-emerald-500/20 text-emerald-300", dot: "bg-emerald-400" },
];

const STAGE_COLORS: Record<string, string> = {
  audition: "text-purple-300", contracted: "text-blue-300",
  recording: "text-yellow-300", editing: "text-orange-300", released: "text-emerald-300",
};

interface Chapter {
  number: number | null;
  title: string;
  wordCount: number;
  pages: number;
  status: string;
  notes: string;
}

interface BoardCard {
  id: string; title: string; author: string; cover_url: string;
  status: string; deadline?: string; notes: string; author_notes: string;
  subtitle: string; tags: string[]; description: string;
  audible_link: string; co_narrator: string; chapters: Chapter[];
}

function statusStyle(id: string) {
  return CHAPTER_STATUSES.find(s => s.id === id) || CHAPTER_STATUSES[0];
}

function nextStatus(current: string): string {
  const idx = CHAPTER_STATUSES.findIndex(s => s.id === current);
  return CHAPTER_STATUSES[Math.min(idx + 1, CHAPTER_STATUSES.length - 1)].id;
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<BoardCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [coverDragOver, setCoverDragOver] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chaptersToSave = useRef<Chapter[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/board?id=${id}`);
      const data = await res.json();
      if (data.card) {
        setCard(data.card);
        setChapters(data.card.chapters || []);
        setSearchQuery(`${data.card.title || ""}${data.card.author ? " by " + data.card.author : ""}`);
      }
    } catch { setError("Failed to load card."); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const total = chapters.length;
  const byStat = Object.fromEntries(CHAPTER_STATUSES.map(s => [s.id, chapters.filter(c => c.status === s.id).length]));
  const liveCount = byStat["live"] || 0;
  const pct = total > 0 ? Math.round((liveCount / total) * 100) : 0;
  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  const totalPages = chapters.reduce((sum, c) => sum + (c.pages || 0), 0);
  const estimatedHours = totalWords > 0 ? (totalWords / 9400).toFixed(1) : null;

  const searchBooks = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/book-search?q=${encodeURIComponent(searchQuery)}&author=${encodeURIComponent(card?.author || "")}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await generateChaptersWithAI(searchQuery, data.pageCount || 0, data.wordCount || 0, data.chapterCount || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    }
    setSearching(false);
  };

  const generateChaptersWithAI = async (title: string, pageCount: number, wordCount: number, chapterCount: number) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/board-ai-chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author: card?.author || "", pageCount, wordCount, chapterCount }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`);
      if (data.chapters?.length) {
        setChapters(data.chapters.map((c: Omit<Chapter, "status" | "notes">) => ({ ...c, status: "not_started", notes: "" })));
      } else {
        throw new Error("No chapters returned — try a more specific title.");
      }
    } catch (e) {
      setError(`Chapter generation failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setAiLoading(false);
  };

  // ✅ SECURE: PDF uploads directly to R2 (bypasses Vercel 4.5MB limit), then server reads from R2
  const handlePdfUpload = async (file: File) => {
    setPdfLoading(true);
    setError(null);
    try {
      // Step 1: Get a presigned R2 upload URL from our server
      setPdfProgress("Preparing upload…");
      const urlRes = await fetch("/api/board-pdf-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/pdf" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, key, bucket } = await urlRes.json();

      // Step 2: Upload PDF directly to R2 (no Vercel size limit)
      setPdfProgress("Uploading manuscript…");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Upload to storage failed (${uploadRes.status})`);

      // Step 3: Start background job
      setPdfProgress("Claude is reading every chapter…");
      const startRes = await fetch("/api/board-pdf-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, bucket }),
      });
      if (!startRes.ok) throw new Error("Failed to start extraction job");
      const { jobId } = await startRes.json();

      // Step 4: Poll for results
      let elapsed = 0;
      while (elapsed < 600) {
        await new Promise(r => setTimeout(r, 4000));
        elapsed += 4;
        setPdfProgress(`Claude is reading every chapter… (${elapsed}s)`);
        const poll = await fetch(`/api/board-pdf-status?jobId=${jobId}`);
        const result = await poll.json();
        if (result.status === "done") {
          if (!result.chapters?.length) throw new Error("No chapters returned");
          setChapters(result.chapters.map((c: Omit<Chapter, "status" | "notes">) => ({ ...c, status: "not_started", notes: "" })));
          break;
        }
        if (result.status === "error") throw new Error(result.error || "Extraction failed");
      }
    } catch (e) {
      setError(`PDF extraction failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setPdfProgress("");
    setPdfLoading(false);
  };

  const saveChapters = async () => {
    setSaving(true);
    try {
      await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, chapters }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { setError("Save failed."); }
    setSaving(false);
  };

  const triggerAutoSave = (updated: Chapter[]) => {
    chaptersToSave.current = updated;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, chapters: chaptersToSave.current }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch { setError("Save failed."); }
      setSaving(false);
    }, 800);
  };

  const updateChapter = (idx: number, field: keyof Chapter, value: string | number) => {
    setChapters(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const advanceStatus = (idx: number) => {
    const updated = chapters.map((c, i) => i === idx ? { ...c, status: nextStatus(c.status) } : c);
    setChapters(updated);
    triggerAutoSave(updated);
  };

  const isUnnumbered = (title: string) => /^(prologue|epilogue|dedication|content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|content\s*warnings?)$/i.test(title.trim());

  const renumber = (list: Chapter[]): Chapter[] => {
    let n = 0;
    return list.map(c => ({ ...c, number: isUnnumbered(c.title) ? null : ++n }));
  };

  const addChapter = () => {
    const nextNum = chapters.filter(c => c.number != null).length + 1;
    const avgWords = total > 0 ? Math.round(totalWords / total) : 2500;
    const avgPages = total > 0 ? Math.round(totalPages / total) : 10;
    const updated = [...chapters, { number: nextNum, title: `Chapter ${nextNum}`, wordCount: avgWords, pages: avgPages, status: "not_started", notes: "" }];
    setChapters(updated);
    triggerAutoSave(updated);
  };

  const removeChapter = (idx: number) => {
    setChapters(prev => renumber(prev.filter((_, i) => i !== idx)));
  };

  const moveChapter = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= chapters.length) return;
    setChapters(prev => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return renumber(arr);
    });
  };

  if (loading) return (
    <main className="min-h-screen bg-[#06082E] text-white flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>
    </main>
  );

  if (!card) return (
    <main className="min-h-screen bg-[#06082E] text-white flex items-center justify-center">
      <p className="text-white/40">Card not found.</p>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-14 sm:pt-16">
      {/* Sticky header */}
      <div className="sticky top-14 sm:top-16 z-40 bg-[#06082E]/95 backdrop-blur border-b border-white/8 px-5 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/board" className="text-xs text-white/40 hover:text-[#D4AF37] transition-colors shrink-0">← Board</Link>
          <span className="text-white/20">/</span>
          <p className="text-sm font-semibold text-white truncate">{card.title}</p>
          {card.status && (
            <span className={`text-xs font-bold uppercase tracking-wide shrink-0 ${STAGE_COLORS[card.status] || "text-white/40"}`}>
              {card.status}
            </span>
          )}
        </div>
        <button
          onClick={saveChapters}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full transition-colors shrink-0 ${
            saved ? "bg-emerald-500 text-white" : "bg-[#D4AF37] text-black hover:bg-[#E0C15A]"
          }`}
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save chapters"}
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 grid lg:grid-cols-[300px_1fr] gap-8">

        {/* ── Left panel ── */}
        <div className="space-y-5">
          {/* Cover — drag PDF here to import chapters */}
          <div
            className={`rounded-2xl overflow-hidden border relative transition-colors ${coverDragOver ? "border-[#D4AF37]/60" : "border-white/8"}`}
            onDragOver={e => {
              e.preventDefault();
              if (pdfLoading) return;
              if (Array.from(e.dataTransfer.items).some(i => i.kind === "file" && i.type === "application/pdf"))
                setCoverDragOver(true);
            }}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setCoverDragOver(false);
            }}
            onDrop={e => {
              e.preventDefault();
              setCoverDragOver(false);
              if (pdfLoading) return;
              const file = Array.from(e.dataTransfer.files).find(f => f.type === "application/pdf");
              if (file) handlePdfUpload(file);
            }}
          >
            {card.cover_url
              ? <img src={card.cover_url} alt={card.title} className="w-full aspect-[2/3] object-cover"/>
              : <div className="w-full aspect-[2/3] bg-[#0A0D3A] flex items-center justify-center text-white/20 text-sm">No cover</div>
            }

            {/* Drop indicator overlay */}
            {coverDragOver && (
              <div className="absolute inset-0 bg-[#06082E]/75 border-2 border-dashed border-[#D4AF37]/70 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none">
                <svg className="h-8 w-8 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                </svg>
                <span className="text-sm font-semibold text-[#D4AF37]">Drop PDF</span>
              </div>
            )}

            {/* Processing overlay */}
            {pdfLoading && (
              <div className="absolute inset-0 bg-[#06082E]/85 rounded-2xl flex flex-col items-center justify-center gap-2 px-4 text-center pointer-events-none">
                <div className="h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>
                <span className="text-xs font-medium text-[#D4AF37]">{pdfProgress || "Processing…"}</span>
                <span className="text-[10px] text-[#D4AF37]/50">20–60 seconds</span>
              </div>
            )}
          </div>

          {/* Book info */}
          <div className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-4 space-y-2">
            <h1 className="font-bold text-white text-base leading-snug">{card.title}</h1>
            {card.subtitle && <p className="text-xs text-white/40">{card.subtitle}</p>}
            {card.author && <p className="text-sm text-[#D4AF37]">{card.author}</p>}
            {card.co_narrator && (
              <p className="text-xs text-white/35">with {(() => {
                try { const p = JSON.parse(card.co_narrator); return Array.isArray(p) ? p.join(", ") : card.co_narrator; }
                catch { return card.co_narrator; }
              })()}</p>
            )}
            {card.deadline && (
              <p className="text-xs text-white/35">
                Deadline: {new Date(card.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          {/* Progress stats */}
          {total > 0 && (
            <div className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-4 space-y-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">Progress</p>
              <div>
                <div className="flex justify-between text-xs text-white/40 mb-1.5">
                  <span>{liveCount} of {total} chapters live</span>
                  <span className="font-bold text-white">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }}/>
                </div>
              </div>
              <div className="space-y-1.5">
                {CHAPTER_STATUSES.map(s => {
                  const count = byStat[s.id] || 0;
                  if (!count) return null;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${s.dot} shrink-0`}/>
                      <span className="text-xs text-white/50 flex-1">{s.label}</span>
                      <span className="text-xs font-bold text-white">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-white/6 pt-3 grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-white">{totalWords.toLocaleString()}</p>
                  <p className="text-[10px] text-white/35 uppercase tracking-wide">words</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{totalPages.toLocaleString()}</p>
                  <p className="text-[10px] text-white/35 uppercase tracking-wide">pages</p>
                </div>
                {estimatedHours && (
                  <div className="col-span-2 pt-1 border-t border-white/6">
                    <p className="text-xl font-bold text-[#D4AF37]">~{estimatedHours} hrs</p>
                    <p className="text-[10px] text-white/35 uppercase tracking-wide">estimated finished hours</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Auto-import panel */}
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium mb-1">Auto-import chapters</p>
            <p className="text-xs text-white/50 mb-3">Search by title to generate chapters with AI, or drop the manuscript PDF onto the cover above.</p>

            {/* Title search */}
            <div className="flex gap-2 mb-2">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchBooks()}
                placeholder="Book title..."
                className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"
              />
              <button
                onClick={searchBooks}
                disabled={searching || aiLoading}
                className="bg-[#D4AF37] text-black text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#E0C15A] transition disabled:opacity-50"
              >
                {searching || aiLoading
                  ? <div className="h-3.5 w-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"/>
                  : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                }
              </button>
            </div>
            {(searching || aiLoading) && (
              <p className="text-xs text-[#D4AF37]/60 animate-pulse">
                {searching ? "Searching Google Books…" : "Claude is generating chapters…"}
              </p>
            )}
          </div>
        </div>

        {/* ── Right panel: Chapter list ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-white text-lg">
              Chapters <span className="text-white/30 font-normal text-sm">({chapters.filter(c => c.number != null).length})</span>
            </h2>
            <button
              onClick={addChapter}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Add chapter
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="shrink-0 text-red-400/60 hover:text-red-300">✕</button>
            </div>
          )}

          {total === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 py-20 text-center">
              <svg className="h-10 w-10 text-white/10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              <p className="text-white/20 text-sm mb-1">No chapters yet</p>
              <p className="text-xs text-white/15">Use auto-import on the left, or add manually</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chapters.map((ch, i) => {
                const st = statusStyle(ch.status);
                const isEditing = editingChapter === i;
                return (
                  <div key={i} className={`rounded-xl border transition-all ${isEditing ? "border-[#D4AF37]/30 bg-[#D4AF37]/5" : "border-white/8 bg-[#0A0D3A] hover:border-white/15"}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {ch.number != null ? (
                        <div className="h-7 w-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 shrink-0">
                          {ch.number}
                        </div>
                      ) : (
                        <div className="h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/50 shrink-0 px-2">
                          {ch.title}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input value={ch.title} onChange={e => updateChapter(i, "title", e.target.value)}
                            className="w-full bg-transparent text-sm font-semibold text-white border-b border-[#D4AF37]/40 focus:outline-none pb-0.5"/>
                        ) : (
                          <p className="text-sm font-semibold text-white truncate">{ch.title}</p>
                        )}
                        <div className="flex gap-3 mt-0.5">
                          {isEditing ? (
                            <>
                              <label className="flex items-center gap-1 text-[10px] text-white/35">
                                Words: <input type="number" value={ch.wordCount} onChange={e => updateChapter(i, "wordCount", parseInt(e.target.value) || 0)}
                                  className="w-16 bg-transparent border-b border-white/20 text-white/60 focus:outline-none text-[10px]"/>
                              </label>
                              <label className="flex items-center gap-1 text-[10px] text-white/35">
                                Pages: <input type="number" value={ch.pages} onChange={e => updateChapter(i, "pages", parseInt(e.target.value) || 0)}
                                  className="w-12 bg-transparent border-b border-white/20 text-white/60 focus:outline-none text-[10px]"/>
                              </label>
                            </>
                          ) : (
                            <>
                              {ch.wordCount > 0 && <span className="text-[10px] text-white/30">{ch.wordCount.toLocaleString()} words</span>}
                              {ch.pages > 0 && <span className="text-[10px] text-white/30">{ch.pages} pages</span>}
                            </>
                          )}
                        </div>
                      </div>

                      <button type="button" onClick={() => advanceStatus(i)} title="Click to advance status"
                        className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border shrink-0 transition-all hover:scale-105 ${st.color} border-current/20`}>
                        {st.label}
                      </button>

                      <select value={ch.status} onChange={e => updateChapter(i, "status", e.target.value)}
                        className="text-[10px] bg-[#06082E] border border-white/10 rounded-lg px-1.5 py-1 text-white/40 appearance-none focus:outline-none cursor-pointer hidden sm:block">
                        {CHAPTER_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>

                      <div className="flex gap-0.5 shrink-0">
                        <button type="button" onClick={() => moveChapter(i, -1)} disabled={i === 0}
                          className="text-white/20 hover:text-white/60 disabled:opacity-0 p-1 rounded transition-colors" title="Move up">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                        </button>
                        <button type="button" onClick={() => moveChapter(i, 1)} disabled={i === chapters.length - 1}
                          className="text-white/20 hover:text-white/60 disabled:opacity-0 p-1 rounded transition-colors" title="Move down">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                        <button type="button" onClick={() => setEditingChapter(isEditing ? null : i)}
                          className={`text-xs p-1 rounded transition-colors ${isEditing ? "text-[#D4AF37]" : "text-white/25 hover:text-white"}`}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button type="button" onClick={() => removeChapter(i)}
                          className="text-white/20 hover:text-red-400 text-xs p-1 rounded transition-colors">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="px-4 pb-3">
                        <textarea value={ch.notes} onChange={e => updateChapter(i, "notes", e.target.value)}
                          rows={2} placeholder="Notes for this chapter..."
                          className="w-full bg-black/20 border border-white/8 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/30 resize-none"/>
                      </div>
                    )}
                    {!isEditing && ch.notes && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-white/35 italic">{ch.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {total > 0 && (
            <div className="mt-6 rounded-2xl border border-white/8 bg-[#0A0D3A] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium mb-3">Status breakdown</p>
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {CHAPTER_STATUSES.map(s => {
                  const count = byStat[s.id] || 0;
                  if (!count) return null;
                  return <div key={s.id} style={{ width: `${(count / total) * 100}%` }} className={`h-full ${s.dot}`} title={`${s.label}: ${count}`}/>;
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {CHAPTER_STATUSES.map(s => {
                  const count = byStat[s.id] || 0;
                  if (!count) return null;
                  return (
                    <div key={s.id} className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${s.dot}`}/>
                      <span className="text-xs text-white/40">{s.label} <span className="text-white/60 font-semibold">{count}</span></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
