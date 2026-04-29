import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 800;

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

    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});

    const base64 = Buffer.from(bytes).toString("base64");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Extract every chapter from this manuscript. Count the actual words in each chapter.\n\nReturn ONLY a JSON array, no markdown, no explanation.\nFormat: [{\"number\":1,\"title\":\"Chapter Title\",\"wordCount\":2500,\"pages\":10}]\n\nRules:\n- Include Prologue, Epilogue, and all numbered/named chapters\n- Use exact titles as written in the book\n- wordCount = actual word count of that chapter body text\n- pages = number of pages that chapter spans\n- Exclude: TOC, copyright, dedication, acknowledgments, about the author\n- Return ONLY the JSON array" },
          ],
        }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text ?? "";
    const chapters = JSON.parse(text.replace(/```json|```/g, "").trim());

    if (!Array.isArray(chapters) || !chapters.length) throw new Error("No chapters returned");

    await supabase.from("pdf_jobs").update({ status: "done", chapters }).eq("id", jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("pdf_jobs").update({ status: "error", error: msg }).eq("id", jobId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}