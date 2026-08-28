export interface SpanLite {
  id: string;
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

/**
 * Opening and closing double quotes, curly or straight.
 *
 * KNOWN LIMITATION — the corpus this was measured against:
 *
 *   All The Ways I'd Die For You   3889 curly pairs,    7 straight
 *   Joy Ride                       2345 curly pairs,    0 straight
 *   The Wolf King's Bride           ~1000 curly,     2348 straight
 *
 * So both styles are in use, and Wolf King mixes them inside one book. A
 * straight-only pattern would have matched 0 of Joy Ride's 2345 quotations
 * and silently erased every highlight in it, which is why the class accepts
 * either mark rather than assuming a house style.
 *
 * The interior is "any run of non-quote characters", so a quotation with a
 * NESTED double-quoted quotation inside it splits into pieces rather than
 * being treated as one. Nested double quotes do not occur in these three
 * books (nested speech is written with single quotes, which this pattern
 * ignores — they are also the apostrophe, 3843 of them in one book alone).
 * A future manuscript that nests double quotes will under-highlight rather
 * than over-highlight, and `spansWithoutQuotedRuns` below is the seam where
 * that would show up as a count rather than as silence.
 */
const QUOTED_RUN = /["“][^"“”]*["”]/g;

/**
 * Narrows one stored span to the quoted material inside it.
 *
 * The extraction call returns a speaker's whole TURN as one span — quotation,
 * attribution, narration, next quotation — because "every line of spoken
 * dialogue, copied verbatim" describes exactly that for a split quotation:
 *
 *   "You scared the shit outta me," I breathed. My hand went to my chest
 *   out of pure instinct. "I thought—"
 *
 * is one line of dialogue and one verbatim copy. 551 spans across the three
 * books are this shape. Highlighting the stored range paints the narration
 * between the quotations, which is the defect this fixes.
 *
 * Each returned piece keeps its parent's identity, so the character colour
 * and the matched/unmatched styling are unchanged — only the boundaries move.
 *
 * A span containing NO quoted run is returned untouched. Those are real:
 * unquoted dialogue (text messages, telepathy) and spans whose quotes are
 * unbalanced at the stored boundary. Narrowing them to nothing would delete
 * a highlight rather than tighten it.
 */
export function quotedSubSpans(span: SpanLite, blockText: string, blockStart: number): SpanLite[] {
  const from = Math.max(span.start_offset, blockStart);
  const to = Math.min(span.end_offset, blockStart + blockText.length);
  if (to <= from) return [span];

  const slice = blockText.slice(from - blockStart, to - blockStart);
  const out: SpanLite[] = [];
  QUOTED_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_RUN.exec(slice)) !== null) {
    out.push({
      ...span,
      start_offset: from + m.index,
      end_offset: from + m.index + m[0].length,
    });
  }

  // No quotation found inside the span: leave it exactly as stored.
  return out.length ? out : [span];
}

/**
 * Every span in a block, narrowed to its quoted runs and re-sorted.
 *
 * Sorting matters because the renderers walk spans with a single forward
 * cursor and drop anything that starts behind it; a split span emits several
 * pieces where one used to be, and an unsorted list would silently lose them.
 */
export function narrowToQuotes(spans: SpanLite[], blockText: string, blockStart: number): SpanLite[] {
  return spans
    .flatMap((s) => quotedSubSpans(s, blockText, blockStart))
    .sort((a, b) => a.start_offset - b.start_offset);
}
