import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { buildR2PublicUrl, r2, R2_BUCKETS, R2_PREFIXES } from "@/lib/r2";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const originalName = file.name;
    const extension = originalName.split(".").pop()?.toLowerCase() || "jpg";
    const baseName = slugify(originalName);
    const fileName = `${baseName}-${Date.now()}.${extension}`;
    const objectKey = `${R2_PREFIXES.bookCovers}${fileName}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKETS.media.name,
        Key: objectKey,
        Body: buffer,
        ContentType: file.type || "image/jpeg",
      })
    );

    const coverUrl = buildR2PublicUrl(
      R2_BUCKETS.media.publicBaseUrl,
      objectKey
    );

    return NextResponse.json({
      success: true,
      coverUrl,
      objectKey,
    });
  } catch (error) {
    console.error("POST /api/upload-cover failed:", error);

    return NextResponse.json(
      {
        error: "Failed to upload cover.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}