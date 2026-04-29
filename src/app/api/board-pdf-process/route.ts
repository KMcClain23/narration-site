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

interface PageTextResult {
  num: number;
  text: string;
}

interface TextResult {
  pages: PageTextResult[];
}

// Extract text from every page locally via pdf-parse — zero bytes sent to Anthropic
async function extractPageTexts(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<TextResult> };
  };

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();

  // result.pages is sorted by page number; map to 0-indexed string array
  const maxPage = result.pages.reduce((m, p) => Math.max(m, p.num), 0);
  const texts = new Array<string>(maxPage).fill("");
  for (const p of result.pages) texts[p.num - 1] = p.text;
  return texts;
}

export async function POST(req: Request) {
  const { jobId, key, bucket } = await req.json();
  if (!jobId || !key || !bucket)
    return NextResponse.json({ error: "Missing params." }, { status: 400 });

  try {
    await supabase.from("pdf_jobs").update({ status: "processing" }).eq("id", jobId);

    // Fetch PDF bytes from R2 and immediately delete the temp object
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    // Step 1 — extract text from every page locally (no bytes sent to Anthropic)
    const pageTexts = await extractPageTexts(Buffer.from(bytes));

    // Step 2 — word counts calculated from locally-extracted text
    const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);

    // Step 3 — compact page map: "pageNum: first 60 chars"  (~5k tokens total)
    const pageMap = pageTexts
      .map((text, i) => {
        const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
        return first ? `${i + 1}: ${first}` : null;
      })
      .filter(Boolean)
      .join("\n");

    // Step 4 — send ONLY the page map to Claude; no PDF binary or base64
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

    // Step 5 — derive word counts per chapter from already-extracted page texts
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
