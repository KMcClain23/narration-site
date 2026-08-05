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

function detectFileType(bytes: Uint8Array): "pdf" | "docx" | "unknown" {
  // PDF magic: %PDF  (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // DOCX/ZIP magic: PK\x03\x04  (50 4B 03 04)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx";
  return "unknown";
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
        const flat = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        flatPages.push(flat);

        const lines: PdfLine[] = [];
        let lastY: number | null = null;
        let cur = "";
        let curIndent = 0;
        for (const item of tc.items) {
          const y = item.transform[5];
          const x = item.transform[4];
          if (lastY === null || y === lastY) {
            if (cur === "") curIndent = x;
            cur += item.str;
          } else {
            const t = cur.trim().replace(/\s+/g, " ");
            if (t) lines.push({ text: t, indent: curIndent });
            cur = item.str;
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
// A line is a probable running header/footer if it (a) is short (<40 chars),
// (b) is either all-caps or purely numeric (a page number), and (c) recurs
// — identically, or in the numeric case by pattern — across a majority of
// pages at a consistent position (first or last non-blank line of the page).
// "Near-identical" is handled by normalizing (lowercase, collapsed whitespace)
// before comparing; this is not fuzzy/edit-distance matching, just enough to
// absorb incidental spacing/case drift between page renders.

const HEADER_FOOTER_MAX_LEN = 40;

function isNumericLine(s: string): boolean {
  return /^\d{1,4}$/.test(s);
}

function isAllCapsLine(s: string): boolean {
  return /[A-Z]/.test(s) && s === s.toUpperCase() && !/[a-z]/.test(s);
}

function qualifiesAsHeaderFooter(s: string): boolean {
  const t = s.trim();
  if (!t || t.length >= HEADER_FOOTER_MAX_LEN) return false;
  return isNumericLine(t) || isAllCapsLine(t);
}

function firstNonBlankIndex(lines: PdfLine[]): number {
  return lines.findIndex((l) => l.text.trim().length > 0);
}

function lastNonBlankIndex(lines: PdfLine[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].text.trim().length > 0) return i;
  }
  return -1;
}

/**
 * Given the candidate line at a fixed position (first-line or last-line) for
 * a specific set of pages, decide which of those pages' candidate is a
 * recurring header/footer and should be stripped. Numeric candidates recur
 * by *pattern* (the digits differ per page — that's the point, it's a page
 * number); text candidates must recur with (near-)identical normalized text.
 */
function findRecurringInGroup(candidates: (string | null)[], indices: number[]): Set<number> {
  const threshold = Math.max(2, Math.ceil(indices.length * 0.5));

  const qualifying = indices
    .map((i) => ({ i, c: candidates[i] }))
    .filter((x): x is { i: number; c: string } => !!x.c && qualifiesAsHeaderFooter(x.c));

  if (qualifying.length < threshold) return new Set();

  const numeric = qualifying.filter((x) => isNumericLine(x.c.trim()));
  if (numeric.length >= threshold) return new Set(numeric.map((x) => x.i));

  const groups = new Map<string, number[]>();
  for (const { i, c } of qualifying) {
    const norm = c.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm)!.push(i);
  }
  for (const idxs of groups.values()) {
    if (idxs.length >= threshold) return new Set(idxs);
  }
  return new Set();
}

/**
 * Print layouts commonly alternate running headers by page parity — book
 * title on one side, chapter/POV name on the other (recto/verso). Checked
 * only across all pages, each variant lands under ~50% and neither gets
 * caught. So this checks three groupings — all pages, even indices, odd
 * indices — and strips whatever any of them independently recognize as
 * majority-recurring. A non-alternating header still gets caught by the
 * all-pages pass; an alternating one gets caught by whichever parity it
 * actually lives on.
 */
function findRecurringIndices(candidates: (string | null)[]): Set<number> {
  const allIndices = candidates.map((_, i) => i);
  const evenIndices = allIndices.filter((i) => i % 2 === 0);
  const oddIndices = allIndices.filter((i) => i % 2 === 1);

  const result = new Set<number>();
  for (const group of [allIndices, evenIndices, oddIndices]) {
    for (const i of findRecurringInGroup(candidates, group)) result.add(i);
  }
  return result;
}

/** Not enough pages to establish a "recurs across a majority" pattern. */
const MIN_PAGES_FOR_HEADER_FOOTER_DETECTION = 3;

function stripHeadersFooters(pageLines: PdfLine[][]): PdfLine[][] {
  if (pageLines.length < MIN_PAGES_FOR_HEADER_FOOTER_DETECTION) return pageLines;

  const firstCandidates = pageLines.map((lines) => {
    const idx = firstNonBlankIndex(lines);
    return idx === -1 ? null : lines[idx].text;
  });
  const lastCandidates = pageLines.map((lines) => {
    const idx = lastNonBlankIndex(lines);
    return idx === -1 ? null : lines[idx].text;
  });

  const stripFirst = findRecurringIndices(firstCandidates);
  const stripLast = findRecurringIndices(lastCandidates);

  return pageLines.map((lines, pageIdx) => {
    if (!stripFirst.has(pageIdx) && !stripLast.has(pageIdx)) return lines;
    const out = lines.slice();
    if (stripLast.has(pageIdx)) {
      const idx = lastNonBlankIndex(out);
      if (idx !== -1) out.splice(idx, 1);
    }
    if (stripFirst.has(pageIdx)) {
      const idx = firstNonBlankIndex(out);
      if (idx !== -1) out.splice(idx, 1);
    }
    return out;
  });
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
    if (isIndented && current) {
      paragraphs.push(current.trim());
      current = line.text;
    } else {
      current = current ? `${current} ${line.text}` : line.text;
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

export async function parseManuscript(buffer: Buffer): Promise<{ format: "pdf" | "docx"; chapters: ParsedChapter[] }> {
  const fileType = detectFileType(new Uint8Array(buffer));

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

  // TOC detection runs against the untouched flat text, same as the retired
  // pipeline — stripping happens only when assembling the final raw_text below.
  const tocEntries = parseTocFromPages(flatPages);

  const cleanedLinePages = stripHeadersFooters(linePages);

  let rawSections: Array<{ title: string; startPage: number; povCharacter: string | null }>;
  if (tocEntries) {
    rawSections = tocEntries.map((e) => ({ ...e, povCharacter: null }));
  } else {
    const pageMap = buildPageMap(flatPages);
    if (!pageMap) throw new Error("Could not extract any text from PDF");
    rawSections = await askClaude(pageMap);
  }

  const chapters = assignChaptersFromLines(rawSections, cleanedLinePages);
  return { format: "pdf", chapters };
}
