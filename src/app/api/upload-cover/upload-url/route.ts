import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildR2PublicUrl, r2, R2_BUCKETS, R2_PREFIXES } from "@/lib/r2";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or AVIF images are allowed" }, { status: 400 });
    }

    const extension = filename.split(".").pop()?.toLowerCase() || "jpg";
    const baseName = slugify(filename);
    const key = `${R2_PREFIXES.bookCovers}${baseName}-${Date.now()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKETS.media.name,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    const publicUrl = buildR2PublicUrl(R2_BUCKETS.media.publicBaseUrl, key);

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (e) {
    console.error("[upload-cover/upload-url]", e);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
