export interface SpanLite {
  character_id: string | null;
  start_offset: number;
  end_offset: number;
  matched: boolean;
}

export interface ParagraphBlock {
  text: string;
  /** Absolute offset into the chapter's raw_text where this paragraph starts. */
  start: number;
  /** Absolute offset where it ends (exclusive). */
  end: number;
  /** Spans whose start falls inside this paragraph. Offsets stay absolute
   *  (chapter-relative) — callers subtract `start` when slicing `text`. */
  spans: SpanLite[];
}

/**
 * Splits a chapter's raw_text on the "\n\n" paragraph boundaries Phase 2's
 * paragraph-reconstruction produces, and assigns each dialogue span to the
 * paragraph it starts in. Splitting on a literal "\n\n" is lossless here
 * specifically because raw_text is never built with more than two
 * consecutive newlines and paragraph text itself never contains "\n\n" —
 * both are true by construction in manuscript-parser.ts's assembleParagraphs
 * / htmlToParagraphText, not just by observation.
 */
export function splitParagraphs(rawText: string, spans: SpanLite[]): ParagraphBlock[] {
  const parts = rawText.split("\n\n");
  const blocks: ParagraphBlock[] = [];
  let cursor = 0;
  for (const part of parts) {
    const start = cursor;
    const end = start + part.length;
    blocks.push({ text: part, start, end, spans: [] });
    cursor = end + 2; // "\n\n" consumed by split, not present in `part`
  }

  for (const span of spans) {
    if (span.end_offset <= span.start_offset) continue; // zero-length (fully unlocatable) — nothing to anchor inline
    const block = blocks.find((b) => span.start_offset >= b.start && span.start_offset < b.end);
    block?.spans.push(span);
  }

  return blocks;
}
