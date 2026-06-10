import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Authoritative public CDN base for narration-demos bucket.
// Falls back to env var; env var should match this value.
const PUBLIC_BASE =
  process.env.R2_DEMOS_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();

    const allowed = new Set(["audio/mpeg", "audio/mp3", "audio/x-mp3"]);
    if (!allowed.has(contentType) && !filename.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json({ error: "Only MP3 files are allowed" }, { status: 400 });
    }

    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key  = `demos/${Date.now()}-${safe}`;

    const command = new PutObjectCommand({
      Bucket:      process.env.R2_DEMOS_BUCKET_NAME!,
      Key:         key,
      ContentType: "audio/mpeg",
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    const publicUrl = `${PUBLIC_BASE}/${key}`;

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (e) {
    console.error("[demos/upload-url]", e);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
