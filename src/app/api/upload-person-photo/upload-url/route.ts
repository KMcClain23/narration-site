import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildR2PublicUrl, r2, R2_BUCKETS, R2_PREFIXES } from "@/lib/r2";
import { sanitizeName } from "@/lib/sanitize-name";
import { requireAdmin } from "@/lib/require-admin";

// Same bucket, client, and presigned-PUT pattern as /api/upload-cover/upload-url.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { personType, id, name, contentType } = await req.json();

    if (personType !== "author" && personType !== "co_narrator") {
      return NextResponse.json({ error: "personType must be 'author' or 'co_narrator'" }, { status: 400 });
    }
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or AVIF images are allowed" }, { status: 400 });
    }

    const prefix = personType === "author" ? R2_PREFIXES.authors : R2_PREFIXES.coNarrators;
    const key = `${prefix}${id}-${sanitizeName(name)}.jpg`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKETS.media.name,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
    const publicUrl = buildR2PublicUrl(R2_BUCKETS.media.publicBaseUrl, key);

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (e) {
    console.error("[upload-person-photo/upload-url]", e);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
