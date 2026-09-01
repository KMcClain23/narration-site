import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { readManuscriptSource } from "@/lib/manuscript-source";

/**
 * The manuscript's source file, streamed back for the page viewer.
 *
 * ── THE COMMENT THIS REPLACES WAS FALSE ────────────────────────────────────
 *
 * It said: "Proxied rather than handed out as a signed URL: the bucket stays
 * private, the admin cookie remains the only key." The first clause was not
 * true. The R2 key column — now named `legacy_r2_key` for exactly this reason
 * — pointed into R2_BUCKETS.media, the same bucket as
 * book-covers/ and branding/ — which has R2_MEDIA_PUBLIC_BASE_URL configured
 * and answers an UNCREDENTIALED GET with 206 and the actual PDF bytes. It was
 * checked before this change and it returned `%PDF-`.
 *
 * The proxy concealed the key. It never protected the object. Anyone who had
 * ever seen a key — or guessed a listing — could read an unpublished manuscript
 * with no credentials at all.
 *
 * ── SO ONEDRIVE IS THE STORE OF RECORD NOW ─────────────────────────────────
 *
 * The scripts live in Scripts/ on the same drive as the audio, reached by the
 * app-only Graph token that has no public surface. Bytes are read BY ITEM ID,
 * which survives a rename or a move; source_path is display only and is never
 * resolved.
 *
 * R2 IS STILL READ AS A FALLBACK, and that is deliberate rather than lazy: a
 * manuscript uploaded through the old path, or one whose OneDrive copy has not
 * been linked yet, must still open. The fallback says which store answered in
 * a response header so a row that is quietly still on the old path is visible
 * rather than assumed migrated.
 *
 * The reading itself lives in manuscript-source.ts, because four routes needed
 * it and four copies is how three of them would have been left behind.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("source_item_id, source_path, legacy_r2_key, source_format, title")
    .eq("id", id)
    .single();

  if (!manuscript) {
    return NextResponse.json({ error: "No such manuscript." }, { status: 404 });
  }

  const type =
    manuscript.source_format === "pdf"
      ? "application/pdf"
      : manuscript.source_format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";

  const send = (bytes: Uint8Array, store: string) =>
    new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        // WHICH STORE ANSWERED. A row still being served from R2 after the
        // migration is a fact worth being able to see without reading the table.
        "X-Manuscript-Source": store,
        // Private: this is an unpublished manuscript, not a public asset.
        "Cache-Control": "private, max-age=3600",
      },
    });

  const source = await readManuscriptSource(manuscript);
  if ("failed" in source) return NextResponse.json({ error: source.failed }, { status: 502 });
  if ("gone" in source) return NextResponse.json({ error: source.gone }, { status: 410 });
  return send(source.bytes, source.store);
}
