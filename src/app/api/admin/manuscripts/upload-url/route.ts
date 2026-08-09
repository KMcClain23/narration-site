import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKETS, R2_PREFIXES } from "@/lib/r2";
import { sanitizeName } from "@/lib/sanitize-name";
import { requireAdmin } from "@/lib/require-admin";

// Same bucket, client, and presigned-PUT pattern as /api/upload-person-photo/upload-url.
const ALLOWED_TYPES: Record<string, "pdf" | "docx" | "txt"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { filename, contentType } = await req.json();

    // Browsers are inconsistent about the MIME type they report for .txt —
    // some send text/plain, others fall back to application/octet-stream or an
    // empty string. Content type alone would reject perfectly valid files, so
    // a .txt extension is accepted as its own signal. PDF and DOCX still go by
    // content type, which browsers report reliably for both.
    const format =
      ALLOWED_TYPES[contentType] ??
      (typeof filename === "string" && filename.toLowerCase().endsWith(".txt") ? "txt" : undefined);
    if (!format) {
      return NextResponse.json({ error: "Only PDF, DOCX, or TXT files are allowed" }, { status: 400 });
    }
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    const base = sanitizeName(filename.replace(/\.[^.]+$/, "")) || "manuscript";
    const key = `${R2_PREFIXES.manuscripts}${Date.now()}-${base}.${format}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKETS.media.name,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });

    return NextResponse.json({ uploadUrl, key, format });
  } catch (e) {
    console.error("[manuscripts/upload-url]", e);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
