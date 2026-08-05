import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKETS, R2_PREFIXES } from "@/lib/r2";
import { sanitizeName } from "@/lib/sanitize-name";

// Same bucket, client, and presigned-PUT pattern as /api/upload-person-photo/upload-url.
const ALLOWED_TYPES: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();

    const format = ALLOWED_TYPES[contentType];
    if (!format) {
      return NextResponse.json({ error: "Only PDF or DOCX files are allowed" }, { status: 400 });
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
