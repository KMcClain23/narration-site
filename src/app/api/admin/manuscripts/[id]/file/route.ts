import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { r2, R2_BUCKETS } from "@/lib/r2";

/**
 * The uploaded source file, streamed back for the page viewer.
 *
 * Proxied rather than handed out as a signed URL: the bucket stays private,
 * the admin cookie remains the only key, and a link copied out of the network
 * tab is worth nothing to anyone without it. Manuscripts are other people's
 * unpublished books.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("source_r2_key, source_format, title")
    .eq("id", id)
    .single();

  if (!manuscript?.source_r2_key) {
    return NextResponse.json({ error: "No source file for this manuscript." }, { status: 404 });
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: manuscript.source_r2_key }),
    );
    if (!obj.Body) return NextResponse.json({ error: "Source file is empty." }, { status: 404 });

    const bytes = await obj.Body.transformToByteArray();
    const type =
      manuscript.source_format === "pdf"
        ? "application/pdf"
        : manuscript.source_format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain";

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        // Private: this is an unpublished manuscript, not a public asset.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not read the source file." }, { status: 502 });
  }
}
