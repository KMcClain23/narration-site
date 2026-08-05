import type { ReactNode } from "react";
import type { ParagraphBlock, SpanLite } from "./paragraph-highlight";

export interface CharacterLite {
  id: string;
  name: string;
  color_hex: string;
  voice_sample_url: string | null;
}

/**
 * Renders one paragraph's text with its dialogue spans wrapped in colored
 * <mark> elements — same offset-slicing approach the QA review tool proved
 * out against this exact data (ported from build_review.py's
 * highlightChapter, adapted to build React nodes instead of an HTML string).
 *
 * Each mark is clickable (`onMarkClick`) — that's how an already-highlighted
 * span gets reassigned to a different character or deleted; separate from
 * `onMouseUp`-driven creation on unhighlighted text, since a plain click
 * produces a collapsed (non-drag) selection and never triggers that path.
 */
export function ParagraphText({
  block,
  charById,
  onMarkClick,
}: {
  block: ParagraphBlock;
  charById: Map<string, CharacterLite>;
  onMarkClick?: (span: SpanLite, text: string) => void;
}) {
  const spans = [...block.spans].sort((a, b) => a.start_offset - b.start_offset);
  const nodes: ReactNode[] = [];
  let cursor = block.start;

  spans.forEach((s, i) => {
    if (s.start_offset < cursor) return; // defensive: skip accidental overlap
    if (s.start_offset > cursor) {
      nodes.push(block.text.slice(cursor - block.start, s.start_offset - block.start));
    }
    const seg = block.text.slice(s.start_offset - block.start, s.end_offset - block.start);
    const c = s.character_id ? charById.get(s.character_id) : undefined;
    const handleClick = onMarkClick ? () => onMarkClick(s, seg) : undefined;

    if (s.matched && c) {
      nodes.push(
        <mark
          key={i}
          title={`${c.name} — click to edit`}
          onClick={handleClick}
          className="cursor-pointer rounded-[3px] py-[.05em]"
          style={{ background: `${c.color_hex}33`, boxShadow: `inset 3px 0 ${c.color_hex}` }}
        >
          {seg}
        </mark>
      );
    } else {
      nodes.push(
        <mark
          key={i}
          title="Unmatched — Claude flagged this but couldn't precisely locate it. Click to edit."
          onClick={handleClick}
          className="cursor-pointer rounded-[3px] bg-alert-red/15 py-[.05em]"
          style={{ outline: "1px dashed var(--color-alert-red)", outlineOffset: "1px" }}
        >
          {seg}
        </mark>
      );
    }
    cursor = s.end_offset;
  });

  if (cursor < block.end) nodes.push(block.text.slice(cursor - block.start));

  return <>{nodes}</>;
}
