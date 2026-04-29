import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const maxDuration = 60;

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function extractPageWordCounts(bytes: Uint8Array): Promise<number[]> {
  // Dynamic import avoids SSR issues with pdfjs
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const counts: number[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as any[]).map((item) => item.str).join(" ");
    counts.push(text.split(/\s+/).filter(Boolean).length);
  }
  return counts;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });

  const { key, bucket } = await req.json();
  if (!key || !bucket) return NextResponse.json({ error: "Missing key or bucket." }, { status: 400 });

  // Fetch PDF from R2
  const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await obj.Body!.transformToByteArray();
  r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

  // Extract per-page word counts (runs in parallel with Claude call)
  const [pageWordCounts, anthropicRes] = await Promise.all([
    extractPageWordCounts(bytes),
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: "List every chapter in this manuscript with its start page number.\nInclude Prologue, Epilogue, and all named/numbered chapters.\nExclude TOC, copyright, dedication, acknowledgments, about the author.\nReturn ONLY a JSON array: [{\"number\":1,\"title\":\"Chapter Title\",\"startPage\":11}]\nNo markdown, no explanation." },
          ],
        }],
      }),
    }),
  ]);

  if (!anthropicRes.ok) {
    return NextResponse.json({ error: `Anthropic error ${anthropicRes.status} — please try again.` }, { status: 500 });
  }

  const aiData = await anthropicRes.json();
  const rawText = aiData.content?.[0]?.text ?? "";
  const rawChapters: { number: number; title: string; startPage: number }[] =
    JSON.parse(rawText.replace(/```json|```/g, "").trim());

  if (!Array.isArray(rawChapters) || !rawChapters.length) {
    return NextResponse.json({ error: "No chapters returned from Claude." }, { status: 500 });
  }

  // Calculate word counts and page spans from our own extraction
  const totalPages = pageWordCounts.length;
  const chapters = rawChapters.map((ch, i) => {
    const start = Math.max(0, ch.startPage - 1);
    const end = i + 1 < rawChapters.length ? Math.max(start + 1, rawChapters[i + 1].startPage - 1) : totalPages;
    const wordCount = pageWordCounts.slice(start, end).reduce((sum, n) => sum + n, 0);
    return { number: ch.number, title: ch.title, wordCount, pages: end - start };
  });

  return NextResponse.json({ chapters });
}