import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import pdfParse = require("pdf-parse");

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

export async function POST(req: Request) {
  const { jobId, key, bucket } = await req.json();
  if (!jobId || !key || !bucket) return NextResponse.json({ error: "Missing params." }, { status: 400 });

  try {
    await supabase.from("pdf_jobs").update({ status: "processing" }).eq("id", jobId);

    // Fetch PDF from R2
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    // Extract per-page text and word counts
    const pageWordCounts: number[] = [];
    const pageFirstLines: string[] = [];

    const parsed = await pdfParse(Buffer.from(bytes), {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((content: any) => {
          const text = content.items.map((i: any) => i.str).join(" ").trim();
          const words = text.split(/\s+/).filter(Boolean).length;
          pageWordCounts.push(words);
          const firstLine = content.items
            .map((i: any) => i.str)
            .join("")
            .trim()
            .split(/\n/)[0]
            ?.trim()
            .slice(0, 80) || "";
          pageFirstLines.push(firstLine);
          return text;
        });
      }
    });

    // Build a compact page map for Claude — just page number + first line
    const pageMap = pageFirstLines
      .map((line, i) => `${i + 1}: ${line}`)
      .filter(l => l.split(": ")[1]?.trim())
      .join("\n");

    // Ask Claude to identify chapter headings from the page map only
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
        messages: [{
          role: "user",
          content: `Here is a list of page numbers and the first line of text on each page from a manuscript:\n\n${pageMap}\n\nIdentify which pages begin a new chapter (including Prologue, Epilogue). The font may be garbled so look for patterns like chapter numbers or names.\n\nReturn ONLY a JSON array: [{"number":1,"title":"Chapter Title","startPage":11}]\nUse the cleanest version of the title you can infer. No markdown. No explanation.`,
        }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);

    const aiData = await response.json();
    const rawText = aiData.content?.[0]?.text ?? "";
    const rawChapters: { number: number; title: string; startPage: number }[] =
      JSON.parse(rawText.replace(/```json|```/g, "").trim());

    if (!Array.isArray(rawChapters) || !rawChapters.length) throw new Error("No chapters found");

    // Calculate word counts from our own extraction
    const totalPages = pageWordCounts.length;
    const chapters = rawChapters.map((ch, i) => {
      const start = Math.max(0, ch.startPage - 1);
      const end = i + 1 < rawChapters.length
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