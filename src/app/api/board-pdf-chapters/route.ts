import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";

export const maxDuration = 60;

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const CHUNK_SIZE = 50;

async function processChunk(apiKey: string, chunkBase64: string, startPage: number, endPage: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: chunkBase64 } },
          { type: "text", text: `This is pages ${startPage}-${endPage} of a manuscript. List any chapters that BEGIN in these pages. Count actual words in each chapter found here. Return ONLY a JSON array ([] if none): [{"title":"Chapter Title","startPage":${startPage},"wordCount":1250}]. Use absolute page numbers from ${startPage}. Exclude TOC, copyright, dedication, acknowledgments, about the author. No markdown.` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "[]";
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });

  const { key, bucket } = await req.json();
  if (!key || !bucket) return NextResponse.json({ error: "Missing key or bucket." }, { status: 400 });

  const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await obj.Body!.transformToByteArray();
  r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

  const srcDoc = await PDFDocument.load(bytes);
  const totalPages = srcDoc.getPageCount();
  const chunks: { base64: string; start: number; end: number }[] = [];

  for (let start = 0; start < totalPages; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, totalPages - 1);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const copied = await chunkDoc.copyPages(srcDoc, indices);
    copied.forEach(p => chunkDoc.addPage(p));
    const chunkBytes = await chunkDoc.save();
    chunks.push({ base64: Buffer.from(chunkBytes).toString("base64"), start: start + 1, end: end + 1 });
  }

  const results = await Promise.all(chunks.map(c => processChunk(apiKey, c.base64, c.start, c.end)));

  const allChapters = results.flat()
    .filter((c: any) => c.title && c.startPage)
    .sort((a: any, b: any) => a.startPage - b.startPage)
    .map((ch: any, i: number) => ({
      number: i + 1,
      title: ch.title,
      wordCount: ch.wordCount || 0,
      pages: ch.endPage ? ch.endPage - ch.startPage + 1 : 0,
    }));

  if (!allChapters.length) return NextResponse.json({ error: "No chapters found in PDF." }, { status: 500 });
  return NextResponse.json({ chapters: allChapters });
}