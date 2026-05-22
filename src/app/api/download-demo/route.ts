import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const name = req.nextUrl.searchParams.get("name") ?? "demo";

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Only proxy files from our own R2 bucket
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }
  if (parsed.origin !== ALLOWED_ORIGIN) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return new NextResponse("Failed to fetch audio", { status: 502 });
  }

  const filename = `Dean Miller - ${name}.mp3`;
  const headers = new Headers();
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { status: 200, headers });
}
