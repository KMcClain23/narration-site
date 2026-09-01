import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { DRIVE_USER, graphAppToken } from "@/lib/pickup-graph";

/**
 * The manuscript's source file, streamed back for the page viewer.
 *
 * ── THE COMMENT THIS REPLACES WAS FALSE ────────────────────────────────────
 *
 * It said: "Proxied rather than handed out as a signed URL: the bucket stays
 * private, the admin cookie remains the only key." The first clause was not
 * true. `source_r2_key` pointed into R2_BUCKETS.media — the same bucket as
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
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const { data: manuscript } = await supabaseAdmin
    .from("manuscripts")
    .select("source_item_id, source_path, source_r2_key, source_format, title")
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

  /* ── OneDrive first, by id ─────────────────────────────────────────────── */
  if (manuscript.source_item_id) {
    try {
      const token = await graphAppToken();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive/items/` +
          `${encodeURIComponent(manuscript.source_item_id)}/content`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        return send(new Uint8Array(await res.arrayBuffer()), "onedrive");
      }
      // 404/410 mean the script has been moved out or deleted. That is a
      // definite answer and it is said as one — not silently retried against a
      // stale R2 copy that may be a different draft.
      if (res.status === 404 || res.status === 410) {
        return NextResponse.json(
          {
            error:
              `The script is no longer in OneDrive at ${manuscript.source_path ?? "its recorded location"}. ` +
              `It has been moved or deleted; re-link it from Scripts/.`,
          },
          { status: 410 },
        );
      }
      // Anything else is "could not find out", and falls through to the
      // fallback rather than declaring the file gone.
      console.error(`manuscript ${id}: Graph ${res.status}`);
    } catch (e) {
      console.error(`manuscript ${id}: Graph unreachable — ${String(e).slice(0, 160)}`);
    }
  }

  /* ── R2, only for rows not yet moved ───────────────────────────────────── */
  if (!manuscript.source_r2_key) {
    return NextResponse.json(
      {
        error: manuscript.source_item_id
          ? "The script could not be read from OneDrive just now. Try again in a moment."
          : "No source file is linked for this manuscript.",
      },
      { status: manuscript.source_item_id ? 502 : 404 },
    );
  }

  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: manuscript.source_r2_key }),
    );
    if (!obj.Body) return NextResponse.json({ error: "Source file is empty." }, { status: 404 });
    return send(await obj.Body.transformToByteArray(), "r2-legacy");
  } catch {
    return NextResponse.json({ error: "Could not read the source file." }, { status: 502 });
  }
}
