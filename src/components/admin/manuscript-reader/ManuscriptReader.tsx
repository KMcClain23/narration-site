"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Highlighter, ListTree, Mic, Square, Upload, Volume2, X } from "lucide-react";
import { splitParagraphs, type SpanLite } from "./paragraph-highlight";
import { ParagraphText, type CharacterLite } from "./ParagraphText";
import { ChapterTextEditor } from "./ChapterTextEditor";
import { computeChapterNumbers } from "@/lib/unnumbered-sections";

/** Reconstructs a plain-text character offset within `root` for a DOM
 *  (node, offset) pair from a Selection Range — walks root's text nodes in
 *  document order and sums lengths until it reaches `node`. Works regardless
 *  of how much of that text sits inside <mark> wrappers vs. bare, since marks
 *  never add or remove characters, only wrap them. */
function getOffsetWithinElement(root: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) return total + offset;
    total += current.textContent?.length ?? 0;
  }
  return total;
}

// This reader sits on its own light "page" (see page.tsx) rather than the
// admin shell's dark navy — design-tokens.ts's adminType/text-text-* tokens
// are tuned for that dark chrome and would be illegible here, so this reading
// surface gets its own small, deliberately light-safe palette instead.
const ink = "text-[#26241f]";
const inkMuted = "text-[#6f6a5e]";
const inkFaint = "text-[#8a8577]";
const border = "border-[#ddd8c9]";
const cardBg = "bg-[#e7e2d2]";
const label = "text-[11px] font-medium uppercase tracking-[0.08em]";

/** Legible text color for a filled chip background — same luminance check
 *  used for the throwaway QA review tool this reader's rendering is based on. */
function readableTextOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? "#1c1e26" : "#f6f6f8";
}

export interface ChapterWithSpans {
  id: string;
  order_index: number;
  title: string | null;
  pov_character: string | null;
  summary: string | null;
  raw_text: string;
  spans: SpanLite[];
}

/**
 * Continuous, single-scroll reader across every chapter. The sticky header's
 * "characters currently on screen" set is recomputed by a single
 * IntersectionObserver watching every paragraph, same structural pattern as
 * Reinita's scroll-reveal (one observer, `data-*`-tagged targets queried
 * once, entries.forEach driving state) — except this one never unobserves,
 * since the visible set has to update on scroll-out as well as scroll-in.
 */
export function ManuscriptReader({
  manuscriptId,
  title,
  author,
  characters: initialCharacters,
  chapters: initialChapters,
}: {
  manuscriptId: string;
  title: string;
  author: string | null;
  characters: CharacterLite[];
  chapters: ChapterWithSpans[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef(new Map<Element, string[]>());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Local, mutable copies — manual span assignment and voice-sample uploads
  // below both need to update these and see the change render immediately,
  // without a full page reload.
  const [chapters, setChapters] = useState<ChapterWithSpans[]>(initialChapters);
  const [characters, setCharacters] = useState<CharacterLite[]>(initialCharacters);
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  // Single shared <audio> instance — clicking a new character's sample stops
  // whatever's already playing, same single-active-playback convention as
  // the demos admin's WaveformStrip. Clicking the *same* character again
  // stops it instead of restarting it — playingCharacterId is what makes
  // that a toggle rather than a one-way play button, and doubles as the
  // "which sample is live right now" flag every play button reads to render
  // its own state (also cleared on natural end, not just manual stop).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingCharacterId, setPlayingCharacterId] = useState<string | null>(null);

  const getAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setPlayingCharacterId(null));
    }
    return audioRef.current;
  };

  const toggleVoiceSample = (characterId: string, url: string) => {
    const audio = getAudio();
    if (playingCharacterId === characterId) {
      audio.pause();
      setPlayingCharacterId(null);
      return;
    }
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingCharacterId(characterId);
  };

  // Display numbering skips front/back matter (Dedication, Author's Note,
  // Prologue, Epilogue, etc.) — "Chapter N of M" only counts real chapters,
  // matching how the book itself is numbered, not the section's position in
  // the array.
  const chapterMeta = useMemo(() => {
    const numbers = computeChapterNumbers(chapters.map((ch) => ch.title));
    const total = numbers.filter((n) => n !== null).length;
    return numbers.map((number) => ({ number, total }));
  }, [chapters]);

  const jumpToChapter = (chapterId: string) => {
    document.getElementById(`chapter-${chapterId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const handleAssignSelection = async () => {
    if (!activeCharacterId) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const anchorEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    const proseEl = anchorEl?.closest<HTMLElement>("[data-manuscript-prose]");

    if (!proseEl) {
      setAssignError("Select text within a single paragraph.");
      sel.removeAllRanges();
      return;
    }

    const chapterId = proseEl.getAttribute("data-chapter-id");
    const blockStart = Number(proseEl.getAttribute("data-block-start"));
    if (!chapterId || Number.isNaN(blockStart)) return;

    const startOffset = blockStart + getOffsetWithinElement(proseEl, range.startContainer, range.startOffset);
    const endOffset = blockStart + getOffsetWithinElement(proseEl, range.endContainer, range.endOffset);
    const text = sel.toString();
    sel.removeAllRanges();

    if (!text.trim() || endOffset <= startOffset) return;

    setAssignError(null);
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapterId,
          character_id: activeCharacterId,
          start_offset: startOffset,
          end_offset: endOffset,
          text,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign dialogue");

      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === chapterId
            ? {
                ...ch,
                spans: [
                  ...ch.spans,
                  {
                    id: json.id,
                    character_id: activeCharacterId,
                    start_offset: startOffset,
                    end_offset: endOffset,
                    matched: true,
                  },
                ],
              }
            : ch
        )
      );
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Failed to assign dialogue.");
    }
  };

  // Click-to-edit an already-highlighted span — reassign to a different
  // character, or delete it entirely. Independent of the create-new flow
  // above: a plain click produces a collapsed selection, so handleAssignSelection's
  // onMouseUp handler never fires for it.
  const [selectedSpan, setSelectedSpan] = useState<{ id: string; chapterId: string; text: string } | null>(null);
  const [spanActionError, setSpanActionError] = useState<string | null>(null);

  const handleMarkClick = (span: SpanLite, chapterId: string, text: string) => {
    setSelectedSpan({ id: span.id, chapterId, text });
    setSpanActionError(null);
  };

  const handleReassignSpan = async (newCharacterId: string) => {
    if (!selectedSpan) return;
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/spans/${selectedSpan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: newCharacterId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to reassign");

      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === selectedSpan.chapterId
            ? {
                ...ch,
                spans: ch.spans.map((s) =>
                  s.id === selectedSpan.id ? { ...s, character_id: newCharacterId, matched: true } : s
                ),
              }
            : ch
        )
      );
      setSelectedSpan(null);
    } catch (e) {
      setSpanActionError(e instanceof Error ? e.message : "Failed to reassign.");
    }
  };

  const handleDeleteSpan = async () => {
    if (!selectedSpan) return;
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/spans/${selectedSpan.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete");

      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === selectedSpan.chapterId
            ? { ...ch, spans: ch.spans.filter((s) => s.id !== selectedSpan.id) }
            : ch
        )
      );
      setSelectedSpan(null);
    } catch (e) {
      setSpanActionError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const [{ pdf }, { ManuscriptPrepPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ManuscriptPrepPDF"),
      ]);
      const blob = await pdf(
        <ManuscriptPrepPDF title={title} author={author} characters={characters} chapters={chapters} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "manuscript";
      a.href = url;
      a.download = `${safeTitle}-prepped.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Manuscript PDF error:", err);
      alert("PDF generation failed — see console.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const ids = (entry.target.getAttribute("data-para-characters") || "")
            .split(",")
            .filter(Boolean);
          if (entry.isIntersecting) {
            visibilityRef.current.set(entry.target, ids);
          } else {
            visibilityRef.current.delete(entry.target);
          }
        });
        const union = new Set<string>();
        visibilityRef.current.forEach((ids) => ids.forEach((id) => union.add(id)));
        setVisibleIds(union);
      },
      { threshold: 0 }
    );

    root.querySelectorAll("[data-para-characters]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [chapters]);

  useEffect(() => {
    if (!activeCharacterId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveCharacterId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCharacterId]);

  useEffect(() => {
    if (!selectedSpan) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedSpan(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSpan]);

  // Preserve first-appearance order (matches characters' created_at order
  // from the extraction pass) rather than Set iteration order.
  const visibleChars = characters.filter((c) => visibleIds.has(c.id));

  return (
    <div ref={containerRef} onMouseUp={handleAssignSelection}>
      <div className={`sticky top-0 z-10 ${border} border-b bg-[#f1eee3]/95 py-3 backdrop-blur`}>
        <p className={`${label} ${inkFaint} truncate`}>
          {title}
          {author ? ` — ${author}` : ""}
        </p>
        <div className="mt-2 flex min-h-[26px] flex-wrap gap-2">
          {visibleChars.length === 0 ? (
            <span className={`text-[13px] ${inkMuted}`}>Scroll to see who&rsquo;s on screen</span>
          ) : (
            visibleChars.map((c) => (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-full ${border} border bg-[#e7e2d2] px-2.5 py-1 text-xs ${ink}`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color_hex }} />
                {c.name}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Below md, AdminShell renders a 64px BottomTabBar (plus safe-area
          inset) fixed to the viewport bottom — a plain bottom-6 here would
          sit underneath it. */}
      <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-6 z-20 flex flex-col items-end gap-2 md:bottom-6">
        <JumpToChapterControl chapters={chapters} chapterMeta={chapterMeta} onJump={jumpToChapter} />
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={generatingPdf}
          className={`flex items-center gap-2 rounded-full ${border} border bg-[#e7e2d2] px-4 py-3 text-sm font-medium ${ink} shadow-2xl transition hover:bg-[#ddd8c9] disabled:opacity-50`}
        >
          <Download size={16} />
          {generatingPdf ? "Generating…" : "Download PDF"}
        </button>
        <VoicesControl
          manuscriptId={manuscriptId}
          characters={characters}
          setCharacters={setCharacters}
          playingCharacterId={playingCharacterId}
          onToggleSample={toggleVoiceSample}
        />
        <TagDialogueControl
          characters={characters}
          activeCharacterId={activeCharacterId}
          setActiveCharacterId={setActiveCharacterId}
          assignError={assignError}
          setAssignError={setAssignError}
        />
      </div>

      {selectedSpan && (
        <EditSpanPopover
          characters={characters}
          currentCharacterId={chapters
            .find((ch) => ch.id === selectedSpan.chapterId)
            ?.spans.find((s) => s.id === selectedSpan.id)?.character_id ?? null}
          text={selectedSpan.text}
          error={spanActionError}
          onReassign={handleReassignSpan}
          onDelete={handleDeleteSpan}
          onClose={() => setSelectedSpan(null)}
        />
      )}

      {/* A parse that produced nothing used to end here, with a manuscript
          that could not even be opened. Pasting one chapter makes it readable,
          and the usual highlighting works on it from then on. */}
      {chapters.length === 0 && (
        <div className="mt-8">
          <p className="text-sm text-text-muted">
            Nothing was extracted from this file. That happens with scanned pages, columns, and
            headings that are images. Paste the text in and the rest of the tool works as usual.
          </p>
          <ChapterTextEditor manuscriptId={manuscriptId} onDone={() => {}} />
        </div>
      )}

      <div className="mt-8">
        {chapters.map((ch, i) => (
          <ChapterSection
            key={ch.id}
            manuscriptId={manuscriptId}
            chapter={ch}
            displayNumber={chapterMeta[i].number}
            displayTotal={chapterMeta[i].total}
            charById={charById}
            onMarkClick={handleMarkClick}
            playingCharacterId={playingCharacterId}
            onToggleSample={toggleVoiceSample}
          />
        ))}
      </div>
    </div>
  );
}

/** One item in the bottom-right FAB stack — self-contained trigger button
 *  plus a popover that opens directly above it (not below, since there's
 *  no room below a bottom-anchored stack), with its own click-outside close. */
function TagDialogueControl({
  characters,
  activeCharacterId,
  setActiveCharacterId,
  assignError,
  setAssignError,
}: {
  characters: CharacterLite[];
  activeCharacterId: string | null;
  setActiveCharacterId: (id: string | null) => void;
  assignError: string | null;
  setAssignError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCharacter = activeCharacterId ? characters.find((c) => c.id === activeCharacterId) : undefined;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className={`absolute bottom-full right-0 mb-2 w-64 rounded-2xl border ${border} bg-[#f1eee3] p-3 shadow-2xl`}>
          <p className={`mb-2 text-[11px] ${inkFaint}`}>Tag missed dialogue as:</p>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((c) => {
              const isActive = c.id === activeCharacterId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCharacterId(isActive ? null : c.id);
                    setAssignError(null);
                    setOpen(false);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive ? "" : `${border} ${ink} hover:bg-[#e7e2d2]`
                  }`}
                  style={
                    isActive
                      ? { background: c.color_hex, borderColor: c.color_hex, color: readableTextOn(c.color_hex) }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: isActive ? "currentColor" : c.color_hex }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {assignError && (
        <div className="absolute bottom-full right-0 mb-2 max-w-[220px] rounded-lg border border-alert-red/40 bg-[#f3ddd5] px-3 py-2 text-[11px] text-alert-red shadow-lg">
          {assignError}
        </div>
      )}

      {activeCharacter ? (
        <button
          type="button"
          onClick={() => { setActiveCharacterId(null); setAssignError(null); }}
          className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-2xl transition hover:brightness-95"
          style={{ background: activeCharacter.color_hex, color: readableTextOn(activeCharacter.color_hex) }}
          title="Click to stop assigning (or press Esc)"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
          Tagging {activeCharacter.name}
          <X size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-full ${border} border bg-[#e7e2d2] px-4 py-3 text-sm font-medium ${ink} shadow-2xl transition hover:bg-[#ddd8c9]`}
        >
          <Highlighter size={16} />
          Tag Dialogue
        </button>
      )}
    </div>
  );
}

/** Uploads a clip via the same presigned-URL + XHR-progress pattern used
 *  throughout the app (uploadToR2 in demos-shared.ts, uploadManuscript in
 *  PrepperClient.tsx), pointed at the per-character voice-sample route, then
 *  attaches it via PATCH once the PUT to R2 actually finishes. */
async function uploadVoiceSample(
  manuscriptId: string,
  characterId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  const urlRes = await fetch(`/api/admin/manuscripts/${manuscriptId}/characters/${characterId}/voice-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "audio/mpeg" }),
  });
  const urlJson = await urlRes.json();
  if (!urlRes.ok) throw new Error(urlJson.error || "Failed to get upload URL");
  const { uploadUrl, key, publicUrl } = urlJson;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — network error."));
    xhr.send(file);
  });

  const attachRes = await fetch(`/api/admin/manuscripts/${manuscriptId}/characters/${characterId}/voice-sample`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, publicUrl }),
  });
  const attachJson = await attachRes.json();
  if (!attachRes.ok) throw new Error(attachJson.error || "Failed to save voice sample");
  return attachJson.voice_sample_url as string;
}

function VoicesControl({
  manuscriptId,
  characters,
  setCharacters,
  playingCharacterId,
  onToggleSample,
}: {
  manuscriptId: string;
  characters: CharacterLite[];
  setCharacters: (updater: (prev: CharacterLite[]) => CharacterLite[]) => void;
  playingCharacterId: string | null;
  onToggleSample: (characterId: string, url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleFile = async (characterId: string, file: File) => {
    if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
      setError("MP3 files only.");
      return;
    }
    setError(null);
    setBusyId(characterId);
    setProgress(0);
    try {
      const url = await uploadVoiceSample(manuscriptId, characterId, file, setProgress);
      setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, voice_sample_url: url } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (characterId: string) => {
    setError(null);
    setBusyId(characterId);
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/characters/${characterId}/voice-sample`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to remove");
      setCharacters((prev) => prev.map((c) => (c.id === characterId ? { ...c, voice_sample_url: null } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className={`absolute bottom-full right-0 mb-2 max-h-80 w-72 overflow-y-auto rounded-2xl border ${border} bg-[#f1eee3] p-3 shadow-2xl`}>
          <p className={`mb-2 text-[11px] ${inkFaint}`}>Voice samples (10&ndash;30s MP3)</p>
          <div className="flex flex-col gap-1.5">
            {characters.map((c) => {
              const isBusy = busyId === c.id;
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color_hex }} />
                  <span className={`flex-1 truncate text-xs ${ink}`}>{c.name}</span>

                  {isBusy ? (
                    <span className={`text-[11px] ${inkFaint}`}>{progress}%</span>
                  ) : c.voice_sample_url ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onToggleSample(c.id, c.voice_sample_url as string)}
                        title={playingCharacterId === c.id ? "Stop" : "Play sample"}
                        className={`rounded-full p-1 transition-colors hover:bg-[#e7e2d2] ${
                          playingCharacterId === c.id ? ink : "text-text-muted"
                        }`}
                      >
                        {playingCharacterId === c.id ? <Square size={14} className="fill-current" /> : <Volume2 size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(c.id)}
                        title="Remove sample"
                        className="rounded-full p-1 text-alert-red/70 transition-colors hover:bg-[#e7e2d2] hover:text-alert-red"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputRefs.current[c.id]?.click()}
                      title="Upload sample"
                      className="rounded-full p-1 text-text-muted transition-colors hover:bg-[#e7e2d2]"
                    >
                      <Upload size={14} />
                    </button>
                  )}
                  <input
                    ref={(el) => { inputRefs.current[c.id] = el; }}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(c.id, f); e.target.value = ""; }}
                  />
                </div>
              );
            })}
          </div>
          {error && <p className="mt-2 text-[11px] text-alert-red">{error}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full ${border} border bg-[#e7e2d2] px-4 py-3 text-sm font-medium ${ink} shadow-2xl transition hover:bg-[#ddd8c9]`}
      >
        <Mic size={16} />
        Voices
      </button>
    </div>
  );
}

function JumpToChapterControl({
  chapters,
  chapterMeta,
  onJump,
}: {
  chapters: ChapterWithSpans[];
  chapterMeta: { number: number | null; total: number }[];
  onJump: (chapterId: string) => void;
}) {
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
    <div ref={ref} className="relative">
      {open && (
        <div className={`absolute bottom-full right-0 mb-2 max-h-80 w-72 overflow-y-auto rounded-2xl border ${border} bg-[#f1eee3] p-2 shadow-2xl`}>
          <p className={`mb-1 px-2 pt-1 text-[11px] ${inkFaint}`}>Jump to&hellip;</p>
          <div className="flex flex-col gap-0.5">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => { onJump(ch.id); setOpen(false); }}
                className={`rounded-lg px-2 py-1.5 text-left text-xs ${ink} transition-colors hover:bg-[#e7e2d2]`}
              >
                {chapterMeta[i].number ? `Ch. ${chapterMeta[i].number}: ` : ""}
                {ch.title || "Untitled"}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full ${border} border bg-[#e7e2d2] px-4 py-3 text-sm font-medium ${ink} shadow-2xl transition hover:bg-[#ddd8c9]`}
      >
        <ListTree size={16} />
        Jump to
      </button>
    </div>
  );
}

function EditSpanPopover({
  characters,
  currentCharacterId,
  text,
  error,
  onReassign,
  onDelete,
  onClose,
}: {
  characters: CharacterLite[];
  currentCharacterId: string | null;
  text: string;
  error: string | null;
  onReassign: (characterId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] left-6 z-20 w-72 rounded-2xl border border-[#ddd8c9] bg-[#f1eee3] p-4 shadow-2xl md:bottom-6"
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`${label} ${inkFaint}`}>Editing highlight</p>
        <button type="button" onClick={onClose} className={`shrink-0 ${inkMuted} transition-opacity hover:opacity-70`}>
          <X size={14} />
        </button>
      </div>
      <p className={`mt-1.5 line-clamp-2 text-[13px] italic ${inkMuted}`}>&ldquo;{text}&rdquo;</p>

      <p className={`mt-3 text-[11px] ${inkFaint}`}>Reassign to:</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {characters.map((c) => {
          const isCurrent = c.id === currentCharacterId;
          return (
            <button
              key={c.id}
              type="button"
              disabled={isCurrent}
              onClick={() => onReassign(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                isCurrent ? "cursor-default opacity-50" : `${border} ${ink} hover:bg-[#e7e2d2]`
              }`}
              style={isCurrent ? { borderColor: c.color_hex } : undefined}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color_hex }} />
              {c.name}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[11px] text-alert-red">{error}</p>}

      <button
        type="button"
        onClick={onDelete}
        className="mt-3 w-full rounded-lg border border-alert-red/30 py-1.5 text-xs font-medium text-alert-red/80 transition-colors hover:bg-alert-red/10 hover:text-alert-red"
      >
        Remove highlight
      </button>
    </div>
  );
}

function ChapterSection({
  manuscriptId,
  chapter,
  displayNumber,
  displayTotal,
  charById,
  onMarkClick,
  playingCharacterId,
  onToggleSample,
}: {
  manuscriptId: string;
  chapter: ChapterWithSpans;
  displayNumber: number | null;
  displayTotal: number;
  charById: Map<string, CharacterLite>;
  onMarkClick: (span: SpanLite, chapterId: string, text: string) => void;
  playingCharacterId: string | null;
  onToggleSample: (characterId: string, url: string) => void;
}) {
  const blocks = useMemo(
    () => splitParagraphs(chapter.raw_text, chapter.spans),
    [chapter.raw_text, chapter.spans]
  );
  const povChar = chapter.pov_character
    ? [...charById.values()].find((c) => c.name === chapter.pov_character)
    : undefined;

  // Off by default: fixing text is the exception, and a textarea over every
  // chapter would bury the reading view it exists to rescue.
  const [fixing, setFixing] = useState(false);

  return (
    <section id={`chapter-${chapter.id}`} className={`mb-16 scroll-mt-24 border-t ${border} pt-10 first:mt-0 first:border-t-0 first:pt-0`}>
      <p className={`${label} ${inkFaint}`}>
        {displayNumber ? `Chapter ${displayNumber} of ${displayTotal}` : "Front / back matter"}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={`text-2xl font-bold leading-tight ${ink}`}>{chapter.title || "Untitled"}</h2>
        <button
          type="button"
          onClick={() => setFixing(v => !v)}
          className={`text-[13px] ${inkFaint} hover:underline`}
        >
          {fixing ? "Close" : "Fix text"}
        </button>
      </div>

      {fixing && (
        <ChapterTextEditor
          manuscriptId={manuscriptId}
          chapter={{ id: chapter.id, title: chapter.title ?? "", raw_text: chapter.raw_text }}
          spanCount={chapter.spans.length}
          onDone={() => setFixing(false)}
        />
      )}

      {chapter.pov_character && (
        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full ${border} border px-2.5 py-1 text-xs ${ink}`}>
          {povChar && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: povChar.color_hex }} />
          )}
          POV: {chapter.pov_character}
        </span>
      )}

      {chapter.summary && (
        <div className={`mt-4 rounded-xl ${border} border ${cardBg} p-4 text-sm ${inkMuted}`}>
          {chapter.summary}
        </div>
      )}

      <div className="mt-8 space-y-5">
        {blocks.map((block, bi) => {
          if (!block.text.trim()) return null;
          const speakerIds = Array.from(
            new Set(
              block.spans
                .filter((s) => s.matched && s.character_id)
                .map((s) => s.character_id as string)
            )
          );
          return (
            <div
              key={bi}
              data-para-characters={speakerIds.join(",")}
              className="grid grid-cols-1 gap-1 sm:grid-cols-[110px_1fr] sm:gap-4"
            >
              <div className="flex flex-row flex-wrap gap-1 sm:flex-col sm:items-end sm:pt-0.5 sm:text-right">
                {speakerIds.map((id) => {
                  const c = charById.get(id);
                  if (!c) return null;
                  const playable = !!c.voice_sample_url;
                  const isPlaying = playingCharacterId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!playable}
                      onClick={() => c.voice_sample_url && onToggleSample(id, c.voice_sample_url)}
                      title={playable ? `${isPlaying ? "Stop" : "Play"} ${c.name}'s voice sample` : undefined}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        playable ? "cursor-pointer transition-transform hover:scale-105" : "cursor-default"
                      }`}
                      style={{
                        background: isPlaying ? c.color_hex : `${c.color_hex}22`,
                        color: isPlaying ? readableTextOn(c.color_hex) : c.color_hex,
                      }}
                    >
                      {c.name}
                      {playable && (isPlaying ? <Square size={9} className="shrink-0 fill-current" /> : <Volume2 size={10} className="shrink-0" />)}
                    </button>
                  );
                })}
              </div>
              <p
                data-manuscript-prose="true"
                data-chapter-id={chapter.id}
                data-block-start={block.start}
                className={`text-[17px] leading-[1.75] ${ink}`}
                style={{ fontFamily: "Charter, Iowan Old Style, Georgia, ui-serif, serif" }}
              >
                <ParagraphText
                  block={block}
                  charById={charById}
                  onMarkClick={(span, text) => onMarkClick(span, chapter.id, text)}
                />
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
