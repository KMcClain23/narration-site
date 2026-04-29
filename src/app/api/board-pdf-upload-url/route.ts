import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    const key = `tmp-manuscripts/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const bucket = process.env.R2_DEMOS_BUCKET_NAME!;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "application/pdf",
    });
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ uploadUrl, key, bucket });
  } catch (e) {
    console.error("[board-pdf-upload-url]", e);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}