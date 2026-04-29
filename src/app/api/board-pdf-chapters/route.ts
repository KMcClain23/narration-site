import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const maxDuration = 10;

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const { key, bucket } = await req.json();
    if (!key || !bucket) {
      return NextResponse.json({ error: "Missing key or bucket." }, { status: 400 });
    }

    // Fetch PDF from R2
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    const base64 = Buffer.from(bytes).toString("base64");

    // Clean up temp file from R2
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    const sizeMB = bytes.length / (1024 * 1024);
    if (sizeMB > 20) {
      return NextResponse.json({ error: `PDF is ${sizeMB.toFixed(1)}MB — max 20MB.` }, { status: 400 });
    }

    const prompt = `You are analyzing a book manuscript PDF for an audiobook narrator tracking production chapter by chapter.

Extract EVERY chapter and return ONLY a valid JSON array, no markdown, no explanation.

Format:
[{"number": 1, "title": "Chapter Title", "wordCount": 2847, "pages": 11}, ...]

Rules:
- Include ALL chapters: Prologue, Epilogue, numbered/named chapters
- Use exact chapter titles as written in the book
- wordCount = actual word count of chapter body text
- pages = page count for that chapter
- Exclude: table of contents, copyright, dedication, acknowledgments, about the author
- Return ONLY the JSON array`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[board-pdf-chapters] Anthropic error:", response.status, err);
      return NextResponse.json({ error: `Anthropic error ${response.status}: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "";
    const chapters = JSON.parse(text.replace(/```json|```/g, "").trim());

    if (!Array.isArray(chapters) || !chapters.length) throw new Error("No chapters returned");

    return NextResponse.json({ chapters, source: "claude" });
  } catch (e) {
    console.error("[board-pdf-chapters] Error:", e);
    return NextResponse.json({
      error: `Failed to extract chapters: ${e instanceof Error ? e.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
