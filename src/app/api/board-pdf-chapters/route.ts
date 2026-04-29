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

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });

  const { key, bucket } = await req.json();
  if (!key || !bucket) return NextResponse.json({ error: "Missing key or bucket." }, { status: 400 });

  const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await obj.Body!.transformToByteArray();
  const base64 = Buffer.from(bytes).toString("base64");
  r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      stream: true,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extract every chapter from this manuscript. Count the actual words in each chapter.\n\nReturn ONLY a JSON array, no markdown, no explanation.\nFormat: [{\"number\":1,\"title\":\"Chapter Title\",\"wordCount\":2500,\"pages\":10}]\n\nRules:\n- Include Prologue, Epilogue, and all numbered/named chapters\n- Use exact titles as written in the book\n- wordCount = actual word count of that chapter body text\n- pages = number of pages that chapter spans\n- Exclude: TOC, copyright, dedication, acknowledgments, about the author\n- Return ONLY the JSON array" },
        ],
      }],
    }),
  });

  if (!anthropicRes.ok) {
    return NextResponse.json({ error: `Anthropic error ${anthropicRes.status} — please try again.` }, { status: 500 });
  }

  const reader = anthropicRes.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text;
        }
      } catch {}
    }
  }

  const chapters = JSON.parse(fullText.replace(/```json|```/g, "").trim());
  if (!Array.isArray(chapters) || !chapters.length) {
    return NextResponse.json({ error: "No chapters returned from Claude." }, { status: 500 });
  }

  return NextResponse.json({ chapters });
}