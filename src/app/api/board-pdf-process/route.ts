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
    // Match (string) Tj / ' and [(array)] TJ
    const opRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*(?:Tj|'|")|(\[[\s\S]*?\])\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = opRe.exec(block)) !== null) {
      if (m[1] !== undefined) {
        const t = decodeLiteralString(m[1]).replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      } else {
        // TJ array — collect literal strings, ignore numeric kerning values
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
 *
 * Scans every stream/endstream pair in the file, decompresses with zlib
 * (FlateDecode is the standard for modern PDFs), and pulls text from BT…ET
 * content blocks. For manuscript PDFs, streams appear in page order.
 */
function extractPageTexts(bytes: Uint8Array): string[] {
  // Work in binary string space to safely handle arbitrary byte values
  const raw = Buffer.from(bytes).toString("binary");
  const pages: string[] = [];

  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const endIdx = raw.indexOf("\nendstream", start);
    if (endIdx < 0) continue;

    const blob = Buffer.from(raw.slice(start, endIdx), "binary");

    // Try zlib inflate (FlateDecode with header), then raw deflate, then plain
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

export async function POST(req: Request) {
  const { jobId, key, bucket } = await req.json();
  if (!jobId || !key || !bucket)
    return NextResponse.json({ error: "Missing params." }, { status: 400 });

  try {
    await supabase.from("pdf_jobs").update({ status: "processing" }).eq("id", jobId);

    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    // Step 1 — extract text from every page locally using only Node.js built-ins
    const pageTexts = extractPageTexts(bytes);

    // Step 2 — word counts calculated from locally-extracted text
    const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);

    // Step 3 — compact page map: "pageNum: first 60 chars"  (~5k tokens for a full novel)
    const pageMap = pageTexts
      .map((text, i) => {
        const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
        return first ? `${i + 1}: ${first}` : null;
      })
      .filter(Boolean)
      .join("\n");

    if (!pageMap) throw new Error("Could not extract any text from PDF");

    // Step 4 — send ONLY the page map to Claude; no PDF binary or base64 at all
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Here are the page numbers and first line of text from each page of a manuscript.\n\n${pageMap}\n\nIdentify which pages begin a new chapter (Prologue, Epilogue, Chapter One, Chapter Two, etc.).\nReturn ONLY a JSON array: [{"number":1,"title":"Chapter Title","startPage":11}]\nNo markdown. No explanation. Only the JSON array.`,
        },
      ],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "";
    const rawChapters: { number: number; title: string; startPage: number }[] = JSON.parse(
      rawText.replace(/```json|```/g, "").trim()
    );

    if (!Array.isArray(rawChapters) || !rawChapters.length) throw new Error("No chapters found");

    // Step 5 — word counts per chapter from already-extracted text, not from Claude
    const totalPages = pageWordCounts.length;
    const chapters = rawChapters.map((ch, i) => {
      const start = Math.max(0, ch.startPage - 1);
      const end =
        i + 1 < rawChapters.length
          ? Math.max(start + 1, rawChapters[i + 1].startPage - 1)
          : totalPages;
      const wordCount = pageWordCounts.slice(start, end).reduce((a, b) => a + b, 0);
      return { number: i + 1, title: ch.title, wordCount, pages: end - start };
    });

    await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pdf_jobs").update({ status: "error", error: msg }).eq("id", jobId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
