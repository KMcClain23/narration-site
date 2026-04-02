import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

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
    const extension = originalName.split(".").pop()?.toLowerCase() || "png";
    const safeBaseName = slugify(originalName);
    const fileName = `${safeBaseName}.${extension}`;

    const coversDir = path.join(process.cwd(), "public", "covers");
    const savePath = path.join(coversDir, fileName);

    await fs.mkdir(coversDir, { recursive: true });
    await fs.writeFile(savePath, buffer);

    return NextResponse.json({
      success: true,
      coverPath: `/covers/${fileName}`,
    });
  } catch (error) {
    console.error("POST /api/upload-cover failed:", error);

    return NextResponse.json(
      { error: "Failed to upload image." },
      { status: 500 }
    );
  }
}