import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { getDocumentProxy, extractText } from "unpdf";

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

async function extractPageTexts(buffer: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return text as string[];
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

    const buffer = Buffer.from(bytes);
    const pageTexts = await extractPageTexts(buffer);
    const pageWordCounts = pageTexts.map((t) => t.split(/\s+/).filter(Boolean).length);

    // Compact page map: page number + first 60 chars of text — enough for Claude to spot chapter headings
    const pageMap = pageTexts
      .map((text, i) => {
        const first = text.trim().slice(0, 60).replace(/\s+/g, " ");
        return first ? `${i + 1}: ${first}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Here are the page numbers and first line of text from each page of a manuscript.\n\n${pageMap}\n\nIdentify which pages begin a new chapter (Prologue, Epilogue, Chapter One, Chapter Two, etc.).\nReturn ONLY a JSON array: [{"number":1,"title":"Chapter Title","startPage":11}]\nNo markdown. No explanation. Only the JSON array.`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);

    const aiData = await response.json();
    const rawText = aiData.content?.[0]?.text ?? "";
    const rawChapters: { number: number; title: string; startPage: number }[] = JSON.parse(
      rawText.replace(/```json|```/g, "").trim()
    );

    if (!Array.isArray(rawChapters) || !rawChapters.length) throw new Error("No chapters found");

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
