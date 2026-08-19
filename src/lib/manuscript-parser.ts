import Anthropic from "@anthropic-ai/sdk";
import { sanitiseClaudeJson } from "@/lib/sanitize-claude-json";
import { computeChapterNumbers } from "@/lib/unnumbered-sections";

// SDK retries 429s automatically with exponential backoff
const anthropic = new Anthropic({ maxRetries: 4 });

// ─── DOMMatrix polyfill ───────────────────────────────────────────────────────
// pdfjs-dist (bundled inside pdf-parse) references DOMMatrix at module-init time.
// Node.js < 19 doesn't expose it as a global. Set a minimal stub before the
// first require('pdf-parse') so the module loads without throwing.
// Ported from board-pdf-process/route.ts (retired in commit 79e497e).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGlobal = typeof globalThis & { DOMMatrix?: any };

function ensureDOMMatrix() {
  const g = globalThis as AnyGlobal;
  if (typeof g.DOMMatrix !== "undefined") return;
  g.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    static fromMatrix() { return new (globalThis as AnyGlobal).DOMMatrix(); }
    static fromFloat32Array() { return new (globalThis as AnyGlobal).DOMMatrix(); }
    static fromFloat64Array() { return new (globalThis as AnyGlobal).DOMMatrix(); }
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    inverse() { return this; }
    transformPoint(p: { x?: number; y?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 };
    }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return "matrix(1, 0, 0, 1, 0, 0)"; }
  };
}

// ─── File-type detection ──────────────────────────────────────────────────────

function detectFileType(bytes: Uint8Array): "pdf" | "docx" | "txt" | "unknown" {
  // PDF magic: %PDF  (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // DOCX/ZIP magic: PK\x03\x04  (50 4B 03 04)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx";
  // No magic number for plain text — sniff instead. A UTF-8 BOM is conclusive;
  // otherwise a leading sample with no NUL bytes and few control characters is
  // text. Recovered-from-OCR manuscripts arrive as .txt, so this path exists to
  // let a repaired text layer re-enter the pipeline without being re-wrapped in
  // a .docx first.
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return "txt";
  const sample = bytes.subarray(0, 4096);
  if (sample.length) {
    let control = 0;
    for (const b of sample) {
      if (b === 0x00) return "unknown";
      // Allow tab (09), LF (0A), FF (0C — page break), CR (0D)
      if (b < 0x20 && b !== 0x09 && b !== 0x0A && b !== 0x0C && b !== 0x0D) control++;
    }
    if (control / sample.length < 0.02) return "txt";
  }
  return "unknown";
}

// ─── Text normalization ────────────────────────────────────────────────────────

/**
 * Professionally typeset PDFs encode "fi", "fl", "ff" etc. as single Unicode
 * ligature glyphs (U+FB00–U+FB06). Left alone they silently corrupt every
 * downstream word-level operation: "fingers" reads as one token no dictionary
 * or word-frequency check recognizes, TOC titles fail to match, and Claude sees
 * a garbled word. Vellum and InDesign both emit these by default, so this
 * applies to essentially every retail-typeset manuscript, not just the odd one.
 *
 * Runs at the extraction boundary so nothing downstream ever sees a ligature.
 */
const LIGATURES: Array<[RegExp, string]> = [
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/ﬅ/g, "st"], // long s + t
  [/ﬆ/g, "st"],
];

/**
 * Characters that extract cleanly and cannot be stored.
 *
 * PostgreSQL text cannot hold U+0000 at all, and supabase-js sends rows as
 * JSON, so a single NUL anywhere in a chapter fails the insert with
 * "unsupported Unicode escape sequence" — after the whole parse has run. The
 * book that surfaced this had exactly one, on page 344 of 395, in a damaged
 * region of the text layer.
 *
 * Lone surrogates are the same class of problem: a high or low surrogate
 * without its pair is not a valid code point, survives extraction, and is
 * rejected on the way to the database.
 *
 * The other C0 controls are not rejected but have no meaning in prose, and a
 * stray one would show up in an ACX-bound script. Tab, newline and carriage
 * return are kept because paragraph assembly reads them, and form feed (U+000C)
 * is kept because the txt path splits pages on it.
 */
const UNSTORABLE = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Everything that has to happen to extracted text before anything else sees it.
 *
 * Ligature folding and control stripping run together because they share the
 * same requirement: apply once, at the extraction boundary, so no downstream
 * stage — word matching, the page map sent to Claude, the stored chapter — can
 * encounter text the earlier stage would have rejected.
 */
function normalizeExtractedText(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [re, rep] of LIGATURES) out = out.replace(re, rep);
  // Replaced with a space rather than removed: a control character sitting
  // between two words is a separator, and deleting it would join them.
  return out.replace(UNSTORABLE, " ");
}

/**
 * Last check before a value is handed to the database.
 *
 * The extraction boundary above is the real fix, and this is not a substitute
 * for it. It exists because the cost of one escaped character is so lopsided:
 * a chapter title that came back from Claude rather than from the page bypasses
 * extraction entirely, and a single bad character in any of several hundred
 * rows fails the whole insert — discarding a parse that took forty seconds and
 * a model call, with nothing stored and only "unsupported Unicode escape
 * sequence" to show for it.
 */
export function toStorableText(s: string): string {
  return s.replace(UNSTORABLE, " ");
}

// ─── Text-layer quality detection ──────────────────────────────────────────────
//
// A PDF can carry a text layer that extracts without error and is still
// garbage — a corrupt/misencoded font maps glyphs to the wrong code points, so
// getTextContent() returns confident-looking mojibake. Nothing throws; the
// parse "succeeds" and produces chapters full of unreadable text.
//
// The tell is function words. Real English prose is ~32–37% the/and/of/to/a/…
// by token count, and that ratio is remarkably stable across authors and
// genres. Mojibake scores near zero because the substitution destroys them.
//
// Two things matter about how the threshold is set:
//  - It is calibrated against the document's own median page, not hardcoded.
//    Heavy dialect, invented names, or unusual prose shift a book's baseline,
//    and a fixed cutoff would either miss real corruption or condemn a clean
//    book with an unusual voice.
//  - The absolute floor is 0.20, not something lower. A run at 0.06 let pages
//    scoring 0.06–0.20 through as "clean" when they were in fact garbled —
//    the gap between corrupt and merely unusual is much narrower than it looks.

const COMMON_WORDS = new Set([
  "the", "and", "of", "to", "a", "in", "is", "it", "that", "was", "he", "she",
  "for", "on", "with", "as", "at", "but", "his", "her", "had", "not", "be",
  "have", "from", "they", "you", "this", "or", "by", "we", "an", "been", "him",
  "me", "my", "up", "out", "so", "what", "were", "when", "there", "would",
  "into", "your", "just", "like", "no", "all", "if", "one", "back", "then",
  "down", "over", "now", "could", "did", "them", "their", "than", "how",
]);

/** Fewer tokens than this and the ratio is too noisy to judge. */
const MIN_WORDS_FOR_QUALITY_CHECK = 30;
const QUALITY_ABSOLUTE_FLOOR = 0.2;
/** A page this far below the document's own median is an outlier, not a style. */
const QUALITY_MEDIAN_FRACTION = 0.55;

export interface TextQualityReport {
  /** Per-page common-word ratio; null for pages too short to judge. */
  pageRatios: Array<number | null>;
  /** Median ratio across judgeable pages — this document's own baseline. */
  median: number;
  /** The cutoff actually applied, after per-document calibration. */
  threshold: number;
  /** 0-based indices of pages scoring below the threshold. */
  suspectPages: number[];
  /** suspectPages.length / judgeable page count. */
  suspectRatio: number;
}

function commonWordRatio(text: string): number | null {
  const words = text.toLowerCase().match(/[a-z']+/g);
  if (!words || words.length < MIN_WORDS_FOR_QUALITY_CHECK) return null;
  let hits = 0;
  for (const w of words) if (COMMON_WORDS.has(w)) hits++;
  return hits / words.length;
}

export function assessTextQuality(pageTexts: string[]): TextQualityReport {
  const pageRatios = pageTexts.map(commonWordRatio);
  const judgeable = pageRatios.filter((r): r is number => r !== null);

  if (!judgeable.length) {
    return { pageRatios, median: 0, threshold: QUALITY_ABSOLUTE_FLOOR, suspectPages: [], suspectRatio: 0 };
  }

  const sorted = [...judgeable].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Calibrate to this document, but never drop below the absolute floor —
  // a book that is corrupt end-to-end has a corrupt median too, and a purely
  // relative threshold would rate it internally consistent and therefore fine.
  const threshold = Math.max(QUALITY_ABSOLUTE_FLOOR, median * QUALITY_MEDIAN_FRACTION);

  const suspectPages: number[] = [];
  pageRatios.forEach((r, i) => {
    if (r !== null && r < threshold) suspectPages.push(i);
  });

  return {
    pageRatios,
    median,
    threshold,
    suspectPages,
    suspectRatio: suspectPages.length / judgeable.length,
  };
}

// ─── DOCX extraction ──────────────────────────────────────────────────────────

interface DocxSection {
  title: string;
  wordCount: number;
  rawText: string;
}

/** Strip all HTML tags and collapse whitespace to a single-line string — used for titles. */
function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Strip HTML but preserve paragraph boundaries as blank-line-separated blocks —
 * used for chapter body text, so Phase 4's per-paragraph margin tags have
 * something to anchor to. mammoth emits one <p> (or <h*>/<li>) per source
 * paragraph, which is a reliable boundary — unlike the PDF path below, where
 * paragraphs have to be inferred from indentation.
 */
function htmlToParagraphText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Extract chapters from a .docx using mammoth.convertToHtml.
 *
 * mammoth reliably converts Word "Heading 1" paragraphs → <h1>…</h1>.
 * We find every <h1>, use it as a chapter boundary, and pull both the word
 * count and the plain-text body between consecutive headings. No Claude call
 * needed.
 *
 * Fallback: fewer than 2 <h1> tags → 300-word pseudo-pages for Claude.
 *
 * Header/footer stripping does NOT apply here — Word documents have no fixed
 * physical page boundaries in mammoth's HTML output, so there's no reliable
 * "page" position to detect a recurring running header/footer against. That
 * concern is scoped to the PDF path below, where physical pages are real.
 */
async function processDocx(buffer: Buffer): Promise<
  | { kind: "headings"; sections: DocxSection[] }
  | { kind: "pseudoPages"; pages: string[] }
> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as {
    convertToHtml:  (src: { buffer: Buffer }) => Promise<{ value: string }>;
    extractRawText: (src: { buffer: Buffer }) => Promise<{ value: string }>;
  };

  // Normalized here for the same reason the PDF and txt paths do it at their
  // own boundaries: this is where docx text enters. Tags contain neither
  // ligature glyphs nor control characters, so running it over the whole HTML
  // string is safe and covers both branches below at once.
  const { value: html } = await mammoth
    .convertToHtml({ buffer })
    .then((r) => ({ value: normalizeExtractedText(r.value) }));

  // Collect every <h1> with its position in the HTML string
  interface H1 { title: string; index: number; end: number }
  const headings: H1[] = [];
  const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = h1Re.exec(html)) !== null) {
    const title = htmlToText(m[1]);
    if (title) headings.push({ title, index: m.index, end: m.index + m[0].length });
  }

  if (headings.length >= 2) {
    const sections: DocxSection[] = headings.map((h, i) => {
      const bodyHtml = html.slice(h.end, i + 1 < headings.length ? headings[i + 1].index : html.length);
      const rawText = htmlToParagraphText(bodyHtml);
      const wordCount = rawText.split(/\s+/).filter(Boolean).length;
      return { title: h.title, wordCount, rawText };
    });
    return { kind: "headings", sections };
  }

  // Fallback: no <h1> found — split raw text into pseudo-pages for Claude.
  // Known gap: word-chunking here discards paragraph boundaries before Claude
  // ever sees the text, so chapters produced via this branch won't have
  // paragraph-anchored raw_text like the headings path does. This only fires
  // for docx files with no Heading-1 styling at all — rare enough that it's
  // being left as a follow-up rather than blocking Phase 2.
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const words = normalizeExtractedText(rawText).split(/\s+/).filter(Boolean);
  const CHUNK = 300;
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK) pages.push(words.slice(i, i + CHUNK).join(" "));
  return { kind: "pseudoPages", pages };
}

// ─── PDF text extraction ──────────────────────────────────────────────────────
//
// Two representations are built from the same getTextContent() pass:
//  - flatPages: exactly the old board-pdf-process shape (all items space-joined,
//    no line breaks). The TOC parser below is tuned against this shape and is
//    reused unchanged, so this stays byte-for-byte identical to the retired code.
//  - linePages: items grouped into lines by their transform[5] (y-position) —
//    the same grouping technique pdf-parse's own default pagerender uses
//    internally — with each line's left-edge x-position (transform[4]) kept
//    alongside it as `indent`. Header/footer stripping needs the first/last
//    *line* per page (the flattened representation throws that away), and
//    `indent` is what paragraph reconstruction below uses to tell a wrapped
//    line from a new paragraph's first line.

interface PdfLine {
  text: string;
  indent: number;
  /**
   * Set when a paragraph break is known structurally rather than inferred from
   * indentation — currently only by drop-cap joining, where the reconstructed
   * line is by definition the first line of a paragraph regardless of where the
   * oversized initial glyph happened to sit.
   */
  forceBreak?: boolean;
  /**
   * Glyph height of the line's first run, in PDF user units.
   *
   * The one piece of typography that survives text extraction, and the only
   * thing that distinguishes a chapter heading from a sentence in a print
   * layout — a paperback interior sets "CHAPTER TWELVE" at 15pt and the POV
   * name under it at 25pt against 11pt body text. Discarding it meant chapter
   * openings had to be recognized from wording alone, which fails on any book
   * that does not print the word "Chapter" in reading order at the top of the
   * page. See detectChaptersByTypography.
   */
  size?: number;
}

async function extractPagesFromPdf(buffer: Buffer): Promise<{ flatPages: string[]; linePages: PdfLine[][] }> {
  ensureDOMMatrix();

  // serverExternalPackages keeps Turbopack from bundling this CJS module;
  // require() fires lazily so the DOMMatrix polyfill above is already in place.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    buf: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ numpages: number }>;

  const flatPages: string[] = [];
  const linePages: PdfLine[][] = [];

  await pdfParse(buffer, {
    pagerender(pageData: { getTextContent: () => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) {
      return pageData.getTextContent().then((tc) => {
        const built: Array<PdfLine & { y: number }> = [];
        let lastY: number | null = null;
        let cur = "";
        let curIndent = 0;
        let curSize = 0;
        let curY = 0;
        for (const item of tc.items) {
          const y = item.transform[5];
          const x = item.transform[4];
          // transform[0] is the horizontal scale of the text matrix, which for
          // unrotated text is the rendered glyph height.
          const size = Math.abs(item.transform[0]);
          const str = normalizeExtractedText(item.str);
          if (lastY === null || y === lastY) {
            if (cur === "") { curIndent = x; curSize = size; curY = y; }
            cur += str;
          } else {
            const t = cur.trim().replace(/\s+/g, " ");
            if (t) built.push({ text: t, indent: curIndent, size: curSize, y: curY });
            cur = str;
            curIndent = x;
            curSize = size;
            curY = y;
          }
          lastY = y;
        }
        const tail = cur.trim().replace(/\s+/g, " ");
        if (tail) built.push({ text: tail, indent: curIndent, size: curSize, y: curY });

        // Sorted down the page, because the order glyphs are emitted in is not
        // the order they are read in.
        //
        // A PDF's content stream may lay text down in any order it likes. This
        // book's chapter-opening pages emit the folio, then the whole body of
        // the page, and only then the heading block that sits visually above
        // all of it — so "CHAPTER TWELVE" arrives at index 19 of 22, after the
        // text it introduces. Every consumer downstream inherited that: the
        // page map showed a sentence where the heading was, paragraph assembly
        // ran the page out of order, and slicing a chapter at its heading line
        // handed the first half of its own opening page to the chapter before.
        //
        // PDF y increases upward, so descending y is top-to-bottom. Ties keep
        // their original order, which for same-line runs is left to right.
        built.sort((a, b) => b.y - a.y);

        const lines: PdfLine[] = built.map(({ text, indent, size }) => ({ text, indent, size }));
        linePages.push(lines);

        // Ligatures are normalized here, at the single point where glyphs
        // become strings, so no consumer downstream — TOC matching, quality
        // scoring, paragraph assembly, Claude — ever has to know they existed.
        // Built from the sorted lines so the flat text reads in the same order
        // as everything else.
        const flat = lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
        flatPages.push(flat);

        return flat;
      });
    },
  });

  return { flatPages, linePages };
}

// ─── Header/footer stripping (PDF only) ────────────────────────────────────────
//
// Running headers are identified by *frequency and position*, never by matching
// against known strings. A line is a running header if it is short (<40 chars),
// sits within three lines of the top or bottom of the page, and recurs on more
// than a quarter of the book's pages.
//
// Three things this deliberately does not assume:
//
//  - Casing. Print layouts commonly set the book title in title case and the
//    author in small caps; requiring all-caps caught the author line and let
//    the title line through on every alternating spread.
//  - Exact repetition. Page numbers frequently extract fused to the header on
//    the same line ("16AMYRENFROE"), so the digits differ on every page and no
//    two headers are ever byte-identical. Grouping strips leading/trailing
//    digits before comparing, which collapses those to one key.
//  - Position within the zone. A header may extract as line 1 on one page and
//    line 2 on another depending on what else lands in that band.
//
// Alternating recto/verso headers each land near 50% of pages, comfortably
// above the 25% bar, so both variants are caught by the same single pass —
// no separate page-parity grouping needed.

const HEADER_FOOTER_MAX_LEN = 40;
/** How many lines in from each page edge count as header/footer territory. */
const HEADER_ZONE_LINES = 3;
/** A line recurring on more than this share of pages is structural, not prose. */
const RECURRENCE_FRACTION = 0.25;

function isNumericLine(s: string): boolean {
  return /^\d{1,4}$/.test(s.trim());
}

/**
 * Grouping key for a candidate header line: lowercased, whitespace collapsed,
 * trailing punctuation dropped, and leading/trailing digits removed so a folio
 * fused onto the header text doesn't make every page look unique.
 */
function headerKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\d\s]+/, "")
    .replace(/[\d\s]+$/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

function nonBlankIndices(lines: PdfLine[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].text.trim()) out.push(i);
  return out;
}

/**
 * Line positions within HEADER_ZONE_LINES of either edge of the page.
 *
 * The zone is additionally capped at a third of the page's lines. On a normal
 * 25–35 line body page that cap never binds and the zone is the full three
 * lines at each edge. On a nearly empty page — a chapter opener, a part title,
 * a page holding two lines and a folio — an uncapped zone would cover the
 * entire page, making every line on it a strip candidate. That is how a
 * frequency rule turns into silent whole-page deletion, so the zone is never
 * allowed to reach that far in.
 */
function zoneIndices(lines: PdfLine[]): number[] {
  const nb = nonBlankIndices(lines);
  if (!nb.length) return [];
  const span = Math.max(1, Math.min(HEADER_ZONE_LINES, Math.floor(nb.length / 3)));
  const head = nb.slice(0, span);
  const tail = nb.slice(-span);
  return Array.from(new Set([...head, ...tail]));
}

/** Not enough pages to establish that anything "recurs" at all. */
const MIN_PAGES_FOR_HEADER_FOOTER_DETECTION = 3;

function stripHeadersFooters(pageLines: PdfLine[][]): PdfLine[][] {
  if (pageLines.length < MIN_PAGES_FOR_HEADER_FOOTER_DETECTION) return pageLines;

  const threshold = Math.max(2, Math.ceil(pageLines.length * RECURRENCE_FRACTION));

  interface Candidate { page: number; line: number; text: string }
  const textCandidates: Candidate[] = [];
  const numericCandidates: Candidate[] = [];

  pageLines.forEach((lines, page) => {
    for (const line of zoneIndices(lines)) {
      const text = lines[line].text.trim();
      if (!text || text.length >= HEADER_FOOTER_MAX_LEN) continue;
      if (isNumericLine(text)) numericCandidates.push({ page, line, text });
      else if (headerKey(text)) textCandidates.push({ page, line, text });
    }
  });

  // A key qualifies on distinct *pages*, not raw occurrences — a header that
  // somehow extracted twice on one page shouldn't count double toward the bar.
  const byKey = new Map<string, Candidate[]>();
  for (const c of textCandidates) {
    const k = headerKey(c.text);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
  }

  const remove = new Map<number, Set<number>>();

  for (const group of byKey.values()) {
    if (new Set(group.map((c) => c.page)).size < threshold) continue;
    for (const c of group) {
      if (!remove.has(c.page)) remove.set(c.page, new Set());
      remove.get(c.page)!.add(c.line);
    }
  }

  // Bare numbers are ambiguous: a page folio and a printed chapter number are
  // the same token sitting in the same place. They are told apart by whether
  // the number tracks the page it is on. Folios run in sequence, so the
  // printed number differs from the page's position in the file by a constant
  // — front matter only shifts where the numbering starts. A chapter number
  // has no such relationship: "31" on the two-hundredth page is off by a
  // wildly different amount than the folio printed beside it. So the offset
  // shared by many pages belongs to the folio, and every number sharing it can
  // go while chapter numbers stay.
  //
  // This replaces a rule that stripped a bare number only when a text running
  // header was also found on the same page. That protected chapter numbers,
  // but failed silently on any book whose pages carry a folio and no header
  // text — nothing qualified, nothing was stripped, and every page number
  // dropped into the prose mid-sentence.
  const byOffset = new Map<number, Candidate[]>();
  for (const c of numericCandidates) {
    const offset = parseInt(c.text, 10) - c.page;
    if (!byOffset.has(offset)) byOffset.set(offset, []);
    byOffset.get(offset)!.push(c);
  }

  let folios: Candidate[] = [];
  let folioPages = 0;
  for (const group of byOffset.values()) {
    const pages = new Set(group.map((c) => c.page)).size;
    if (pages >= threshold && pages > folioPages) {
      folios = group;
      folioPages = pages;
    }
  }

  for (const c of folios) {
    if (!remove.has(c.page)) remove.set(c.page, new Set());
    remove.get(c.page)!.add(c.line);
  }

  if (!remove.size) return pageLines;

  return pageLines.map((lines, page) => {
    const drop = remove.get(page);
    if (!drop?.size) return lines;
    return lines.filter((_, i) => !drop.has(i));
  });
}

// ─── Drop-cap joining (PDF only) ───────────────────────────────────────────────

/**
 * Vellum and most print layouts open a chapter with a drop cap — an oversized
 * initial letter set on its own baseline, which extracts as a line containing
 * nothing but that one letter. The remainder of the word sits on the next line
 * and therefore starts lowercase.
 *
 * Left unjoined, the letter is orphaned: it reads as its own line, gets swept
 * up by whatever ran before it, and the chapter's first word arrives truncated
 * ("he mud" instead of "The mud"). Every chapter in the book has one, so this
 * is not an edge case — it is the first sentence of every chapter.
 *
 * The rule is deliberately narrow: exactly one letter alone on a line,
 * immediately followed by a line beginning with a lowercase letter. A real
 * one-letter line that is genuinely its own content ("I") is followed by
 * something that starts with a capital or punctuation, so it is left alone.
 */
/** A printed chapter number, or a chapter title as typeset (all caps). */
function isChapterHeadingLine(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 80) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  return /[A-Z]/.test(t) && !/[a-z]/.test(t);
}

/**
 * How many heading lines may sit between a drop cap and its continuation.
 *
 * Three was too few: a chapter number plus a title that wraps to two lines
 * already fills the gap, and the letter stayed orphaned ("he Great Hall" for
 * "The Great Hall"). The scan stops at the first line that isn't heading-like
 * regardless, so this bound only caps how much heading it will tolerate — it
 * cannot run away into prose.
 */
const DROP_CAP_LOOKAHEAD = 6;

/**
 * Reattach a drop cap that optical recognition moved onto a later line.
 *
 * An oversized initial spans two lines of body text, so its vertical center
 * sits beside the *second* one. OCR reads by row and emits it there, leaving a
 * chapter that opens like this:
 *
 *     Y MANICURED NAILS CLACK against my keyboard as I fire off
 *     M the last words.
 *
 * The letter is never alone on a line, so joinDropCaps — which looks for
 * exactly that — cannot see this shape at all.
 *
 * Three things have to hold at once, because a line beginning "I " or "A " is
 * unremarkable in prose and must never be treated as a stray initial:
 *
 *   - the previous line opens with the tail of a decapitated word — a short
 *     run of capitals — followed by more capitals from the small-caps opening
 *     ("Y MANICURED"), which ordinary prose does not produce;
 *   - that tail is not itself the word "A" or "I", so "A MANIFESTO lay open."
 *     followed by "I said nothing." is left alone;
 *   - it happens near the top of a page, which is the only place a chapter —
 *     and therefore a drop cap — can begin.
 */
/**
 * How far into a page the rule may look, counted in lines that carry text.
 *
 * Blank lines are not counted. A recovered page separates its heading, its POV
 * line and its opening lines with blanks, which doubles a raw line count and
 * put the real drop cap one position outside a raw-index window that looked
 * generous on paper.
 */
const FRAGMENT_DROP_CAP_ZONE = 10;

function joinFragmentDropCaps(lines: PdfLine[]): PdfLine[] {
  const out = lines.map((l) => ({ ...l }));

  let seen = 0;
  for (let i = 1; i < out.length; i++) {
    if (!out[i].text.trim()) continue;
    if (++seen > FRAGMENT_DROP_CAP_ZONE) break;

    const moved = out[i].text.match(/^([A-Z]) (.+)$/);
    if (!moved) continue;

    let prev = i - 1;
    while (prev >= 0 && !out[prev].text.trim()) prev--;
    if (prev < 0) continue;

    const tail = out[prev].text.trim().match(/^([A-Z]{1,4})\s+[A-Z]{2,}/);
    if (!tail || tail[1] === "A" || tail[1] === "I") continue;

    out[prev] = { ...out[prev], text: moved[1] + out[prev].text.trim() };
    out[i] = { ...out[i], text: moved[2] };
  }

  return out;
}

function joinDropCaps(lines: PdfLine[]): PdfLine[] {
  const work = lines.map((l) => ({ ...l }));
  const consumed = new Set<number>();

  for (let i = 0; i < work.length; i++) {
    if (consumed.has(i) || !/^[A-Z]$/.test(work[i].text.trim())) continue;

    // The continuation is rarely the next line. A drop cap is set large and
    // high, so it extracts ahead of the chapter number and the chapter title
    // even though it reads after them — the order on the page is cap, number,
    // heading, prose. Scanning only the adjacent line left the letter stranded
    // and every chapter opening truncated ("he mud" for "The mud").
    //
    // The scan stops at anything that isn't a heading, so it can never reach
    // across real prose to steal a letter from an unrelated paragraph.
    for (let j = i + 1; j < Math.min(i + 1 + DROP_CAP_LOOKAHEAD, work.length); j++) {
      const t = work[j].text.trim();
      if (!t) continue;
      if (/^[a-z]/.test(t)) {
        work[j] = { ...work[j], text: work[i].text.trim() + t, forceBreak: true };
        consumed.add(i);
        break;
      }
      if (!isChapterHeadingLine(t)) break;
    }
  }

  return work.filter((_, i) => !consumed.has(i));
}

// ─── TOC detection & parsing ────────────────────────────────────────────────────
// Unchanged from board-pdf-process/route.ts (commit 79e497e~1) — reused as-is.
// Operates on flatPages (space-joined, no line breaks), same shape it was
// originally tuned against.

interface TocEntry {
  title: string;
  startPage: number; // physical content-stream page index (1-based)
}

/** Convert "iii" / "iv" / "7" → integer. Returns 0 for unrecognized strings. */
function parsePageNum(s: string): number {
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return n;
  const V: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let r = 0;
  const lo = s.toLowerCase();
  for (let j = 0; j < lo.length; j++) {
    const cur = V[lo[j]] ?? 0;
    const nxt = V[lo[j + 1]] ?? 0;
    r += cur < nxt ? -cur : cur;
  }
  return r > 0 ? r : 0;
}

function cleanTocTitle(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")   // strip HTML tags (e.g. mammoth anchor stubs)
    .replace(/^\d+\.\s*/, "")  // strip leading "N." list prefix
    .replace(/\s+/g, " ")
    .trim();
}

// ── Title patterns ─────────────────────────────────────────────────────────
//
// Compound number words must come BEFORE single words in the alternation so
// "Twenty-Three" matches the compound branch rather than stopping at "Twenty".

const COMPOUND_NUM =
  "(?:Twenty|Thirty|Forty|Fifty)-(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine)";

const SINGLE_NUM =
  "One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|" +
  "Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|Thirty|Forty|Fifty";

// Optional numeric/word suffix for "Chapter 1", "Chapter One", etc.
const NUM_SUFFIX =
  "(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|" +
  "eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+))?";

const KNOWN_SECTION =
  "content\\s*(?:&|and)\\s*trigger\\s*warnings?|trigger\\s*warnings?|" +
  "author\\s*'?s?\\s+note|" +
  `(?:chapter|prologue|epilogue|dedication|introduction|preface|afterword|foreword|` +
  `appendix|acknowledgements?|acknowledgments?)${NUM_SUFFIX}`;

// Page numbers: integer or lowercase roman numeral (i, ii, iii, iv … x …)
const PAGE_NUM = "\\d{1,4}|[ivxlcdm]{1,6}";

// Unnumbered section keywords (no "Chapter N" prefix, no number suffix needed)
/** Section names that appear in a TOC without a chapter number in front. */
const UNNUMBERED_WORDS =
  `prologue|epilogue|dedication|preface|afterword|foreword|appendix|introduction|` +
  `acknowledgements?|acknowledgments?|author'?s?\\s+note`;

/**
 * Unnumbered TOC rows ("Prologue 1", "Epilogue 335"), matched inside flat page
 * text. Separate from UNNUMBERED_KW below, which tests a whole segment rather
 * than searching within one.
 */
const UNNUMBERED_ENTRY = new RegExp(`\\b(${UNNUMBERED_WORDS})\\s+(\\d{1,4})\\b`, "gi");

const UNNUMBERED_KW =
  /^(prologue|epilogue|dedication|preface|afterword|foreword|appendix|introduction|acknowledgements?|acknowledgments?|author'?s?\s+note|content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|content\s*warnings?)$/i;

/**
 * Try to extract TOC entries from an array of text segments (split on | or \n).
 * Uses title:page as the dedup key so repeated character names with different
 * page numbers are all captured (e.g. "Brooke" as chapter 1, 18, 29, 41...).
 * Returns the matched entries if count >= threshold, otherwise null (no side-effects).
 */
function trySegmentedExtract(
  segments: string[],
  seen: Set<string>,
  threshold: number
): TocEntry[] | null {
  const entries: TocEntry[] = [];
  const addedKeys: string[] = [];

  for (const seg of segments) {
    // Numbered: "N. Title PageNum"
    const numM = seg.match(/^(\d+)\.\s+([A-Za-z][A-Za-z '\-]{0,60}?)\s+(\d{1,4})$/);
    if (numM) {
      const chapNum = parseInt(numM[1], 10);
      const rawTitle = numM[2].trim();
      const page = parseInt(numM[3], 10);
      // Store as "Chapter N: Name" so the list is human-readable without needing
      // the separate number field — assignChapters still assigns its own number.
      const title = `Chapter ${chapNum}: ${rawTitle}`;
      const key = `${title.toLowerCase()}:${page}`;
      if (page > 0 && !seen.has(key) && !addedKeys.includes(key)) {
        entries.push({ title, startPage: page });
        addedKeys.push(key);
      }
      continue;
    }
    // Unnumbered keyword: "Prologue PageNum", "Epilogue PageNum", etc.
    const kwM = seg.match(/^([A-Za-z][A-Za-z '\-]{0,60}?)\s+(\d{1,4})$/);
    if (kwM && UNNUMBERED_KW.test(kwM[1].trim())) {
      const title = cleanTocTitle(kwM[1].trim());
      const page = parseInt(kwM[2], 10);
      const key = `${title.toLowerCase()}:${page}`;
      if (page > 0 && !seen.has(key) && !addedKeys.includes(key)) {
        entries.push({ title, startPage: page });
        addedKeys.push(key);
      }
    }
  }

  if (entries.length >= threshold) {
    addedKeys.forEach(k => seen.add(k));
    return entries;
  }
  return null; // not enough — caller falls through to Strategy A/B
}

/**
 * Attempt to pull TOC entries out of one page's text using three strategies.
 *
 * Strategy C — compact TOC with | or \n separators
 *   "Prologue 1 | 1. Brooke 9 | 2. Seth 21"  or newline-separated equivalent.
 *   Uses title:page dedup key so repeated character-name POV chapters are all kept.
 *   Threshold: 3 for pipe-separated pages, 5 for newline-separated (avoids prose).
 *
 * Strategy A — numbered list "N. Title  pageNum" (multi-line prose TOC)
 *
 * Strategy B — keyword / number-word entries "One  1", "Preface  iii"
 *   Only fires if A found nothing.
 */
function extractTocEntries(text: string, out: TocEntry[], seen: Set<string>): void {
  let found = 0;
  let m: RegExpExecArray | null;

  // ── Strategy C: explicit-separator compact TOC (| or \n) ─────────────────
  const pipeCount = (text.match(/\|/g) ?? []).length;
  if (pipeCount >= 3) {
    const segs = text.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
    const result = trySegmentedExtract(segs, seen, 3);
    if (result) { out.push(...result); return; }
  }
  // Always try newline split too — pages 4+ of a multi-page TOC may lose the |
  {
    const segs = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    const result = trySegmentedExtract(segs, seen, 5);
    if (result) { out.push(...result); return; }
  }

  // ── Strategy A: numbered list "N. Title  pageNum" ────────────────────────
  // Dedup key is title:page so repeated short titles don't collide.
  // The lookahead marks where one entry ends. It has to stop at an unnumbered
  // section as well as at the next numbered one: a TOC that closes with
  // "… 52. Title 405 Epilogue 411" would otherwise let the lazy title run past
  // its own page number, swallowing "405 Epilogue" into the title and taking
  // the epilogue's page as the chapter's. That misfiles the last chapter of
  // every book with back matter listed after the numbered run.
  const reA = new RegExp(
    `(?:^|\\s)\\d+\\.\\s+([\\s\\S]+?)\\s+(${PAGE_NUM})` +
      `(?=\\s+\\d+\\.\\s+|\\s+(?:${UNNUMBERED_WORDS})\\s+\\d|\\s*$)`,
    "gi"
  );
  while ((m = reA.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parsePageNum(m[2]);
    const key = `${title.toLowerCase()}:${page}`;
    if (title && page > 0 && !seen.has(key)) {
      out.push({ title, startPage: page });
      seen.add(key);
      found++;
    }
  }
  if (found > 0) return;

  // ── Strategy B: keyword / number-word entries ─────────────────────────────
  const reB = new RegExp(
    `\\b(${COMPOUND_NUM}|${KNOWN_SECTION}|${SINGLE_NUM})\\s+(${PAGE_NUM})(?=\\s|$)`,
    "gi"
  );
  while ((m = reB.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parsePageNum(m[2]);
    const key = `${title.toLowerCase()}:${page}`;
    if (title && page > 0 && !seen.has(key)) {
      out.push({ title, startPage: page });
      seen.add(key);
    }
  }
}

/**
 * Scan pages 1–15 for a Table of Contents, collecting entries across all pages
 * so multi-page TOCs (e.g. pages 3–5) are handled in one pass.
 *
 * Blank pages are skipped.  Validation requires ≥75% of consecutive entry pairs
 * to be ascending — the one expected dip is the roman-numeral → arabic transition
 * at the front-matter / body-chapter boundary ("iv"→4 then "1").
 */
function parseTocFromPages(pageTexts: string[]): { entries: TocEntry[]; lastTocPage: number } | null {
  const entries: TocEntry[] = [];
  const seen = new Set<string>();
  // Which page the TOC ran to, so title confirmation can search past it and
  // not match a chapter title against its own contents-listing entry.
  let lastTocPage = -1;

  for (let i = 0; i < Math.min(15, pageTexts.length); i++) {
    if (!pageTexts[i].trim()) continue;

    // Only a page that yielded several entries counts as part of the contents,
    // and its entries are only kept if it did.
    //
    // A single match is far more likely to be a chapter opening that happens to
    // read like a TOC row: "Chapter 1" at the head of a chapter is exactly the
    // "keyword then number" shape the keyword strategy looks for, and reads as
    // a row titled "Chapter" pointing at page 1. Three chapter openings in the
    // first fifteen pages therefore manufactured a three-row table of contents
    // for a book that has none, which then failed its own validation and took
    // the book down with it.
    //
    // A real contents page lists many entries; a page of prose that mentions a
    // chapter number lists one. That difference is the whole test, and it needs
    // no knowledge of which words a title may contain.
    const pageEntries: TocEntry[] = [];
    const pageSeen = new Set(seen);
    extractTocEntries(pageTexts[i], pageEntries, pageSeen);

    if (pageEntries.length >= 2) {
      for (const e of pageEntries) {
        entries.push(e);
        seen.add(`${e.title.toLowerCase()}:${e.startPage}`);
      }
      lastTocPage = i;
    }
  }

  if (entries.length < 3) return null;

  // Require the majority of consecutive pairs to be ascending
  let asc = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].startPage > entries[i - 1].startPage) asc++;
  }
  const ascRatio = asc / (entries.length - 1);
  if (ascRatio < 0.75) return null;

  // Strategy A only matches numbered rows, and returns the moment it finds
  // any — so on a TOC that mixes "1. Title 5" with unnumbered sections
  // ("Prologue 1", "Epilogue 335"), Strategy B never runs and every
  // unnumbered section is silently lost. Those are real chapters someone has
  // to read, so they are collected in a second targeted pass here rather than
  // by loosening Strategy A, which would cost precision on the numbered rows.
  for (let i = 0; i <= lastTocPage && i < pageTexts.length; i++) {
    UNNUMBERED_ENTRY.lastIndex = 0;
    let um: RegExpExecArray | null;
    while ((um = UNNUMBERED_ENTRY.exec(pageTexts[i])) !== null) {
      const title = cleanTocTitle(um[1]);
      const page = parsePageNum(um[2]);
      const key = `${title.toLowerCase()}:${page}`;
      if (title && page > 0 && !seen.has(key)) {
        entries.push({ title, startPage: page });
        seen.add(key);
      }
    }
  }

  // Front matter appended after the numbered rows would otherwise sit out of
  // order, and chapter ranges are cut from consecutive pairs — an unsorted
  // list would hand one section another's pages.
  entries.sort((a, b) => a.startPage - b.startPage);

  return { entries, lastTocPage };
}

// ─── TOC as primary source ─────────────────────────────────────────────────────
//
// When a book has a table of contents, it is ground truth: exact chapter count,
// exact titles, POV character, and start page, all authored rather than
// inferred. Body-text detection then becomes validation instead of guesswork.
//
// Two things have to be solved before it can be trusted.
//
// Layout. Print TOCs are typeset in two columns — every title down the left,
// every page number down the right — and PDF extraction reads them as one block
// of titles followed by one block of numbers, never as "title … number" lines.
// So the two blocks are paired positionally.
//
// Numbering. TOC page numbers are *printed* page numbers, which do not equal
// PDF page indices: front matter is unnumbered or numbered in roman, so the
// arabic sequence starts partway into the file. The gap is constant, and is
// derived once by finding where a known chapter title actually appears in the
// body.

interface RawTocEntry {
  rawTitle: string;
  printedPage: number;
}

export interface TocChapter {
  /** Title with any POV suffix removed. */
  title: string;
  /** Exactly as printed in the TOC. */
  rawTitle: string;
  /** As printed, which may name more than one ("Kael and Lyra"). */
  povCharacter: string | null;
  /** Individual names, split out of povCharacter. */
  povNames: string[];
  printedPage: number;
  /** printedPage + offset, 1-based. */
  pdfPage: number;
  /** Where the title was actually found in the body, if it was. */
  foundOnPdfPage: number | null;
  /** Set when the POV had to be recovered without a separator. */
  povNote?: string;
}

/** Aggressive normalization for comparing a TOC title against body text. */
function normalizeForMatch(s: string): string {
  return normalizeExtractedText(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripTocNumbering(s: string): string {
  return s.replace(/^\d{1,3}\s*[.)]\s*/, "").trim();
}

function looksLikeTocTitle(s: string): boolean {
  const t = stripTocNumbering(s);
  if (t.length < 2 || t.length > 90) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return !/^contents$/i.test(t);
}

function isAscending(nums: number[]): boolean {
  for (let i = 1; i < nums.length; i++) if (nums[i] <= nums[i - 1]) return false;
  return true;
}

/**
 * Pair one TOC page's title block against its page-number block. Returns null
 * unless the two blocks line up, so a page that merely looks list-like doesn't
 * produce garbage entries.
 */
function pairTocColumnsOnPage(lines: PdfLine[]): RawTocEntry[] | null {
  const titles: string[] = [];
  let numbers: number[] = [];

  for (const line of lines) {
    const t = line.text.trim();
    if (!t) continue;
    if (/^\d{1,4}$/.test(t)) numbers.push(parseInt(t, 10));
    else if (looksLikeTocTitle(t)) titles.push(stripTocNumbering(t));
  }

  if (titles.length < 3) return null;

  // One spare number is the TOC page's own folio. Which end it landed on
  // depends on the layout, so try both and keep whichever leaves a clean
  // ascending run of page numbers.
  if (numbers.length === titles.length + 1) {
    const dropLast = numbers.slice(0, -1);
    const dropFirst = numbers.slice(1);
    numbers = isAscending(dropLast) ? dropLast : isAscending(dropFirst) ? dropFirst : numbers;
  }

  if (numbers.length !== titles.length) return null;
  if (!isAscending(numbers)) return null;

  return titles.map((rawTitle, i) => ({ rawTitle, printedPage: numbers[i] }));
}

/** Collect column-paired entries across however many pages the TOC spans. */
function parseTocByColumns(
  linePages: PdfLine[][]
): { entries: RawTocEntry[]; lastTocPage: number } | null {
  const entries: RawTocEntry[] = [];
  let lastTocPage = -1;

  for (let i = 0; i < Math.min(15, linePages.length); i++) {
    const paired = pairTocColumnsOnPage(linePages[i]);
    if (!paired) continue;
    // A continuation page must carry on from the previous one; a later page
    // that restarts at a lower number is a different list, not more TOC.
    if (entries.length && paired[0].printedPage <= entries[entries.length - 1].printedPage) continue;
    entries.push(...paired);
    lastTocPage = i;
  }

  return entries.length >= 3 ? { entries, lastTocPage } : null;
}

// ── POV extraction ────────────────────────────────────────────────────────────
//
// Most entries name the POV after a dash. Some don't — the separator is simply
// missing on the odd line ("The Chosen Sacrifice Lyra"), and a split on " - "
// would drop the POV there silently. So the dashed entries are read first to
// learn the cast, and that name set is then used to recover the POV from
// entries that lack a separator. Every such recovery is recorded rather than
// applied invisibly, because a missing separator is a typesetting defect and
// the operator should be able to see where the data was repaired.

const POV_SEPARATOR = /\s*[-–—]\s*/;

function splitPovNames(pov: string): string[] {
  return pov
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

function extractPovFromTitles(entries: RawTocEntry[]): TocChapter[] {
  // Pass 1 — learn the cast from entries that do use a separator.
  const known = new Set<string>();
  const dashed = entries.map((e) => {
    const parts = e.rawTitle.split(POV_SEPARATOR);
    if (parts.length < 2) return null;
    const pov = parts[parts.length - 1].trim();
    // A trailing fragment with many words is part of the title, not a name.
    if (!pov || splitPovNames(pov).some((n) => n.split(/\s+/).length > 3)) return null;
    splitPovNames(pov).forEach((n) => known.add(n.toLowerCase()));
    return { title: parts.slice(0, -1).join(" ").trim(), pov };
  });

  // Pass 2 — apply the cast to entries with no separator.
  return entries.map((e, i) => {
    const d = dashed[i];
    if (d) {
      return {
        title: d.title,
        rawTitle: e.rawTitle,
        povCharacter: d.pov,
        povNames: splitPovNames(d.pov),
        printedPage: e.printedPage,
        pdfPage: 0,
        foundOnPdfPage: null,
      };
    }

    // Longest known name that the title ends with wins, so "Kael" can't shadow
    // a longer name ending in the same word.
    const words = e.rawTitle.trim().split(/\s+/);
    for (let take = Math.min(4, words.length - 1); take >= 1; take--) {
      const candidate = words.slice(-take).join(" ");
      if (known.has(candidate.toLowerCase())) {
        return {
          title: words.slice(0, -take).join(" ").trim(),
          rawTitle: e.rawTitle,
          povCharacter: candidate,
          povNames: splitPovNames(candidate),
          printedPage: e.printedPage,
          pdfPage: 0,
          foundOnPdfPage: null,
          povNote: `POV "${candidate}" recovered without a separator in TOC entry "${e.rawTitle}"`,
        };
      }
    }

    return {
      title: e.rawTitle,
      rawTitle: e.rawTitle,
      povCharacter: null,
      povNames: [],
      printedPage: e.printedPage,
      pdfPage: 0,
      foundOnPdfPage: null,
    };
  });
}

// ── Chapter openings by typography ───────────────────────────────────────────

/** How much larger than body text a line must be set to count as a heading. */
const HEADING_SIZE_MULTIPLE = 1.25;

/** A heading is a few words, not a paragraph that happens to be emphasised. */
const HEADING_MAX_LEN = 60;

/** Section words a heading may open with, for a heading to start a section. */
const SECTION_WORD =
  /^(chapter|prologue|epilogue|part|book|interlude|acknowledge?ments?|acknowledgments?|afterword|foreword|preface|introduction|author'?s?\s+note)\b/i;

/** Fewest sections a typographic read must find before it is trusted. */
const MIN_TYPOGRAPHIC_SECTIONS = 3;

/**
 * Tidy a heading as printed into a title as displayed.
 *
 * Print layouts hyphenate and letterspace headings, so "CHAPTER TWENTY- ONE"
 * arrives with the break still in it, and everything is set in capitals.
 */
function cleanHeadingTitle(raw: string): string {
  const joined = raw.replace(/-\s+/g, "-").replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(joined)) return joined; // already mixed case — leave it alone
  return joined
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * A POV name with its typeset decoration removed.
 *
 * Layouts bracket the name — "-Mia-", "~Hades~", "* Nate *" — and a footnote
 * marker can ride along on the end. That decoration has to come off before the
 * name reaches the character roster, because the roster is matched against
 * speaker names found in the prose: seeded as "-Mia-" it matches nothing the
 * extraction pass ever says, so every line she speaks arrives unattributed and
 * the roster is worse than useless — it is a second character for the same
 * person.
 *
 * Only leading and trailing runs are stripped, so a genuinely hyphenated name
 * ("Mary-Anne") survives intact.
 */
const NAME_DECORATION = /^[\s\-–—_*~•·]+|[\s\-–—_*~•·]+$/g;

function cleanPovName(raw: string): string {
  return cleanHeadingTitle(raw).replace(NAME_DECORATION, "").trim();
}

/**
 * Find chapter openings from how the page is set rather than what it says.
 *
 * A print interior marks a chapter opening unmistakably and never in words the
 * text layer presents in reading order: "Swing and a Kiss" sets CHAPTER TWELVE
 * at 15pt with the POV name "Nate" at 25pt beneath it, against 11pt body — but
 * extracts those glyphs *after* the body text of the page, so every approach
 * that reads the start of a page sees a sentence and concludes the page is not
 * a chapter opening. That book has no table of contents either, which left
 * body-text inference as the only strategy, and it produced 87 one-page
 * chapters on a 34-chapter novel.
 *
 * Size is the signal that survives extraction intact, and it is unambiguous:
 * body text is one size across the whole book, and a heading is visibly larger.
 * A second oversized line immediately after the first is the POV name, which
 * this gets for free and correct — the same names the extraction pass would
 * otherwise have to infer chapter by chapter.
 *
 * Returns null unless it finds a real book's worth of sections, so a document
 * with occasional large text cannot be mistaken for a well-set one.
 */
function detectChaptersByTypography(
  linePages: PdfLine[][]
): Array<{ title: string; startPage: number; startLine: number; povCharacter: string | null }> | null {
  const sizes = new Map<number, number>();
  for (const lines of linePages) {
    for (const l of lines) {
      if (!l.size) continue;
      const bucket = Math.round(l.size * 2) / 2;
      sizes.set(bucket, (sizes.get(bucket) ?? 0) + 1);
    }
  }
  if (!sizes.size) return null;

  // Body size is the most common, by a wide margin, in any book.
  let bodySize = 0;
  let best = 0;
  for (const [size, count] of sizes) {
    if (count > best) { best = count; bodySize = size; }
  }
  if (!bodySize) return null;

  const threshold = bodySize * HEADING_SIZE_MULTIPLE;
  const sections: Array<{ title: string; startPage: number; startLine: number; povCharacter: string | null }> = [];

  linePages.forEach((lines, page) => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.size || l.size < threshold) continue;
      const text = l.text.trim();
      if (!text || text.length > HEADING_MAX_LEN) continue;
      if (!SECTION_WORD.test(text.replace(/\s+/g, " "))) continue;

      // Only the first section heading on a page — a running head set large, or
      // a heading wrapped across two lines, must not open a second chapter.
      if (sections.length && sections[sections.length - 1].startPage === page + 1) break;

      // The line under it, if also oversized and not itself a section word, is
      // the POV name this layout prints beneath the chapter number.
      let povCharacter: string | null = null;
      const next = lines[i + 1];
      if (
        next?.size &&
        next.size >= threshold &&
        next.text.trim().length <= HEADING_MAX_LEN &&
        !SECTION_WORD.test(next.text.trim())
      ) {
        povCharacter = cleanPovName(next.text) || null;
      }

      sections.push({
        title: cleanHeadingTitle(text),
        startPage: page + 1, // 1-based, matching the TOC path
        startLine: i,
        povCharacter,
      });
      break;
    }
  });

  if (sections.length < MIN_TYPOGRAPHIC_SECTIONS) return null;
  return sections;
}

// ── Printed page → PDF page ───────────────────────────────────────────────────

/** How far from the predicted page a title may appear and still confirm it. */
const PAGE_MATCH_TOLERANCE = 2;

/**
 * How much unconfirmed the parse will accept before refusing the book.
 *
 * A handful of chapters failing to confirm against an offset that the rest of
 * the book agrees on is a different situation from the offset being wrong. The
 * first is usually one damaged page or one misread TOC entry, and rejecting an
 * otherwise-correct 34-chapter parse over it helps nobody. The second means
 * every boundary is suspect.
 *
 * So a small minority is placed by arithmetic and reported on the manuscript
 * by name, which keeps the property that actually matters — misalignment is
 * never silent — without making it all or nothing. Both a fraction and an
 * absolute cap, so a very long book cannot quietly accept dozens of them.
 */
const MAX_UNCONFIRMED_FRACTION = 0.15;
const MAX_UNCONFIRMED_ABSOLUTE = 5;

/**
 * A title short enough that finding it in prose proves nothing on its own.
 *
 * This used to be a hard floor: anything shorter returned no hits at all. That
 * silently disqualified every chapter of a book whose chapters are titled with
 * a POV name — "Seth" is four characters, so all twenty-four of its chapters
 * produced zero sightings, failed confirmation, and took the whole book down
 * with a TOC-validation error that named the offset rather than the real cause.
 *
 * Short titles are now searched like any other; what changes is *where* they
 * are allowed to match. See findTitlePages.
 */
const MIN_DISTINCTIVE_TITLE_LEN = 6;

/**
 * How far into a page a heading may sit, in normalized characters.
 *
 * Headers and folios are stripped before this runs, so a chapter's heading is
 * at or within a few characters of the start of its opening page — the only
 * thing that can precede it is a printed chapter number. Prose mentioning the
 * same name is not.
 *
 * Kept tight deliberately. A window wide enough to feel safe (48 characters)
 * still admits "The afternoon went on, Brooke did not look up" and matches
 * every page of narration she appears on, which is the exact failure this is
 * meant to prevent.
 */
const TITLE_HEADING_WINDOW = 12;

/**
 * Pages whose text contains this title, searched only past the TOC itself.
 *
 * `headingOnly` restricts a match to the top of a page. It is used for titles
 * that cannot identify a chapter by themselves — ones too short to be
 * distinctive, and ones the book reuses for many chapters. "Brooke" as a
 * free-text search matches 247 of 500 pages, because she is the narrator and
 * her name is all over the prose; as a heading search it matches the twenty-five
 * pages that actually open her chapters.
 *
 * Takes pre-normalized pages: the same page was previously re-normalized once
 * per chapter per pass, which on a fifty-chapter, five-hundred-page book is
 * fifty thousand full-page regex rewrites.
 */
function findTitlePages(
  title: string,
  normalizedPages: string[],
  searchFrom: number,
  headingOnly = false
): number[] {
  const needle = normalizeForMatch(title);
  if (!needle) return [];
  const hits: number[] = [];
  for (let i = searchFrom; i < normalizedPages.length; i++) {
    const at = normalizedPages[i].indexOf(needle);
    if (at === -1) continue;
    if (headingOnly && at > TITLE_HEADING_WINDOW) continue;
    hits.push(i + 1); // 1-based
  }
  return hits;
}

/**
 * Titles that cannot single out a chapter on their own.
 *
 * Two ways that happens: the title is too short to be distinctive, or the book
 * uses it for more than one chapter. A book alternating "Brooke" and "Seth"
 * across forty-nine chapters is both at once — there is no title-level
 * information to tell chapter 3 from chapter 47, so position has to carry it.
 */
function ambiguousTitles(chapters: TocChapter[]): Set<string> {
  const uses = new Map<string, number>();
  for (const ch of chapters) {
    const k = normalizeForMatch(ch.title);
    uses.set(k, (uses.get(k) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [k, n] of uses) {
    if (n > 1 || k.length < MIN_DISTINCTIVE_TITLE_LEN) out.add(k);
  }
  return out;
}

/**
 * The constant gap between printed page numbers and PDF page indices.
 *
 * Taken as the most common gap across as many chapters as resolve cleanly
 * rather than from the first chapter alone — one title that happens to also
 * appear in a foreword, or a chapter whose heading is set as an image, would
 * otherwise fix the whole book to a wrong offset.
 */
function deriveOffset(
  chapters: TocChapter[],
  normalizedPages: string[],
  searchFrom: number,
  ambiguous: Set<string>
): { offset: number; agreement: number } | null {
  const votes = new Map<number, number>();

  for (const ch of chapters) {
    const headingOnly = ambiguous.has(normalizeForMatch(ch.title));
    for (const pdfPage of findTitlePages(ch.title, normalizedPages, searchFrom, headingOnly)) {
      const candidate = pdfPage - ch.printedPage;
      if (candidate < 0) continue; // body can't precede its own printed number
      votes.set(candidate, (votes.get(candidate) ?? 0) + 1);
    }
  }

  if (!votes.size) return null;

  let offset = 0;
  let best = 0;
  for (const [value, count] of votes) {
    if (count > best) { best = count; offset = value; }
  }

  return { offset, agreement: best / chapters.length };
}

export interface TocResolution {
  chapters: TocChapter[];
  offset: number;
  agreement: number;
  unconfirmed: TocChapter[];
}

/**
 * Resolve TOC entries to PDF pages and confirm each one against the body.
 *
 * Confirmation is the whole point of preferring the TOC: a chapter whose title
 * cannot be found near its computed page means the offset is wrong for that
 * chapter, and storing its text anyway would file the wrong pages under the
 * right title — the one failure mode a narrator cannot catch by reading, since
 * the text is real prose, just not this chapter's.
 */
function resolveToc(
  rawEntries: RawTocEntry[],
  pageTexts: string[],
  lastTocPage: number
): TocResolution | null {
  const chapters = extractPovFromTitles(rawEntries);
  const searchFrom = lastTocPage + 1;

  // Normalize each page once. This was previously redone per chapter per pass.
  const normalizedPages = pageTexts.map(normalizeForMatch);
  const ambiguous = ambiguousTitles(chapters);
  if (ambiguous.size) {
    console.log(
      `${TAG} ${ambiguous.size} title(s) cannot identify a chapter alone ` +
        `(${[...ambiguous].slice(0, 4).join(", ")}) — matching those as headings only`
    );
  }

  const derived = deriveOffset(chapters, normalizedPages, searchFrom, ambiguous);
  if (!derived) return null;

  // Chapters are resolved in reading order, and a chapter may never be placed
  // at or before the one before it.
  //
  // Without that, each chapter is matched independently, and a book whose
  // chapters are titled only "Brooke" and "Seth" has no title-level information
  // to tell its third chapter from its forty-seventh — every sighting of a name
  // is a candidate for every chapter bearing it. Independent matching then
  // picks whichever happens to be nearest the arithmetic guess, which can sit
  // behind the previous chapter's start and produce a negative-length chapter
  // or duplicated text. Reading order is the one thing about a book that is
  // never in doubt, so it is enforced rather than hoped for.
  const unconfirmed: TocChapter[] = [];
  let floor = searchFrom; // 1-based; nothing may start at or before this

  for (const ch of chapters) {
    const expected = ch.printedPage + derived.offset;
    const headingOnly = ambiguous.has(normalizeForMatch(ch.title));
    const hits = findTitlePages(ch.title, normalizedPages, searchFrom, headingOnly);

    // Closest sighting, not the first one within tolerance. A chapter can
    // share its title with the book — the final chapter often does — and the
    // book title is also the running header on every page, so such a title
    // matches almost everywhere. Taking the first hit inside the window then
    // lands at the earliest edge of it, starting the chapter a page or two
    // early and swallowing the end of the chapter before it. That still counts
    // as "confirmed", so the check passes while the boundary is wrong.
    let near: number | null = null;
    for (const h of hits) {
      if (h <= floor) continue; // would place this chapter inside an earlier one
      if (near === null || Math.abs(h - expected) < Math.abs(near - expected)) near = h;
    }

    ch.foundOnPdfPage = near;
    if (near !== null && Math.abs(near - expected) <= PAGE_MATCH_TOLERANCE) {
      ch.pdfPage = near; // trust the sighting over the arithmetic
    } else {
      ch.pdfPage = Math.max(expected, floor + 1); // arithmetic, but still after the last one
      unconfirmed.push(ch);
    }
    floor = ch.pdfPage;
  }

  return { chapters, offset: derived.offset, agreement: derived.agreement, unconfirmed };
}

// ─── Chapter numbering + text assembly ─────────────────────────────────────────

export interface ParsedChapter {
  number: number | null;
  title: string;
  povCharacter: string | null;
  wordCount: number;
  rawText: string;
}

/**
 * Reconstruct paragraph breaks from a flat run of lines spanning one or more
 * PDF pages (a chapter can start mid-page and continue past a page boundary,
 * so this always operates on a chapter's full line run, never a single page
 * in isolation — otherwise every page boundary would wrongly read as a
 * paragraph break).
 *
 * PDFs carry no paragraph markers, only glyph positions, so this infers
 * breaks from first-line indentation: the most common line-start x-position
 * on the page is treated as the body's left margin, and any line starting
 * noticeably to the right of it (a first-line indent) is treated as the start
 * of a new paragraph. Lines at the margin are treated as wraps of the
 * paragraph in progress and joined with a space.
 */
function assembleParagraphs(lines: PdfLine[]): string {
  if (!lines.length) return "";

  // Body margin = the most common indent bucket among this run's lines.
  // 2pt buckets absorb the sub-pixel jitter PDF glyph positions have even
  // when visually left-aligned.
  const counts = new Map<number, number>();
  for (const l of lines) {
    const bucket = Math.round(l.indent / 2) * 2;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  // Ties favor the smaller (leftmost) bucket: a first-line indent is by
  // definition to the right of the body margin, never left of it, so on a
  // tie the smaller value is the safer read of where the margin actually is
  // (matters most in dialogue-heavy chapters, where indented paragraph-starts
  // can approach or exceed the wrap-line count).
  let bodyMargin = lines[0].indent;
  let bestCount = 0;
  for (const [bucket, count] of counts) {
    if (count > bestCount || (count === bestCount && bucket < bodyMargin)) {
      bestCount = count;
      bodyMargin = bucket;
    }
  }

  // A first-line indent is a few characters' worth of space — comfortably
  // above the jitter margin, well below "this is a whole separate column".
  const INDENT_THRESHOLD = 6;

  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    const isIndented = line.indent > bodyMargin + INDENT_THRESHOLD;
    if ((line.forceBreak || isIndented) && current) {
      paragraphs.push(current.trim());
      current = line.text;
    } else if (!current) {
      current = line.text;
    } else {
      // Justified text breaks words across lines with a trailing hyphen. Left
      // in place it survives into raw_text as "acknowl- edge", which corrupts
      // word counts, dialogue offsets, and anything read aloud from it. A
      // hyphen at end-of-line followed by a lowercase continuation is a broken
      // word, so the hyphen is dropped and the halves closed up.
      //
      // This does silently damage a genuine compound that happens to wrap at
      // its own hyphen ("moon-lily" → "moonlily"). That is unavoidable without
      // a dictionary — the two cases are textually identical — and it is far
      // rarer than line-break hyphenation, which occurs on most pages.
      const brokenWord = /\w-$/.test(current) && /^[a-z]/.test(line.text);
      current = brokenWord
        ? `${current.slice(0, -1)}${line.text}`
        : `${current} ${line.text}`;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  return paragraphs.join("\n\n");
}

/**
 * PDFs of this genre commonly print the POV character's name as a standalone
 * heading directly under the chapter number, with no reliable typographic
 * distinction (font size/weight) from body text to detect it by — but since
 * povCharacter is already known (from Claude, on the fallback path), any
 * paragraph consisting of exactly that name, or starting with "{name} ", is
 * unambiguously the heading bleeding into raw_text rather than real prose
 * (no line of actual narration starts with a bare name followed by a space
 * before continuing about someone else). A single leading numeric paragraph
 * (the printed chapter number) is skipped over, not removed — only the POV
 * heading is being stripped here.
 */
function stripLeadingPovHeading(
  rawText: string,
  povCharacter: string | null,
  title?: string
): string {
  const paragraphs = rawText.split("\n\n");

  // Drop the printed chapter number and the typeset chapter title from the
  // head of the text. Both duplicate what is already in the title column, and
  // leaving them in means the first thing read off a chapter is a line of
  // capitals rather than its opening sentence. This runs whether or not a POV
  // is known, since the heading is there either way. The guard never lets the
  // loop consume the final paragraph, so a chapter cannot be emptied.
  //
  // The chapter's own title is matched as well as the all-caps shape, because
  // a heading set in title case — "Chapter One" — has lowercase letters in it
  // and so never looked like a heading at all, which left it sitting in the
  // prose of every chapter of any book that titles them that way.
  const titleKey = title ? normalizeForMatch(title) : "";
  const isHeading = (p: string) =>
    isChapterHeadingLine(p) || (titleKey.length >= 3 && normalizeForMatch(p) === titleKey);

  let idx = 0;
  while (idx < paragraphs.length - 1 && isHeading(paragraphs[idx])) idx++;
  if (idx > 0) paragraphs.splice(0, idx);

  const name = povCharacter?.trim();
  if (name && paragraphs.length > 1) {
    // Compared with its decoration removed, because the name reaching here has
    // already had its own stripped. The layout prints "-Mia-" and the roster
    // holds "Mia"; matched literally the heading no longer looks like the POV
    // name and stays in the prose, so every chapter opens by announcing its own
    // narrator.
    const bare = (s: string) => s.replace(NAME_DECORATION, "").trim();
    const first = paragraphs[0] ?? "";

    if (bare(first) === name) {
      paragraphs.splice(0, 1);
    } else if (/^[\s\-–—_*~•·]/.test(first)) {
      // "-Mia- My Trip to the Underworld" — the heading kept its decoration and
      // ran into the subtitle. Only entered when decoration is actually present,
      // so ordinary prose can never reach it.
      const lead = first.match(/^[\s\-–—_*~•·]*([^\s\-–—_*~•·][^\n]*?)[\s\-–—_*~•·]+/);
      if (lead && lead[1] === name) paragraphs[0] = first.slice(lead[0].length).trim();
    } else if (first.startsWith(`${name} `) && /^[A-Z"“']/.test(first.slice(name.length + 1))) {
      // An undecorated heading fused with the body: "Mia The path was rough."
      //
      // The capital is what makes this safe. A narrator's name is also an
      // ordinary word in her own chapter, and "Mia had never seen the river"
      // opens a great many of them — stripping there costs a word of real prose
      // and shifts every dialogue offset after it, which is far worse than
      // leaving a heading in view. Nothing in English continues a sentence with
      // a capitalised verb, so requiring one separates the two cases.
      paragraphs[0] = first.slice(name.length + 1);
    }
    if (!paragraphs[0]?.trim()) paragraphs.splice(0, 1);
  }

  return paragraphs.join("\n\n");
}

/**
 * Turns raw {title, startPage} boundaries (from the TOC parser or Claude) into
 * final chapters — assigns sequential numbers (front/back matter stays
 * unnumbered) and reconstructs each chapter's raw_text, paragraphs included,
 * from linePages[start, end). linePages must already be header/footer-stripped.
 */
/**
 * Where a chapter actually begins within its opening page.
 *
 * A chapter starts partway down a page: the page carrying its heading also
 * carries the closing paragraphs of the chapter before it. Taking the whole
 * page files that trailing prose under the wrong chapter, which splits a
 * sentence across the boundary and hands a narrator the previous chapter's
 * ending as this chapter's opening.
 *
 * Returns the index of the heading line, backed up over any printed chapter
 * number sitting above it, or 0 if the heading can't be located.
 */
function findChapterStartLine(lines: PdfLine[], title: string): number {
  const needle = normalizeForMatch(title);
  if (!needle || !lines.length) return 0;

  let hit = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = normalizeForMatch(lines[i].text);
    if (!t) continue;
    // Either direction: the heading may carry more than the TOC title (a POV
    // suffix) or less (the title broken across two lines).
    if (t.includes(needle) || (t.length >= 6 && needle.includes(t))) {
      hit = i;
      break;
    }
  }
  if (hit === -1) return 0;

  let start = hit;
  while (start > 0 && isChapterHeadingLine(lines[start - 1].text)) start--;
  return start;
}

function assignChaptersFromLines(
  raw: Array<{ title: string; startPage: number; povCharacter?: string | null; startLine?: number }>,
  linePages: PdfLine[][]
): ParsedChapter[] {
  const totalPages = linePages.length;

  // Resolve every chapter to a precise (page, line) start first, so each
  // chapter can end exactly where the next one begins rather than at the last
  // page boundary before it.
  //
  // A caller that already knows the line — typographic detection, which found
  // the heading itself rather than inferring the page from a TOC — passes it,
  // and it is used as given. Searching for the title again would be strictly
  // worse: the heading may not read as its own title once extracted, and a
  // failed search silently falls back to the top of the page.
  const starts = raw.map((ch) => {
    const page = Math.max(0, Math.min(totalPages - 1, ch.startPage - 1));
    return {
      page,
      line: ch.startLine ?? findChapterStartLine(linePages[page] ?? [], ch.title),
    };
  });

  const numbers = computeChapterNumbers(raw.map((ch) => ch.title));

  return raw.map((ch, i) => {
    const start = starts[i];
    const end = i + 1 < raw.length ? starts[i + 1] : { page: totalPages, line: 0 };

    const lines: PdfLine[] = [];
    for (let p = start.page; p <= Math.min(end.page, totalPages - 1); p++) {
      const pageLines = linePages[p] ?? [];
      const from = p === start.page ? start.line : 0;
      const to = p === end.page ? end.line : pageLines.length;
      if (to > from) lines.push(...pageLines.slice(from, to));
    }

    const povCharacter = ch.povCharacter ?? null;
    const rawText = stripLeadingPovHeading(assembleParagraphs(lines), povCharacter, ch.title);
    const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
    return { number: numbers[i], title: ch.title, povCharacter, wordCount, rawText };
  });
}

/**
 * Same role as assignChaptersFromLines but for plain page-text slices (used
 * only by the docx pseudo-pages Claude fallback, which has no line/indent
 * data to reconstruct paragraphs from — see the known-gap note in
 * processDocx above). Joins page slices with a paragraph break at page
 * boundaries only.
 */
function assignChaptersFromPages(
  raw: Array<{ title: string; startPage: number; povCharacter?: string | null }>,
  pageTexts: string[]
): ParsedChapter[] {
  const totalPages = pageTexts.length;
  const numbers = computeChapterNumbers(raw.map((ch) => ch.title));

  return raw.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end =
      i + 1 < raw.length
        ? Math.max(start + 1, raw[i + 1].startPage - 1)
        : totalPages;
    const povCharacter = ch.povCharacter ?? null;
    const rawText = stripLeadingPovHeading(
      pageTexts.slice(start, end).join("\n\n").trim(),
      povCharacter,
      ch.title
    );
    const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
    return { number: numbers[i], title: ch.title, povCharacter, wordCount, rawText };
  });
}

/**
 * A chapter's raw_text has no upper bound from either assignment function
 * above — the last entry in any TOC- or Claude-derived list runs to literal
 * end-of-document, because there is no "next chapter" left to stop it at
 * (assignChaptersFromLines line ~1516, assignChaptersFromPages line ~1550).
 * If detection under-counted the true chapter list — a TOC row for the real
 * final chapter never extracted, say — the last entry silently absorbs
 * everything after it: every remaining chapter, any back matter, all of it,
 * into one giant chapter that reads as a normal parse succeeding.
 *
 * Nothing about that failure looks wrong from the outside: chapters.length
 * matches what was detected, every earlier chapter is correctly sized, and
 * the oversized one still has a real title and starts in a real place. Size
 * is the only signal, which is why this checks it explicitly rather than
 * trusting the boundary logic to have caught its own mistake — and why it
 * has to run after assignment rather than during it, once every chapter's
 * wordCount actually exists to compare.
 *
 * Thresholds are relative to this book's own median chapter, not a fixed
 * word count, because "how long is normal" varies by an order of magnitude
 * between titles — but never below an absolute floor, so a short-chapter
 * book doesn't get flagged over an outlier that is still objectively small.
 */
const CHAPTER_SIZE_WARN_MULTIPLE = 4;
const CHAPTER_SIZE_WARN_FLOOR = 8_000;
const CHAPTER_SIZE_FAIL_MULTIPLE = 8;
const CHAPTER_SIZE_FAIL_FLOOR = 20_000;

/**
 * Trailing scene-break ornament — asterisks, bullets, a centerd rule.
 *
 * Deliberately excludes dashes and quotation marks: a chapter that ends on
 * interrupted dialogue ("But I—") ends legitimately, and stripping those would
 * make it look like a chapter cut in half.
 */
const SCENE_BREAK_TAIL = /[\s*#~•·]+$/;

/** A chapter ends where a sentence ends — including on an interruption. */
function endsCleanly(text: string): boolean {
  return /[.!?…—–][)\]"'”’»]*$/.test(text.replace(SCENE_BREAK_TAIL, "").trimEnd());
}

/**
 * Merge back any "chapter" that is really the tail of the one before it.
 *
 * findChapterStartLine looks for the chapter's heading on its claimed opening
 * page and, finding none, returns line 0 — the top of the page. That is the
 * right default when a heading is merely unrecognizable. It is badly wrong when
 * the page never was a chapter opening, because the section then starts
 * wherever the previous page happened to break, which is usually mid-sentence.
 *
 * Body-text detection produces exactly that: asked which pages begin a section,
 * it can nominate a page in the middle of a chapter, and nothing downstream
 * disagrees. On "Swing and a Kiss" this split one chapter across the phrase
 * "approaching my / complex", and because the detector numbers sections
 * sequentially as it goes, the result read as a clean 36-chapter book rather
 * than a 34-chapter one with two chapters cut in half.
 *
 * Two independent proofs that a boundary is false, either sufficient:
 *
 *   - the previous chapter does not end a sentence — a real chapter always
 *     does, so its ending has been taken by whatever follows;
 *   - this chapter opens on a lowercase letter, which no chapter does.
 *
 * The merge is reported, not silent: a boundary the parser had to repair is
 * worth someone's eye on it.
 *
 * It also refuses to run away with the book. Merging is a local repair to a
 * few bad boundaries; if most boundaries look bad, the premise is wrong and
 * the evidence is measuring something else. "Devils of Seattle" is the case:
 * its running headers and page numbers extract as mojibake ("FE3I4Y Dj
 * YEATT4E", "LC"), header stripping cannot recognize them because the
 * corruption differs page to page, so every section ends on a fragment with no
 * terminal punctuation. Every boundary looked broken, each merge extended the
 * tail with more of the same, and a 395-page novel was stored as one 94,000-word
 * chapter called "Copyright" — which reads as a successful import.
 */
const MERGE_SYSTEMIC_RATIO = 1 / 3;

function mergeContinuationChapters(
  chapters: ParsedChapter[]
): { chapters: ParsedChapter[]; warnings: string[] } {
  if (chapters.length < 2) return { chapters, warnings: [] };

  const merged: ParsedChapter[] = [];
  const repaired: string[] = [];

  for (const ch of chapters) {
    const prev = merged[merged.length - 1];
    const brokenTail = prev && prev.rawText.trim() && !endsCleanly(prev.rawText);
    const brokenHead = /^[a-z]/.test(ch.rawText.trimStart());

    if (prev && ch.rawText.trim() && (brokenTail || brokenHead)) {
      // Joined with a space, not a paragraph break: this is one sentence that
      // was cut, so re-forming the paragraph is the whole point.
      prev.rawText = `${prev.rawText.trimEnd()} ${ch.rawText.trimStart()}`;
      prev.wordCount = prev.rawText.split(/\s+/).filter(Boolean).length;
      repaired.push(ch.title);
      continue;
    }
    merged.push({ ...ch });
  }

  // Too many repairs is not a book that needed repairing. Four is the smallest
  // count where a third is meaningful rather than an artefact of a short list.
  if (chapters.length >= 4 && repaired.length > chapters.length * MERGE_SYSTEMIC_RATIO) {
    console.log(
      `${TAG} merge abandoned — ${repaired.length} of ${chapters.length} boundaries looked broken`
    );
    return {
      chapters,
      warnings: [
        `${repaired.length} of ${chapters.length} detected sections looked like they began ` +
          `mid-sentence, so the boundaries were left alone rather than merged — that many at ` +
          `once means the text itself is unreliable, not the boundaries. This usually means a ` +
          `corrupt text layer: headings, running headers and page numbers extract as gibberish, ` +
          `so every section appears to end mid-sentence. The chapter splits below are unlikely ` +
          `to be right. A cleaner source file (EPUB, DOCX, or a PDF with a working text layer) ` +
          `would import properly.`,
      ],
    };
  }

  if (repaired.length) {
    // Numbering is assigned before this runs, so it has to be redone — leaving
    // it would skip the numbers of the sections that no longer exist.
    const numbers = computeChapterNumbers(merged.map((c) => c.title));
    merged.forEach((c, i) => { c.number = numbers[i]; });

    const named = repaired.slice(0, 5).map((t) => `"${t}"`).join(", ");
    const more = repaired.length > 5 ? ` (+${repaired.length - 5} more)` : "";
    const plural = repaired.length === 1 ? "" : "s";
    warnRepairedBoundaries(repaired.length, chapters.length);
    return {
      chapters: merged,
      warnings: [
        `${repaired.length} detected chapter${plural} began mid-sentence and ${
          repaired.length === 1 ? "was" : "were"
        } merged into the chapter before ${repaired.length === 1 ? "it" : "them"} — ` +
          `the detector split a real chapter. Merged: ${named}${more}. Worth checking those joins.`,
      ],
    };
  }

  return { chapters: merged, warnings: [] };
}

function warnRepairedBoundaries(count: number, before: number): void {
  console.log(`${TAG} merged ${count} mid-sentence chapter start(s); ${before} → ${before - count} sections`);
}

function validateChapterSizes(chapters: ParsedChapter[]): string[] {
  const counts = chapters.map((c) => c.wordCount).filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length < 3) return []; // too few chapters for "median" to mean anything

  const median = counts[Math.floor(counts.length / 2)];
  const warnThreshold = Math.max(median * CHAPTER_SIZE_WARN_MULTIPLE, CHAPTER_SIZE_WARN_FLOOR);
  const failThreshold = Math.max(median * CHAPTER_SIZE_FAIL_MULTIPLE, CHAPTER_SIZE_FAIL_FLOOR);

  const offenders = chapters.filter((c) => c.wordCount >= failThreshold);
  if (offenders.length) {
    const named = offenders.map((c) => `"${c.title}" (${c.wordCount.toLocaleString()} words)`).join(", ");
    throw new Error(
      `${offenders.length === 1 ? "A chapter is" : `${offenders.length} chapters are`} implausibly large ` +
        `relative to this book's ${median.toLocaleString()}-word median chapter — ${named}. This is almost ` +
        `always a missed chapter boundary (a table-of-contents row that was never detected, so the chapter ` +
        `after it absorbed everything to the end of the document) rather than a genuinely long chapter. ` +
        `Refusing to store it.`
    );
  }

  const warnable = chapters.filter((c) => c.wordCount >= warnThreshold);
  if (!warnable.length) return [];
  const named = warnable.map((c) => `"${c.title}" (${c.wordCount.toLocaleString()} words)`).join(", ");
  return [
    `${warnable.length === 1 ? "One chapter is" : `${warnable.length} chapters are`} unusually large next to ` +
      `this book's ${median.toLocaleString()}-word median chapter — worth a quick check: ${named}.`,
  ];
}

// ─── Claude fallback ─────────────────────────────────────────────────────────
// Unchanged from board-pdf-process/route.ts except the prompt/schema now also
// asks for povCharacter — new to this feature, not something the old chapter-
// tracking pipeline needed.

interface ClaudeSection {
  title: string;
  startPage: number;
  povCharacter?: string | null;
}

/** Three-tier resilient JSON parser for Claude responses. */
function parseClaudeJson(raw: string): ClaudeSection[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  // Tier 1 — direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // fall through
  }

  // Tier 2 — sanitise then parse
  const sanitised = sanitiseClaudeJson(cleaned);
  try {
    const parsed = JSON.parse(sanitised);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // fall through
  }

  // Tier 3 — extract individual objects with regex and parse each one
  console.warn("[manuscript-parser] JSON.parse failed after sanitise — falling back to object-level regex");
  console.error("[manuscript-parser] raw Claude response:\n", raw);
  const results: ClaudeSection[] = [];
  const objRe = /\{[^{}]+\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(sanitised)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && typeof obj.startPage === "number" && typeof obj.title === "string") {
        results.push(obj);
      }
    } catch {
      // skip unparseable fragment
    }
  }
  if (results.length) return results;

  console.error("[manuscript-parser] all parse tiers failed. Raw response was:\n", raw);
  throw new Error(`Failed to parse Claude response as JSON. Raw: ${raw.slice(0, 200)}`);
}

function buildPageMap(pageTexts: string[]): string {
  return pageTexts
    .map((text, i) => {
      const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
      return first ? `${i + 1}: ${first}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

async function askClaude(pageMap: string): Promise<Array<{ title: string; startPage: number; povCharacter: string | null }>> {
  console.log(`${TAG} askClaude — page map ${pageMap.length} chars, ${pageMap.split("\n").length} pages`);

  // Bounded, and with retries capped for this call only.
  //
  // The client default of four retries with exponential backoff is right for a
  // transient 429 on a short call. On a five-hundred-page page map it is the
  // difference between failing at thirty seconds with a message and being
  // killed at sixty by the platform, which writes no status at all and leaves
  // the manuscript sitting at "processing" with nothing to explain it.
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    // 1024 was silently truncating mid-array on real books (~30+ sections) —
    // confirmed via stop_reason="max_tokens" against the Ruined test file.
    //
    // A section is roughly 30-45 tokens, so a normal book's whole list is
    // 1,000-2,500 — 4096 was never the real problem, and with the page map now
    // built from header-stripped text it is not close to binding. This is pure
    // margin for an unusually long book, sized against the call timeout rather
    // than the model's limit: at Haiku's output rate, CLAUDE_CALL_TIMEOUT_MS
    // caps a reply near 5,000 tokens no matter what is set here, so a much
    // larger ceiling would be decorative. 8192 covers ~180 sections, which no
    // real manuscript reaches, and keeps a runaway from spending four times the
    // tokens before the truncation check below catches it.
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content:
          `Here are the page numbers and first line of text from each page of a manuscript.\n\n${pageMap}\n\n` +
          `Identify which pages begin a trackable section. Include:\n` +
          `- Front matter: Dedication, Preface, Content & Trigger Warnings\n` +
          `- Body chapters: Prologue, Chapter One, Chapter Two, … (all numbered chapters)\n` +
          `- Back matter: Epilogue, Afterword, Acknowledgments, Author's Note\n` +
          `Note: Acknowledgments and Author's Note can appear at the front OR the back of the book — ` +
          `check both ends, don't assume front matter only.\n` +
          `For body chapters, if the chapter reads from a single character's point of view and that ` +
          `character's name is identifiable from the opening lines, include it as "povCharacter". ` +
          `Use null when not identifiable or not applicable (front/back matter).\n` +
          `Return ONLY valid JSON. Use straight double quotes only — no curly quotes, no smart quotes, no em dashes inside JSON strings. Escape any apostrophes in titles as \\u0027 or use a regular hyphen instead.\n` +
          `Format: [{"number":1,"title":"Section Title","startPage":11,"povCharacter":"Jay"}]\n` +
          `No markdown fences. No explanation. Only the JSON array.`,
      },
    ],
  }, { timeout: CLAUDE_CALL_TIMEOUT_MS, maxRetries: 1 });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  console.log(
    `${TAG} askClaude stop_reason=${msg.stop_reason} ` +
      `output_tokens=${msg.usage.output_tokens} raw_len=${raw.length}`
  );

  // A truncated section list is unusable, and it is unusable in the worst
  // possible way: it looks complete.
  //
  // This used to be logged and nothing more. parseClaudeJson repairs a
  // half-written array by design — that resilience is right for a stray
  // trailing comma and wrong here, because it turns "the model ran out of room
  // at page 87 of 336" into a clean-looking list of 87 sections. The last one
  // then absorbs every remaining page, and the book is stored with a chapter
  // twenty times the size of any other and no error anywhere.
  //
  // The list is either complete or it is not a list of the book's chapters.
  if (msg.stop_reason === "max_tokens") {
    throw new Error(
      `Chapter detection was cut off by the output limit after ${msg.usage.output_tokens} tokens. ` +
        `The section list is incomplete, so the remaining pages would all be filed under the last ` +
        `section detected. Refusing to store a truncated chapter list.`
    );
  }

  try {
    const parsed = parseClaudeJson(raw);
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("No chapters found");
    return parsed.map((ch) => ({
      title: cleanTocTitle(ch.title),
      startPage: ch.startPage,
      povCharacter: typeof ch.povCharacter === "string" && ch.povCharacter.trim() ? ch.povCharacter.trim() : null,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Claude chapter parse failed: ${msg}`);
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

/**
 * Stamped on every line this module logs.
 *
 * Deployment state is otherwise invisible from the output: an old parser and a
 * new one both produce chapters, and telling them apart meant comparing
 * character counts against a previous run. Bump this whenever parser behavior
 * changes, so a production log line names the code that produced it.
 *
 * v2 — TOC as primary source, printed-page offset derivation with validation,
 *      POV parsing, ligature/header/drop-cap/hyphen repairs, quality scoring.
 * v4 — validateChapterSizes: refuse a chapter that is implausibly large next
 *      to this book's own median (almost always a missed final TOC entry
 *      silently absorbing the rest of the document), rather than storing it.
 */
export const PARSER_VERSION = "v4";
const TAG = `[parser ${PARSER_VERSION}]`;

/**
 * A quality problem is never fatal here — a partially garbled book still has
 * readable chapters worth keeping, and refusing the parse would leave the user
 * with nothing and no explanation. It is logged loudly instead, with the page
 * indices named, so the failure is attributable to the source file at a glance
 * rather than being rediscovered later by spot-checking.
 */
function logTextQuality(format: string, q: TextQualityReport): void {
  if (!q.suspectPages.length) {
    console.log(
      `${TAG} ${format} text quality OK — median common-word ratio ${q.median.toFixed(3)}`
    );
    return;
  }
  const sample = q.suspectPages.slice(0, 20).map((i) => i + 1).join(", ");
  const more = q.suspectPages.length > 20 ? ` …and ${q.suspectPages.length - 20} more` : "";
  console.warn(
    `${TAG} ${format} text quality SUSPECT — ` +
      `${q.suspectPages.length} of ${q.pageRatios.filter((r) => r !== null).length} judgeable pages ` +
      `(${(q.suspectRatio * 100).toFixed(1)}%) scored below ${q.threshold.toFixed(3)} ` +
      `(document median ${q.median.toFixed(3)}). Likely a corrupt text layer needing OCR. ` +
      `Pages: ${sample}${more}`
  );
}

/**
 * Split a plain-text page into paragraphs. Blank lines and leading indentation
 * are the only reliable paragraph signals in a text file; every other newline
 * is treated as a hard wrap and closed up (with the same broken-word hyphen
 * handling the PDF path uses).
 *
 * Limitation worth knowing: a source that separates paragraphs with a single
 * newline and no indentation will come through as one merged paragraph. That
 * is the deliberate direction to fail in — merged paragraphs are still correct
 * text that a later pass can re-split, whereas guessing breaks from sentence
 * punctuation shreds any paragraph containing more than one sentence.
 */
function assembleTextParagraphs(lines: PdfLine[]): string {
  const paragraphs: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) paragraphs.push(current.trim());
    current = "";
  };

  for (const line of lines) {
    if (!line.text.trim()) { flush(); continue; }
    // Two columns of leading whitespace is a first-line indent. Unlike the PDF
    // path there is no glyph jitter to vote a body margin out of, so the
    // character count is taken at face value.
    if (line.forceBreak || line.indent >= 2) { flush(); current = line.text; continue; }
    if (!current) { current = line.text; continue; }
    const brokenWord = /\w-$/.test(current) && /^[a-z]/.test(line.text);
    current = brokenWord ? `${current.slice(0, -1)}${line.text}` : `${current} ${line.text}`;
  }
  flush();

  return paragraphs.join("\n\n");
}

/**
 * A plain-text page as lines, in the same shape the PDF cleaners consume.
 *
 * Blank lines are kept as empty entries rather than dropped: they are the
 * primary paragraph signal in a text file, and the header stripper addresses
 * lines by index, so removing them here would both lose the breaks and shift
 * every index out from under it.
 */
function toTextLines(pageText: string): PdfLine[] {
  return pageText.split("\n").map((raw) => {
    const expanded = raw.replace(/\t/g, "    ");
    return { text: expanded.trim(), indent: expanded.length - expanded.trimStart().length };
  });
}

// ─── Stage tracing and the parse budget ──────────────────────────────────────

/**
 * How long a parse may take before it gives up and says so.
 *
 * Sized to fit inside the route's own 60s maxDuration with room to write a
 * status. That margin is the entire point: when the platform kills an
 * invocation for running long, no code of ours gets to run afterwards, so
 * nothing marks the manuscript failed and it sits at "processing" forever with
 * no error anywhere. A book that stops with a message naming the stage it died
 * in is recoverable; one that stops silently is not.
 *
 * Checked between stages, so it catches a parse that is slow overall. A stage
 * that hangs internally is caught by the route's own timeout instead — the two
 * are complementary, not redundant.
 */
export const PARSE_BUDGET_MS = 45_000;

/** How long the chapter-detection model call may take, retries included. */
const CLAUDE_CALL_TIMEOUT_MS = 25_000;

/**
 * Per-stage timing, logged as the parse runs rather than summarized at the end.
 *
 * A parse that dies partway leaves no summary, so a log that only prints on
 * success tells you nothing about the run that actually needs explaining. This
 * prints as each stage completes, which means the last line in the log names
 * the stage that did not finish.
 */
function makeTrace(label: string, budgetMs = PARSE_BUDGET_MS) {
  const start = Date.now();
  let last = start;

  return {
    /** Record a completed stage, then fail if the budget is already spent. */
    stage(name: string, detail = "") {
      const now = Date.now();
      console.log(
        `${TAG} ${label} · ${name}${detail ? ` — ${detail}` : ""} ` +
          `(+${now - last}ms, ${now - start}ms total)`
      );
      last = now;

      const elapsed = now - start;
      if (elapsed > budgetMs) {
        throw new Error(
          `Parse exceeded its ${Math.round(budgetMs / 1000)}s budget — reached "${name}" ` +
            `after ${(elapsed / 1000).toFixed(1)}s and stopped. The document is likely far ` +
            `larger or more damaged than the pipeline can handle in one pass.`
        );
      }
    },
    elapsed: () => Date.now() - start,
  };
}

export async function parseManuscript(
  buffer: Buffer
): Promise<{
  format: "pdf" | "docx" | "txt";
  chapters: ParsedChapter[];
  quality?: TextQualityReport;
  /** POV names read off the TOC, for seeding extraction's character roster. */
  povRoster?: string[];
  /** Non-fatal problems worth showing on the manuscript row. */
  warnings?: string[];
}> {
  const fileType = detectFileType(new Uint8Array(buffer));

  // First line out of the parser, deliberately: it names the running code
  // before anything can fail, so a log with no v2 line is proof the old build
  // is still serving rather than proof the new one misbehaved.
  console.log(`${TAG} parseManuscript start — detected ${fileType}, ${buffer.length} bytes`);

  // ── Plain-text path ────────────────────────────────────────────────────────
  // Pages come from form feeds (\f) when present — the convention for a text
  // file that came out of a page-oriented source and needs its page boundaries
  // preserved so TOC page numbers still resolve. Without them the whole file is
  // one page and chapter detection falls to Claude.
  if (fileType === "txt") {
    const trace = makeTrace("txt");
    const txtWarnings: string[] = [];

    const decoded = normalizeExtractedText(
      buffer.toString("utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n")
    );
    const rawPages = decoded.split("\f");
    if (!rawPages.some((p) => p.trim())) throw new Error("Could not extract any text from file");
    trace.stage("decode", `${rawPages.length} pages, ${decoded.length} chars`);

    // Quality is read off the untouched text, before anything is stripped from
    // it, for the same reason as the PDF path — the point is to describe the
    // source, not the parser's clean-up of it.
    const quality = assessTextQuality(rawPages);
    logTextQuality("txt", quality);
    trace.stage("quality", `${(quality.suspectRatio * 100).toFixed(0)}% suspect`);

    // Same pipeline as the PDF path, and in the same order — headers before
    // drop caps, so a stripped running header can't sit between a drop cap and
    // its continuation and prevent the join.
    //
    // A recovered manuscript is not a lesser input than a PDF: it carries the
    // identical running headers, folios and drop caps, because it came off the
    // same printed pages. Handing it a thinner pipeline just moved every one of
    // those defects into the stored text, where they read as parser bugs.
    const txtLinePages = stripHeadersFooters(rawPages.map(toTextLines))
      .map(joinDropCaps)
      .map(joinFragmentDropCaps);
    trace.stage("clean");
    const pages = txtLinePages.map(assembleTextParagraphs);
    trace.stage("assemble");

    // Same resolution path as the PDF branch: a plaintext manuscript recovered
    // from OCR still carries printed page numbers in its TOC, so its entries
    // need the same POV parsing, offset derivation and confirmation rather
    // than being trusted as PDF indices.
    //
    // Both work in the same units — a position in the page array — so nothing
    // here assumes PDF page indices. What the text path does lack is the PDF
    // path's line-level resolution: a chapter starting mid-page is rounded to
    // the page boundary, because a text file carries no glyph positions to
    // locate the heading within the page. See assignChaptersFromPages.
    const txtToc = parseTocFromPages(pages);
    trace.stage("toc", txtToc ? `${txtToc.entries.length} entries` : "none found");

    const txtResolved = txtToc
      ? resolveToc(
          txtToc.entries.map((e) => ({ rawTitle: e.title, printedPage: e.startPage })),
          pages,
          txtToc.lastTocPage
        )
      : null;
    if (txtToc) {
      trace.stage(
        "resolve",
        txtResolved
          ? `offset ${txtResolved.offset >= 0 ? "+" : ""}${txtResolved.offset}, ` +
              `${(txtResolved.agreement * 100).toFixed(0)}% agreement, ` +
              `${txtResolved.unconfirmed.length} unconfirmed`
          : "no offset could be derived"
      );
    }

    let rawSections: Array<{ title: string; startPage: number; povCharacter: string | null }>;
    let txtPovRoster: string[] = [];

    if (txtResolved) {
      // Same tolerance policy as the PDF path rather than all-or-nothing. The
      // text path used to reject a book over a single unconfirmed chapter,
      // which on a fifty-chapter book is a 2% doubt thrown away entirely.
      const { unconfirmed, chapters: tocChapters, offset } = txtResolved;
      if (unconfirmed.length) {
        const named = unconfirmed.slice(0, 5).map((c) => `"${c.rawTitle}"`).join(", ");
        const more = unconfirmed.length > 5 ? ` (+${unconfirmed.length - 5} more)` : "";
        const detail =
          `${unconfirmed.length} of ${tocChapters.length} chapter titles were not found near their ` +
          `computed start page using offset ${offset >= 0 ? "+" : ""}${offset}. Unconfirmed: ${named}${more}`;

        const tolerable =
          unconfirmed.length / tocChapters.length <= MAX_UNCONFIRMED_FRACTION &&
          unconfirmed.length <= MAX_UNCONFIRMED_ABSOLUTE;

        if (!tolerable) {
          throw new Error(`TOC validation failed: ${detail} Refusing to store possibly misaligned chapter text.`);
        }

        const plural = unconfirmed.length === 1 ? "" : "s";
        txtWarnings.push(
          `${unconfirmed.length} chapter${plural} could not be confirmed against the body and ` +
            `${unconfirmed.length === 1 ? "was" : "were"} placed by offset arithmetic — worth checking ` +
            `${unconfirmed.length === 1 ? "its" : "their"} first page. ${detail}`
        );
      }

      rawSections = tocChapters.map((c) => ({
        title: c.rawTitle,
        startPage: c.pdfPage,
        povCharacter: c.povCharacter,
      }));
      txtPovRoster = Array.from(new Set(tocChapters.flatMap((c) => c.povNames)));
    } else {
      rawSections = await askClaude(buildPageMap(pages));
      trace.stage("claude-fallback", `${rawSections.length} sections`);
    }

    const assigned = assignChaptersFromPages(rawSections, pages);
    // As on the PDF path: repair guessed boundaries only, never ones the book
    // stated itself.
    const { chapters, warnings: mergeWarnings } = txtResolved
      ? { chapters: assigned, warnings: [] as string[] }
      : mergeContinuationChapters(assigned);
    trace.stage("assign", `${chapters.length} chapters`);
    txtWarnings.push(...mergeWarnings, ...validateChapterSizes(chapters));
    console.log(`${TAG} txt parse complete in ${trace.elapsed()}ms`);

    return {
      format: "txt",
      chapters,
      quality,
      povRoster: txtPovRoster,
      warnings: txtWarnings,
    };
  }

  // ── DOCX path ──────────────────────────────────────────────────────────────
  if (fileType === "docx") {
    const docx = await processDocx(buffer);

    if (docx.kind === "headings") {
      const numbers = computeChapterNumbers(docx.sections.map((s) => s.title));
      const chapters: ParsedChapter[] = docx.sections.map((s, i) => ({
        number: numbers[i],
        title: s.title,
        povCharacter: null,
        wordCount: s.wordCount,
        rawText: s.rawText,
      }));
      const docxWarnings = validateChapterSizes(chapters);
      return { format: "docx", chapters, warnings: docxWarnings.length ? docxWarnings : undefined };
    }

    // Fallback: pseudo-pages → Claude (unformatted docx without heading styles)
    const pageMap = buildPageMap(docx.pages);
    if (!pageMap) throw new Error("Could not extract any text from document");
    const rawSections = await askClaude(pageMap);
    const assigned = assignChaptersFromPages(rawSections, docx.pages);
    const { chapters, warnings: mergeWarnings } = mergeContinuationChapters(assigned);
    const fallbackWarnings = [...mergeWarnings, ...validateChapterSizes(chapters)];
    return { format: "docx", chapters, warnings: fallbackWarnings.length ? fallbackWarnings : undefined };
  }

  // ── PDF path ───────────────────────────────────────────────────────────────
  if (fileType !== "pdf") throw new Error("Unsupported file type");

  const { flatPages, linePages } = await extractPagesFromPdf(buffer);
  if (!flatPages.length) throw new Error("Could not extract any text from PDF");

  // Quality is assessed before anything is built on top of the text. A PDF with
  // a corrupt font map extracts without error and parses without error — the
  // failure only becomes visible when someone reads the output, and by then it
  // looks like a parser bug rather than a source-file problem.
  const quality = assessTextQuality(flatPages);
  logTextQuality("pdf", quality);

  // Order matters here: headers have to go before drop caps, or a stripped
  // header line sitting between a drop cap and its continuation leaves the two
  // non-adjacent and the join never fires.
  const cleanedLinePages = stripHeadersFooters(linePages).map(joinDropCaps);

  let rawSections: Array<{
    title: string;
    startPage: number;
    povCharacter: string | null;
    startLine?: number;
  }>;
  let povRoster: string[] = [];
  /** True only when boundaries came from body-text inference rather than the page. */
  let boundariesInferred = false;
  // Non-fatal problems worth surfacing on the manuscript row rather than only
  // in a log nobody reads until something has already gone wrong.
  const warnings: string[] = [];

  // ── Primary: the book's own table of contents ────────────────────────────
  //
  // Two extraction shapes, one resolution path. Some TOCs come out as separate
  // title and page-number blocks (true two-column reading order); others come
  // out with the number, title and page fused onto one line, which the flat
  // space-joined text reads cleanly and the line-grouped text does not. Which
  // shape a given PDF produces is not predictable from the layout, so both are
  // attempted and whichever yields entries is fed through the same POV
  // parsing, offset derivation and validation.
  const columnToc = parseTocByColumns(linePages);
  const flatToc = columnToc ? null : parseTocFromPages(flatPages);
  const tocSource =
    columnToc ??
    (flatToc
      ? {
          entries: flatToc.entries.map((e) => ({ rawTitle: e.title, printedPage: e.startPage })),
          lastTocPage: flatToc.lastTocPage,
        }
      : null);

  if (tocSource) {
    console.log(
      `${TAG} TOC source: ${columnToc ? "column-paired" : "flat"}, ` +
        `${tocSource.entries.length} entries, TOC ends p.${tocSource.lastTocPage + 1}`
    );
  }

  // Titles are confirmed against header-stripped text. The running header is
  // the book's title on every page, so searching the raw text makes any
  // chapter sharing that title appear to occur throughout the entire book.
  const cleanedFlatPages = cleanedLinePages.map((lines) => lines.map((l) => l.text).join(" "));

  const resolved = tocSource ? resolveToc(tocSource.entries, cleanedFlatPages, tocSource.lastTocPage) : null;

  if (resolved) {
    const { chapters: tocChapters, offset, agreement, unconfirmed } = resolved;

    const withPov = tocChapters.filter((c) => c.povCharacter).length;
    console.log(
      `${TAG} TOC parsed: ${tocChapters.length} entries, ` +
        `printed→PDF offset ${offset >= 0 ? "+" : ""}${offset}, ` +
        `${(agreement * 100).toFixed(0)}% of titles agreed, ` +
        `${withPov}/${tocChapters.length} with POV, ${unconfirmed.length} unconfirmed`
    );
    for (const ch of tocChapters) {
      if (ch.povNote) console.warn(`${TAG} ${ch.povNote}`);
    }

    // An unconfirmed chapter means the offset does not hold there, and placing
    // it anyway risks storing one chapter's pages under another chapter's
    // title — prose that reads perfectly and is simply the wrong chapter,
    // which no amount of proofreading downstream would catch. A few of those
    // among many confirmed ones are placed by arithmetic and named on the
    // manuscript; a lot of them means the offset itself is wrong and the book
    // is refused.
    if (unconfirmed.length) {
      // Where the title *was* seen, if anywhere, is the difference between two
      // very different problems. A sighting some distance away means the
      // offset does not hold there — inserted matter, or a misread page number
      // in the TOC. No sighting at all means the heading is unreadable on that
      // page, which points at the source file rather than the arithmetic.
      const named = unconfirmed
        .slice(0, 5)
        .map((c) => {
          const seen =
            c.foundOnPdfPage === null
              ? "title not found anywhere in the body"
              : `nearest sighting p.${c.foundOnPdfPage}`;
          return `"${c.rawTitle}" (printed p.${c.printedPage} → expected PDF p.${c.pdfPage}; ${seen})`;
        })
        .join("; ");
      const more = unconfirmed.length > 5 ? ` …and ${unconfirmed.length - 5} more` : "";
      const detail =
        `${unconfirmed.length} of ${tocChapters.length} chapter titles were not found near their ` +
        `computed start page using offset ${offset >= 0 ? "+" : ""}${offset}. Unconfirmed: ${named}${more}`;

      const tolerable =
        unconfirmed.length / tocChapters.length <= MAX_UNCONFIRMED_FRACTION &&
        unconfirmed.length <= MAX_UNCONFIRMED_ABSOLUTE;

      if (!tolerable) {
        // A failed TOC disqualifies the TOC, not the book.
        //
        // Refusing to store misaligned text is the right instinct and it still
        // holds — what was wrong was treating "this table of contents cannot be
        // trusted" as the end of the road when a more reliable reading of the
        // same file was available and untried. A book whose chapter openings
        // are legible in type does not need the contents page at all, and
        // preferring it in that case is strictly better than failing.
        const fallback = detectChaptersByTypography(cleanedLinePages);
        if (!fallback) {
          throw new Error(`TOC validation failed: ${detail} Refusing to store possibly misaligned chapter text.`);
        }

        console.warn(`${TAG} ${detail} — discarding the TOC, reading chapter openings from typography instead`);
        warnings.push(
          `The table of contents did not agree with the book (${detail}), so it was discarded and ` +
            `chapter openings were read from the page layout instead — ${fallback.length} found.`
        );

        const firstStart = fallback[0].startPage - 1;
        const hasFrontMatter = cleanedLinePages
          .slice(0, firstStart)
          .some((lines) => lines.some((l) => l.text.trim()));

        rawSections = [
          ...(hasFrontMatter
            ? [{ title: "Front Matter", startPage: 1, startLine: 0, povCharacter: null }]
            : []),
          ...fallback,
        ];
        povRoster = Array.from(
          new Set(fallback.map((s) => s.povCharacter).filter((n): n is string => !!n))
        );

        const assignedAlt = assignChaptersFromLines(rawSections, cleanedLinePages);
        warnings.push(...validateChapterSizes(assignedAlt));
        return { format: "pdf", chapters: assignedAlt, quality, povRoster, warnings };
      }

      const plural = unconfirmed.length === 1 ? "" : "s";
      warnings.push(
        `${unconfirmed.length} chapter${plural} could not be confirmed against the body and ` +
          `${unconfirmed.length === 1 ? "was" : "were"} placed by offset arithmetic — worth checking ` +
          `${unconfirmed.length === 1 ? "its" : "their"} opening text. ${named}${more}`
      );
      console.warn(`${TAG} ${detail} — within tolerance, placed by arithmetic`);
    }

    rawSections = tocChapters.map((c) => ({
      title: c.rawTitle,
      startPage: c.pdfPage,
      povCharacter: c.povCharacter,
    }));
    povRoster = Array.from(new Set(tocChapters.flatMap((c) => c.povNames)));
  } else {
    // ── Second: how the book is set ────────────────────────────────────────
    //
    // Plenty of books simply have no table of contents — a print interior
    // often omits one entirely — and that is not a reason to fall back to
    // inference. Such a book still marks every chapter opening in type, and
    // reading that is both cheaper and more reliable than asking a model to
    // guess from page-opening text.
    const typographic = detectChaptersByTypography(cleanedLinePages);

    if (typographic) {
      console.log(
        `${TAG} no TOC — chapter openings read from typography: ${typographic.length} sections, ` +
          `${typographic.filter((s) => s.povCharacter).length} with a POV name`
      );

      // Anything before the first heading is front matter — a title page, a
      // copyright notice, a dedication. It is kept as one section rather than
      // dropped, since the dedication is real content someone may want, and
      // rather than several, since none of it is a chapter.
      const firstStart = typographic[0].startPage - 1;
      const hasFrontMatter = cleanedLinePages
        .slice(0, firstStart)
        .some((lines) => lines.some((l) => l.text.trim()));

      rawSections = [
        ...(hasFrontMatter
          ? [{ title: "Front Matter", startPage: 1, startLine: 0, povCharacter: null }]
          : []),
        ...typographic,
      ];
      povRoster = Array.from(
        new Set(typographic.map((s) => s.povCharacter).filter((n): n is string => !!n))
      );
    } else {
      // ── Last resort: infer boundaries from the body ──────────────────────
      //
      // Built from header-stripped pages, not the raw ones.
      //
      // The page map is the first sixty characters of each page, which on a
      // book with running headers is the running header and nothing else.
      // Every page then reads as a section start, and the model dutifully
      // reports one — on "Swing and a Kiss" that produced 87 one-page
      // "chapters" for a 34-chapter book, and put the author's name into
      // povCharacter for every other chapter, because that was the verso
      // header it was shown.
      //
      // Stripping first means the map carries the opening words of each page's
      // actual text, which is what a chapter opening can be recognized from.
      console.log(`${TAG} no TOC and no typographic headings — falling back to body-text detection`);
      const pageMap = buildPageMap(cleanedFlatPages);
      if (!pageMap) throw new Error("Could not extract any text from PDF");
      rawSections = await askClaude(pageMap);
      boundariesInferred = true;
    }
  }

  const assigned = assignChaptersFromLines(rawSections, cleanedLinePages);
  // Only guessed boundaries get repaired. A boundary read off the page — from
  // the book's own contents, or from the heading itself — is not a guess, and
  // running the repair over one can only do harm: on this book, before line
  // ordering was fixed, it merged 16 correctly-detected chapters away.
  const { chapters, warnings: mergeWarnings } = boundariesInferred
    ? mergeContinuationChapters(assigned)
    : { chapters: assigned, warnings: [] as string[] };
  warnings.push(...mergeWarnings, ...validateChapterSizes(chapters));
  return { format: "pdf", chapters, quality, povRoster, warnings };
}
