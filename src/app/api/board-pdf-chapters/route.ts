import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const maxDuration = 10;

const r2 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT!, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });

async function callAnthropic(apiKey: string, base64: string, attempt = 1): Promise<Response> {
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: "Extract EVERY chapter as JSON array only: [{number,title,wordCount,pages}]. Include Prologue/Epilogue. Exact titles. Real word counts. No markdown." }] }] }) });
  if ((res.status === 502 || res.status === 503) && attempt < 3) { await new Promise(r => setTimeout(r, 1000 * attempt)); return callAnthropic(apiKey, base64, attempt + 1); }
  return res;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    const { key, bucket } = await req.json();
    if (!key || !bucket) return NextResponse.json({ error: "Missing key or bucket" }, { status: 400 });
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    const base64 = Buffer.from(bytes).toString("base64");
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
    if (bytes.length > 20971520) return NextResponse.json({ error: "PDF over 20MB" }, { status: 400 });
    const response = await callAnthropic(apiKey, base64);
    if (!response.ok) { const err = await response.text(); return NextResponse.json({ error: `Anthropic error ${response.status} — please try again` }, { status: 500 }); }
    const aiData = await response.json();
    const chapters = JSON.parse((aiData.content?.[0]?.text || "").replace(/\\\json|\\\/g, "").trim());
    if (!Array.isArray(chapters) || !chapters.length) throw new Error("No chapters returned");
    return NextResponse.json({ chapters, source: "claude" });
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e instanceof Error ? e.message : "Unknown"}` }, { status: 500 });
  }
}
