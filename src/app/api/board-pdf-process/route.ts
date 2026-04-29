import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { inflateSync, inflateRawSync } from "zlib";

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

// ─── PDF text extraction ──────────────────────────────────────────────────────

/** Decode PDF literal-string escape sequences (octal, \n, \r, etc.) */
function decodeLiteralString(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] !== "\\") { out += s[i++]; continue; }
    i++;
    if (i >= s.length) break;
    if (/[0-7]/.test(s[i])) {
      let oct = "";
      while (oct.length < 3 && i < s.length && /[0-7]/.test(s[i])) oct += s[i++];
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      const esc: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", "(": "(", ")": ")" };
      out += esc[s[i]] ?? "";
      i++;
    }
  }
  return out;
}

/** Extract readable text from a decompressed PDF content stream */
function parseContentStream(content: string): string {
  const parts: string[] = [];
  const btEt = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = btEt.exec(content)) !== null) {
    const block = bm[1];
    const opRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*(?:Tj|'|")|(\[[\s\S]*?\])\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = opRe.exec(block)) !== null) {
      if (m[1] !== undefined) {
        const t = decodeLiteralString(m[1]).replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      } else {
        const strRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)/g;
        let sm: RegExpExecArray | null;
        const strs: string[] = [];
        while ((sm = strRe.exec(m[2])) !== null) strs.push(decodeLiteralString(sm[1]));
        const t = strs.join("").replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      }
    }
  }
  return parts.join(" ");
}

/**
 * Pure Node.js PDF text extraction — no external libraries, no browser APIs.
 * Scans every stream/endstream pair, decompresses with zlib, extracts BT…ET text.
 */
function extractPageTexts(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString("binary");
  const pages: string[] = [];
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const endIdx = raw.indexOf("\nendstream", start);
    if (endIdx < 0) continue;
    const blob = Buffer.from(raw.slice(start, endIdx), "binary");
    let decompressed: Buffer | null = null;
    try { decompressed = inflateSync(blob); } catch { /* not zlib */ }
    if (!decompressed) {
      try { decompressed = inflateRawSync(blob); } catch { /* not raw deflate */ }
    }
    const decoded = (decompressed ?? blob).toString("latin1");
    if (!decoded.includes("BT") || !decoded.includes("ET")) continue;
    const text = parseContentStream(decoded).trim();
    if (text) pages.push(text);
  }
  return pages;
}

// ─── Table of Contents detection & parsing ───────────────────────────────────

interface TocEntry {
  title: string;
  startPage: number;
}

function cleanTocTitle(raw: string): string {
  return raw.replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
}

/**
 * Try to pull TOC entries from one page's extracted text.
 * Strategy A: numbered list  "N. Title  pageNum"
 * Strategy B: keyword-only  "Chapter N  pageNum" / "Prologue  pageNum"
 *
 * Strategy A is tried first; if it finds entries Strategy B is skipped
 * (avoiding false positives from prose text referencing chapter numbers).
 */
function extractTocEntries(text: string, out: TocEntry[], seen: Set<string>): void {
  let found = 0;

  // Strategy A — numbered list entries.
  // Non-greedy capture + lookahead resolves the digit ambiguity in "Chapter 1  7":
  // the engine extends [\s\S]+? until the number before the next "M." or end-of-string
  // is the only candidate left, so it correctly picks 7 as the page, not 1.
  const numberedRe = /(?:^|\s)\d+\.\s+([\s\S]+?)\s+(\d{1,3})(?=\s+\d+\.\s+|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = numberedRe.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parseInt(m[2], 10);
    const key = title.toLowerCase();
    if (title && page >= 1 && !seen.has(key)) {
      out.push({ title, startPage: page });
      seen.add(key);
      found++;
    }
  }
  if (found > 0) return;

  // Strategy B — keyword-only entries (no numbering prefix).
  // Conservative: only fires on known section-name keywords, which are rare in prose.
  const kwRe = /\b(content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|(?:chapter|prologue|epilogue|part|dedication|introduction|preface|afterword|foreword|appendix|acknowledgements?)\s*(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)?)\s+(\d{1,3})(?=\s|$)/gi;
  while ((m = kwRe.exec(text)) !== null) {
    const title = cleanTocTitle(m[1]);
    const page = parseInt(m[2], 10);
    const key = title.toLowerCase();
    if (title && page >= 1 && !seen.has(key)) {
      out.push({ title, startPage: page });
      seen.add(key);
    }
  }
}

/**
 * Scan the first 12 pages for a Table of Contents.
 * Collects entries from all scanned pages (handles multi-page TOCs),
 * then validates by requiring an ascending page-number sequence.
 * Returns null when no reliable TOC is detected (triggers Claude fallback).
 */
function parseTocFromPages(pageTexts: string[]): TocEntry[] | null {
  const entries: TocEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < Math.min(12, pageTexts.length); i++) {
    extractTocEntries(pageTexts[i], entries, seen);
  }

  if (entries.length < 3) return null;

  // Sort by page number; a real TOC must be mostly ascending
  entries.sort((a, b) => a.startPage - b.startPage);

  let ascPairs = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].startPage > entries[i - 1].startPage) ascPairs++;
  }
  // Require the majority of consecutive pairs to be ascending
  if (ascPairs < Math.ceil((entries.length - 1) * 0.75)) return null;

  return entries;
}

// ─── Chapter numbering ────────────────────────────────────────────────────────

const UNNUMBERED = /^(prologue|epilogue|dedication|content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|content\s*warnings?)$/i;

function assignNumbers(
  raw: Array<{ title: string; startPage: number }>,
  pageWordCounts: number[]
): Array<{ number: number | null; title: string; wordCount: number; pages: number }> {
  const totalPages = pageWordCounts.length;
  let chapNum = 0;
  return raw.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end = i + 1 < raw.length
      ? Math.max(start + 1, raw[i + 1].startPage - 1)
      : totalPages;
    const wordCount = pageWordCounts.slice(start, end).reduce((a, b) => a + b, 0);
    const number = UNNUMBERED.test(ch.title.trim()) ? null : ++chapNum;
    return { number, title: ch.title, wordCount, pages: end - start };
  });
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

    // Step 1 — extract text from every page locally (no bytes sent to Anthropic)
    const pageTexts = extractPageTexts(bytes);
    if (!pageTexts.length) throw new Error("Could not extract any text from PDF");

    // Step 2 — word counts from locally-extracted text
    const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);

    // Step 3 — try TOC detection first; fall back to Claude if none found
    const tocEntries = parseTocFromPages(pageTexts);

    let rawSections: Array<{ title: string; startPage: number }>;

    if (tocEntries) {
      // Fast path: parse directly from the TOC — no Claude call needed
      rawSections = tocEntries;
    } else {
      // Slow path: send compact page map to Claude Haiku
      const pageMap = pageTexts
        .map((text, i) => {
          const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
          return first ? `${i + 1}: ${first}` : null;
        })
        .filter(Boolean)
        .join("\n");

      if (!pageMap) throw new Error("Could not extract any text from PDF");

      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Here are the page numbers and first line of text from each page of a manuscript.\n\n${pageMap}\n\nIdentify which pages begin a trackable section. Include:\n- Front matter: Dedication (e.g. "For the good girls…"), Content & Trigger Warnings\n- Body chapters: Prologue, Chapter One, Chapter Two, … (all numbered chapters)\n- Back matter: Epilogue\nReturn ONLY a JSON array: [{"number":1,"title":"Section Title","startPage":11}]\nUse clean titles: "Dedication", "Content & Trigger Warnings", "Prologue", "Chapter One", "Epilogue", etc.\nNo markdown. No explanation. Only the JSON array.`,
          },
        ],
      });

      const rawText = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed: { number: number; title: string; startPage: number }[] = JSON.parse(
        rawText.replace(/```json|```/g, "").trim()
      );
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("No chapters found");
      rawSections = parsed;
    }

    // Step 4 — assign chapter numbers and calculate word counts from local text
    const chapters = assignNumbers(rawSections, pageWordCounts);

    await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pdf_jobs").update({ status: "error", error: msg }).eq("id", jobId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
