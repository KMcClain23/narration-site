"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Highlighter, X } from "lucide-react";
import { splitParagraphs, type SpanLite } from "./paragraph-highlight";
import { ParagraphText, type CharacterLite } from "./ParagraphText";

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
  characters,
  chapters: initialChapters,
}: {
  manuscriptId: string;
  title: string;
  author: string | null;
  characters: CharacterLite[];
  chapters: ChapterWithSpans[];
}) {
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef(new Map<Element, string[]>());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Local, mutable copy — manual span assignment below needs to update this
  // and see the new highlight render immediately, without a full page reload.
  const [chapters, setChapters] = useState<ChapterWithSpans[]>(initialChapters);
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
                  { character_id: activeCharacterId, start_offset: startOffset, end_offset: endOffset, matched: true },
                ],
              }
            : ch
        )
      );
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Failed to assign dialogue.");
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

  // Preserve first-appearance order (matches characters' created_at order
  // from the extraction pass) rather than Set iteration order.
  const visibleChars = characters.filter((c) => visibleIds.has(c.id));

  return (
    <div ref={containerRef} onMouseUp={handleAssignSelection}>
      <div className={`sticky top-0 z-10 ${border} border-b bg-[#f1eee3]/95 py-3 backdrop-blur`}>
        <div className="flex items-center justify-between gap-3">
          <p className={`${label} ${inkFaint} truncate`}>
            {title}
            {author ? ` — ${author}` : ""}
          </p>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ${border} border bg-[#e7e2d2] px-3 py-1.5 text-xs font-medium ${ink} transition-colors hover:bg-[#ddd8c9] disabled:opacity-50`}
          >
            <Download size={13} />
            {generatingPdf ? "Generating…" : "Download PDF"}
          </button>
        </div>
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

      <AssignDialogueFab
        characters={characters}
        activeCharacterId={activeCharacterId}
        setActiveCharacterId={setActiveCharacterId}
        assignError={assignError}
        setAssignError={setAssignError}
      />

      <div className="mt-8">
        {chapters.map((ch, i) => (
          <ChapterSection
            key={ch.id}
            chapter={ch}
            index={i}
            total={chapters.length}
            charById={charById}
          />
        ))}
      </div>
    </div>
  );
}

function AssignDialogueFab({
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
    <div ref={ref} className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-2">
      {open && (
        <div className={`w-64 rounded-2xl border ${border} bg-[#f1eee3] p-3 shadow-2xl`}>
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
        <div className="max-w-[220px] rounded-lg border border-alert-red/40 bg-[#f3ddd5] px-3 py-2 text-[11px] text-alert-red shadow-lg">
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

function ChapterSection({
  chapter,
  index,
  total,
  charById,
}: {
  chapter: ChapterWithSpans;
  index: number;
  total: number;
  charById: Map<string, CharacterLite>;
}) {
  const blocks = useMemo(
    () => splitParagraphs(chapter.raw_text, chapter.spans),
    [chapter.raw_text, chapter.spans]
  );
  const povChar = chapter.pov_character
    ? [...charById.values()].find((c) => c.name === chapter.pov_character)
    : undefined;

  return (
    <section className={`mb-16 border-t ${border} pt-10 first:mt-0 first:border-t-0 first:pt-0`}>
      <p className={`${label} ${inkFaint}`}>
        Chapter {index + 1} of {total}
      </p>
      <h2 className={`mt-1 text-2xl font-bold leading-tight ${ink}`}>{chapter.title || "Untitled"}</h2>

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
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: `${c.color_hex}22`, color: c.color_hex }}
                    >
                      {c.name}
                    </span>
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
                <ParagraphText block={block} charById={charById} />
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
