"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { splitParagraphs, type SpanLite } from "./paragraph-highlight";
import { ParagraphText, type CharacterLite } from "./ParagraphText";

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
  title,
  author,
  characters,
  chapters,
}: {
  title: string;
  author: string | null;
  characters: CharacterLite[];
  chapters: ChapterWithSpans[];
}) {
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef(new Map<Element, string[]>());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

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

  // Preserve first-appearance order (matches characters' created_at order
  // from the extraction pass) rather than Set iteration order.
  const visibleChars = characters.filter((c) => visibleIds.has(c.id));

  return (
    <div ref={containerRef}>
      <div className={`sticky top-0 z-10 ${border} border-b bg-[#f1eee3]/95 py-3 backdrop-blur`}>
        <p className={`${label} ${inkFaint}`}>
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
