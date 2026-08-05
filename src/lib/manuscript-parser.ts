import Anthropic from "@anthropic-ai/sdk";
import { sanitiseClaudeJson } from "@/lib/sanitize-claude-json";
import { UNNUMBERED_SECTION_TITLE } from "@/lib/unnumbered-sections";

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
 * or word-frequency check recognises, TOC titles fail to match, and Claude sees
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

function normalizeLigatures(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [re, rep] of LIGATURES) out = out.replace(re, rep);
  return out;
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

  const { value: html } = await mammoth.convertToHtml({ buffer });

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
  const words = rawText.split(/\s+/).filter(Boolean);
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
        // Ligatures are normalized here, at the single point where glyphs
        // become strings, so no consumer downstream — TOC matching, quality
        // scoring, paragraph assembly, Claude — ever has to know they existed.
        const flat = normalizeLigatures(tc.items.map((i) => i.str).join(" ")).replace(/\s+/g, " ").trim();
        flatPages.push(flat);

        const lines: PdfLine[] = [];
        let lastY: number | null = null;
        let cur = "";
        let curIndent = 0;
        for (const item of tc.items) {
          const y = item.transform[5];
          const x = item.transform[4];
          const str = normalizeLigatures(item.str);
          if (lastY === null || y === lastY) {
            if (cur === "") curIndent = x;
            cur += str;
          } else {
            const t = cur.trim().replace(/\s+/g, " ");
            if (t) lines.push({ text: t, indent: curIndent });
            cur = str;
            curIndent = x;
          }
          lastY = y;
        }
        const tail = cur.trim().replace(/\s+/g, " ");
        if (tail) lines.push({ text: tail, indent: curIndent });
        linePages.push(lines);

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
  const pagesWithRunningHeader = new Set<number>();

  for (const group of byKey.values()) {
    if (new Set(group.map((c) => c.page)).size < threshold) continue;
    for (const c of group) {
      if (!remove.has(c.page)) remove.set(c.page, new Set());
      remove.get(c.page)!.add(c.line);
      pagesWithRunningHeader.add(c.page);
    }
  }

  // Bare numbers are ambiguous: a folio and a printed chapter number are the
  // same token in the same zone. The distinguisher is the rest of the page —
  // chapter-opening pages suppress the running header, body pages don't. So a
  // bare number is only treated as a folio when a running header was found on
  // that same page; otherwise it is left alone, because on a chapter opener it
  // is the chapter number and stripping it destroys chapter detection outright.
  if (pagesWithRunningHeader.size >= threshold) {
    for (const c of numericCandidates) {
      if (!pagesWithRunningHeader.has(c.page)) continue;
      if (!remove.has(c.page)) remove.set(c.page, new Set());
      remove.get(c.page)!.add(c.line);
    }
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
function joinDropCaps(lines: PdfLine[]): PdfLine[] {
  const out: PdfLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (next && /^[A-Z]$/.test(cur.text.trim()) && /^[a-z]/.test(next.text.trim())) {
      out.push({
        text: cur.text.trim() + next.text.trim(),
        // The drop cap sits at the paragraph's true left margin; the line
        // beside it is inset to clear the glyph, so the cap's own x-position
        // is the honest one. forceBreak carries the paragraph boundary, since
        // that margin position would otherwise read as a wrapped line.
        indent: cur.indent,
        forceBreak: true,
      });
      i++; // consumed the continuation line
      continue;
    }
    out.push(cur);
  }
  return out;
}

// ─── TOC detection & parsing ────────────────────────────────────────────────────
// Unchanged from board-pdf-process/route.ts (commit 79e497e~1) — reused as-is.
// Operates on flatPages (space-joined, no line breaks), same shape it was
// originally tuned against.

interface TocEntry {
  title: string;
  startPage: number; // physical content-stream page index (1-based)
}

/** Convert "iii" / "iv" / "7" → integer. Returns 0 for unrecognised strings. */
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
  const reA = new RegExp(
    `(?:^|\\s)\\d+\\.\\s+([\\s\\S]+?)\\s+(${PAGE_NUM})(?=\\s+\\d+\\.\\s+|\\s*$)`,
    "g"
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
function parseTocFromPages(pageTexts: string[]): TocEntry[] | null {
  const entries: TocEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < Math.min(15, pageTexts.length); i++) {
    if (!pageTexts[i].trim()) continue;
    extractTocEntries(pageTexts[i], entries, seen);
  }

  if (entries.length < 3) return null;

  // Require the majority of consecutive pairs to be ascending
  let asc = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].startPage > entries[i - 1].startPage) asc++;
  }
  const ascRatio = asc / (entries.length - 1);
  if (ascRatio < 0.75) return null;

  return entries;
}

// ─── Chapter numbering + text assembly ─────────────────────────────────────────

const UNNUMBERED = UNNUMBERED_SECTION_TITLE;

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
function stripLeadingPovHeading(rawText: string, povCharacter: string | null): string {
  const name = povCharacter?.trim();
  if (!name) return rawText;

  const paragraphs = rawText.split("\n\n");
  let idx = 0;
  if (paragraphs[idx] && /^\d{1,4}$/.test(paragraphs[idx].trim())) idx++;

  if (paragraphs[idx] === name) {
    paragraphs.splice(idx, 1);
    return paragraphs.join("\n\n");
  }
  if (paragraphs[idx]?.startsWith(`${name} `)) {
    paragraphs[idx] = paragraphs[idx].slice(name.length + 1);
    return paragraphs.join("\n\n");
  }
  return rawText;
}

/**
 * Turns raw {title, startPage} boundaries (from the TOC parser or Claude) into
 * final chapters — assigns sequential numbers (front/back matter stays
 * unnumbered) and reconstructs each chapter's raw_text, paragraphs included,
 * from linePages[start, end). linePages must already be header/footer-stripped.
 */
function assignChaptersFromLines(
  raw: Array<{ title: string; startPage: number; povCharacter?: string | null }>,
  linePages: PdfLine[][]
): ParsedChapter[] {
  const totalPages = linePages.length;
  let chapNum = 0;
  return raw.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end =
      i + 1 < raw.length
        ? Math.max(start + 1, raw[i + 1].startPage - 1)
        : totalPages;
    const povCharacter = ch.povCharacter ?? null;
    const rawText = stripLeadingPovHeading(assembleParagraphs(linePages.slice(start, end).flat()), povCharacter);
    const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
    const number = UNNUMBERED.test(ch.title.trim()) ? null : ++chapNum;
    return { number, title: ch.title, povCharacter, wordCount, rawText };
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
  let chapNum = 0;
  return raw.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end =
      i + 1 < raw.length
        ? Math.max(start + 1, raw[i + 1].startPage - 1)
        : totalPages;
    const povCharacter = ch.povCharacter ?? null;
    const rawText = stripLeadingPovHeading(pageTexts.slice(start, end).join("\n\n").trim(), povCharacter);
    const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
    const number = UNNUMBERED.test(ch.title.trim()) ? null : ++chapNum;
    return { number, title: ch.title, povCharacter, wordCount, rawText };
  });
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
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    // 1024 was silently truncating mid-array on real books (~30+ sections) —
    // confirmed via stop_reason="max_tokens" against the Ruined test file.
    // 4096 gives headroom; the stop_reason log below stays so a future book
    // long enough to blow through even that isn't a silent chapter-count bug.
    max_tokens: 4096,
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
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  console.log(`[manuscript-parser] askClaude stop_reason=${msg.stop_reason} output_tokens=${msg.usage.output_tokens} raw_len=${raw.length}`);

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
 * A quality problem is never fatal here — a partially garbled book still has
 * readable chapters worth keeping, and refusing the parse would leave the user
 * with nothing and no explanation. It is logged loudly instead, with the page
 * indices named, so the failure is attributable to the source file at a glance
 * rather than being rediscovered later by spot-checking.
 */
function logTextQuality(format: string, q: TextQualityReport): void {
  if (!q.suspectPages.length) {
    console.log(
      `[manuscript-parser] ${format} text quality OK — median common-word ratio ${q.median.toFixed(3)}`
    );
    return;
  }
  const sample = q.suspectPages.slice(0, 20).map((i) => i + 1).join(", ");
  const more = q.suspectPages.length > 20 ? ` …and ${q.suspectPages.length - 20} more` : "";
  console.warn(
    `[manuscript-parser] ${format} text quality SUSPECT — ` +
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
function assembleTextParagraphs(pageText: string): string {
  const paragraphs: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) paragraphs.push(current.trim());
    current = "";
  };

  for (const rawLine of pageText.split("\n")) {
    if (!rawLine.trim()) { flush(); continue; }
    const indented = /^[ \t]{2,}/.test(rawLine);
    const line = rawLine.trim();
    if (indented) { flush(); current = line; continue; }
    if (!current) { current = line; continue; }
    const brokenWord = /\w-$/.test(current) && /^[a-z]/.test(line);
    current = brokenWord ? `${current.slice(0, -1)}${line}` : `${current} ${line}`;
  }
  flush();

  return paragraphs.join("\n\n");
}

export async function parseManuscript(
  buffer: Buffer
): Promise<{ format: "pdf" | "docx" | "txt"; chapters: ParsedChapter[]; quality?: TextQualityReport }> {
  const fileType = detectFileType(new Uint8Array(buffer));

  // ── Plain-text path ────────────────────────────────────────────────────────
  // Pages come from form feeds (\f) when present — the convention for a text
  // file that came out of a page-oriented source and needs its page boundaries
  // preserved so TOC page numbers still resolve. Without them the whole file is
  // one page and chapter detection falls to Claude.
  if (fileType === "txt") {
    const decoded = normalizeLigatures(
      buffer.toString("utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n")
    );
    const pages = decoded.split("\f").map((p) => assembleTextParagraphs(p));
    if (!pages.some((p) => p.trim())) throw new Error("Could not extract any text from file");

    const quality = assessTextQuality(pages);
    logTextQuality("txt", quality);

    const tocEntries = parseTocFromPages(pages);
    const rawSections = tocEntries
      ? tocEntries.map((e) => ({ ...e, povCharacter: null }))
      : await askClaude(buildPageMap(pages));

    return { format: "txt", chapters: assignChaptersFromPages(rawSections, pages), quality };
  }

  // ── DOCX path ──────────────────────────────────────────────────────────────
  if (fileType === "docx") {
    const docx = await processDocx(buffer);

    if (docx.kind === "headings") {
      let chapNum = 0;
      const chapters: ParsedChapter[] = docx.sections.map((s) => {
        const number = UNNUMBERED.test(s.title.trim()) ? null : ++chapNum;
        return { number, title: s.title, povCharacter: null, wordCount: s.wordCount, rawText: s.rawText };
      });
      return { format: "docx", chapters };
    }

    // Fallback: pseudo-pages → Claude (unformatted docx without heading styles)
    const pageMap = buildPageMap(docx.pages);
    if (!pageMap) throw new Error("Could not extract any text from document");
    const rawSections = await askClaude(pageMap);
    const chapters = assignChaptersFromPages(rawSections, docx.pages);
    return { format: "docx", chapters };
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

  // TOC detection runs against the untouched flat text, same as the retired
  // pipeline — stripping happens only when assembling the final raw_text below.
  const tocEntries = parseTocFromPages(flatPages);

  // Order matters here: headers have to go before drop caps, or a stripped
  // header line sitting between a drop cap and its continuation leaves the two
  // non-adjacent and the join never fires.
  const cleanedLinePages = stripHeadersFooters(linePages).map(joinDropCaps);

  let rawSections: Array<{ title: string; startPage: number; povCharacter: string | null }>;
  if (tocEntries) {
    rawSections = tocEntries.map((e) => ({ ...e, povCharacter: null }));
  } else {
    const pageMap = buildPageMap(flatPages);
    if (!pageMap) throw new Error("Could not extract any text from PDF");
    rawSections = await askClaude(pageMap);
  }

  const chapters = assignChaptersFromLines(rawSections, cleanedLinePages);
  return { format: "pdf", chapters, quality };
}
