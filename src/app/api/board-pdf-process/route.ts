import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SDK retries 429s automatically with exponential backoff
const anthropic = new Anthropic({ maxRetries: 4 });

// ─── DOMMatrix polyfill ───────────────────────────────────────────────────────
// pdfjs-dist (bundled inside pdf-parse) references DOMMatrix at module-init time.
// Node.js < 19 doesn't expose it as a global. Set a minimal stub before the
// first require('pdf-parse') so the module loads without throwing.

function ensureDOMMatrix() {
  if (typeof (globalThis as any).DOMMatrix !== "undefined") return;
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    static fromMatrix() { return new (globalThis as any).DOMMatrix(); }
    static fromFloat32Array() { return new (globalThis as any).DOMMatrix(); }
    static fromFloat64Array() { return new (globalThis as any).DOMMatrix(); }
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
}

/**
 * Extract chapters from a Word document using mammoth.
 *
 * Fast path: Word heading styles (Heading 1/2/3) → markdown # / ## / ###
 *   Each heading becomes a chapter boundary; word count = words in that section.
 *   No Claude call needed for well-formatted .docx files.
 *
 * Fallback: no headings found → return pseudo-pages (300 words each) for the
 *   existing compact-page-map → Claude Haiku path.
 */
async function processDocx(buffer: Buffer): Promise<
  | { kind: "headings"; sections: DocxSection[] }
  | { kind: "pseudoPages"; pages: string[] }
> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as {
    convertToMarkdown: (src: { buffer: Buffer }) => Promise<{ value: string }>;
    extractRawText:    (src: { buffer: Buffer }) => Promise<{ value: string }>;
  };

  const { value: markdown } = await mammoth.convertToMarkdown({ buffer });
  const lines = markdown.split("\n");

  // Collect heading-delimited sections
  const sections: DocxSection[] = [];
  let current: { title: string; words: number } | null = null;

  for (const line of lines) {
    const hm = line.match(/^#{1,3}\s+(.+)$/);
    if (hm) {
      if (current) sections.push({ title: current.title, wordCount: current.words });
      current = { title: cleanTocTitle(hm[1]), words: 0 };
    } else if (current) {
      current.words += line.split(/\s+/).filter(Boolean).length;
    }
  }
  if (current) sections.push({ title: current.title, wordCount: current.words });

  if (sections.length >= 2) return { kind: "headings", sections };

  // Fallback: split raw text into pseudo-pages
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const words = rawText.split(/\s+/).filter(Boolean);
  const CHUNK = 300;
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += CHUNK) pages.push(words.slice(i, i + CHUNK).join(" "));

  return { kind: "pseudoPages", pages };
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPageTexts(buffer: Buffer): Promise<string[]> {
  ensureDOMMatrix();

  // serverExternalPackages keeps Turbopack from bundling this CJS module;
  // require() fires lazily so the DOMMatrix polyfill above is already in place.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    buf: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ numpages: number }>;

  const pageTexts: string[] = [];

  await pdfParse(buffer, {
    pagerender(pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) {
      return pageData.getTextContent().then((tc) => {
        const text = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        pageTexts.push(text);
        return text;
      });
    },
  });

  return pageTexts;
}

// ─── TOC detection & parsing ──────────────────────────────────────────────────

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

/**
 * Attempt to pull TOC entries out of one page's text using two strategies.
 *
 * Strategy A — numbered list  "N. Title  pageNum"
 *   Non-greedy title capture + lookahead at the next "M." entry (or end-of-string)
 *   resolves the digit ambiguity in "Chapter 1  7": the engine extends the
 *   non-greedy match until "7" is the only remaining candidate.
 *
 * Strategy B — keyword / number-word entries  "One  1", "Preface  iii"
 *   Only fires if Strategy A found nothing on this page (avoids prose false
 *   positives). Restricted to known section keywords and number words.
 */
function extractTocEntries(text: string, out: TocEntry[], seen: Set<string>): void {
  let found = 0;
  let m: RegExpExecArray | null;

  // Strategy A
  const reA = new RegExp(
    `(?:^|\\s)\\d+\\.\\s+([\\s\\S]+?)\\s+(${PAGE_NUM})(?=\\s+\\d+\\.\\s+|\\s*$)`,
    "g"
  );
  while ((m = reA.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parsePageNum(m[2]);
    const key = title.toLowerCase();
    if (title && page > 0 && !seen.has(key)) {
      out.push({ title, startPage: page });
      seen.add(key);
      found++;
    }
  }
  if (found > 0) return;

  // Strategy B
  const reB = new RegExp(
    `\\b(${COMPOUND_NUM}|${KNOWN_SECTION}|${SINGLE_NUM})\\s+(${PAGE_NUM})(?=\\s|$)`,
    "gi"
  );
  while ((m = reB.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parsePageNum(m[2]);
    const key = title.toLowerCase();
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
    if (!pageTexts[i].trim()) continue; // blank page
    extractTocEntries(pageTexts[i], entries, seen);
  }

  if (entries.length < 3) return null;

  // Require the majority of consecutive pairs to be ascending
  let asc = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].startPage > entries[i - 1].startPage) asc++;
  }
  if (asc < Math.ceil((entries.length - 1) * 0.75)) return null;

  return entries;
}

// ─── Chapter numbering ────────────────────────────────────────────────────────

const UNNUMBERED =
  /^(prologue|epilogue|dedication|preface|afterword|acknowledgements?|acknowledgments?|author'?s?\s+note|content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|content\s*warnings?)$/i;

function assignNumbers(
  raw: Array<{ title: string; startPage: number }>,
  pageWordCounts: number[]
): Array<{ number: number | null; title: string; wordCount: number; pages: number }> {
  const totalPages = pageWordCounts.length;
  let chapNum = 0;
  return raw.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end =
      i + 1 < raw.length
        ? Math.max(start + 1, raw[i + 1].startPage - 1)
        : totalPages;
    const wordCount = pageWordCounts.slice(start, end).reduce((a, b) => a + b, 0);
    const number = UNNUMBERED.test(ch.title.trim()) ? null : ++chapNum;
    return { number, title: ch.title, wordCount, pages: end - start };
  });
}

// ─── Claude fallback ─────────────────────────────────────────────────────────

async function askClaude(pageMap: string): Promise<Array<{ title: string; startPage: number }>> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `Here are the page numbers and first line of text from each page of a manuscript.\n\n${pageMap}\n\n` +
          `Identify which pages begin a trackable section. Include:\n` +
          `- Front matter: Dedication, Preface, Acknowledgments, Content & Trigger Warnings\n` +
          `- Body chapters: Prologue, Chapter One, Chapter Two, … (all numbered chapters)\n` +
          `- Back matter: Epilogue, Afterword\n` +
          `Return ONLY a JSON array: [{"number":1,"title":"Section Title","startPage":11}]\n` +
          `Use clean titles. No markdown. No explanation. Only the JSON array.`,
      },
    ],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  const parsed: { number: number; title: string; startPage: number }[] = JSON.parse(
    raw.replace(/```json|```/g, "").trim()
  );
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("No chapters found");
  return parsed.map(ch => ({ ...ch, title: cleanTocTitle(ch.title) }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { jobId, key, bucket } = await req.json();
  if (!jobId || !key || !bucket)
    return NextResponse.json({ error: "Missing params." }, { status: 400 });

  try {
    await supabase.from("pdf_jobs").update({ status: "processing" }).eq("id", jobId);

    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    const fileType = detectFileType(bytes);
    const buf = Buffer.from(bytes);

    // ── DOCX path ──────────────────────────────────────────────────────────────
    if (fileType === "docx") {
      const docx = await processDocx(buf);

      if (docx.kind === "headings") {
        // Fast path: heading styles give us chapters directly — zero Claude cost
        let chapNum = 0;
        const chapters = docx.sections.map((s) => {
          const number = UNNUMBERED.test(s.title.trim()) ? null : ++chapNum;
          const pages = Math.max(1, Math.round(s.wordCount / 250));
          return { number, title: s.title, wordCount: s.wordCount, pages };
        });
        await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
        return NextResponse.json({ ok: true });
      }

      // Fallback: pseudo-pages → Claude (unformatted docx without heading styles)
      const pageTexts = docx.pages;
      const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);
      const pageMap = pageTexts
        .map((text, i) => {
          const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
          return first ? `${i + 1}: ${first}` : null;
        })
        .filter(Boolean)
        .join("\n");
      if (!pageMap) throw new Error("Could not extract any text from document");
      const rawSections = await askClaude(pageMap);
      const chapters = assignNumbers(rawSections, pageWordCounts);
      await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
      return NextResponse.json({ ok: true });
    }

    // ── PDF path ───────────────────────────────────────────────────────────────
    if (fileType !== "pdf") throw new Error("Unsupported file type");

    // Step 1 — extract per-page text locally with pdf-parse (proper Unicode decoding)
    const pageTexts = await extractPageTexts(buf);
    if (!pageTexts.length) throw new Error("Could not extract any text from PDF");

    // Step 2 — word counts from locally-extracted text
    const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);

    // Step 3 — try TOC fast path; fall back to Claude only when needed
    const tocEntries = parseTocFromPages(pageTexts);
    let rawSections: Array<{ title: string; startPage: number }>;

    if (tocEntries) {
      rawSections = tocEntries;
    } else {
      const pageMap = pageTexts
        .map((text, i) => {
          const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
          return first ? `${i + 1}: ${first}` : null;
        })
        .filter(Boolean)
        .join("\n");
      if (!pageMap) throw new Error("Could not extract any text from PDF");
      rawSections = await askClaude(pageMap);
    }

    // Step 4 — assign chapter numbers; calculate word counts from local text
    const chapters = assignNumbers(rawSections, pageWordCounts);

    await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pdf_jobs").update({ status: "error", error: msg }).eq("id", jobId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
