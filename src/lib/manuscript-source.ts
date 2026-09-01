import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKETS } from "@/lib/r2";
import { DRIVE_USER, graphAppToken } from "@/lib/pickup-graph";

/**
 * A manuscript's source bytes, from wherever they actually live.
 *
 * ── ONE READER, BECAUSE THERE WERE FOUR CALLERS ────────────────────────────
 *
 * The parse route, the viewer route, the delete route and the upload route each
 * had their own idea of where a manuscript's bytes were, all of them
 * `source_r2_key` against a bucket that turned out to be public. Moving the
 * store with four copies of the read would have moved three of them.
 *
 * ── ONEDRIVE FIRST, BY ID ──────────────────────────────────────────────────
 *
 * `source_item_id` is the durable address: it survives a rename and a move,
 * which is exactly what a file sitting in a folder Dean works in will get. The
 * recorded path is for display and diagnosis and is never resolved.
 *
 * ── THREE OUTCOMES, KEPT APART ─────────────────────────────────────────────
 *
 *   { bytes, store }   it was read
 *   { gone: … }        Graph gave a definite 404/410 — the file is not there
 *   { failed: … }      the lookup could not be made, which says NOTHING about
 *                      whether the file exists
 *
 * Collapsing the last two is the failure this codebase keeps finding. A parse
 * that reported "no source file" during a Graph outage would mark a manuscript
 * failed and leave somebody re-uploading a book that was never missing.
 */
export type ManuscriptSource = { source_item_id: string | null; source_r2_key: string | null };

export type SourceResult =
  | { bytes: Uint8Array; store: "onedrive" | "r2-legacy" }
  | { gone: string }
  | { failed: string };

export async function readManuscriptSource(m: ManuscriptSource): Promise<SourceResult> {
  if (m.source_item_id) {
    try {
      const token = await graphAppToken();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive/items/` +
          `${encodeURIComponent(m.source_item_id)}/content`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        return { bytes: new Uint8Array(await res.arrayBuffer()), store: "onedrive" };
      }
      if (res.status === 404 || res.status === 410) {
        // DEFINITE. Not retried against a stale R2 copy, which may be a
        // different draft of the same book — a silently older manuscript is
        // worse than an honest failure.
        return { gone: "The script is no longer in OneDrive. Re-link it from Scripts/." };
      }
      return { failed: `OneDrive answered ${res.status}` };
    } catch (e) {
      return { failed: `OneDrive unreachable: ${String(e).slice(0, 160)}` };
    }
  }

  /* Rows uploaded before the move. Read, never written. */
  if (!m.source_r2_key) return { gone: "No source file is linked for this manuscript." };
  try {
    const obj = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: m.source_r2_key }),
    );
    if (!obj.Body) return { gone: "The stored source file is empty." };
    return { bytes: await obj.Body.transformToByteArray(), store: "r2-legacy" };
  } catch (e) {
    // R2 does not distinguish these as cleanly as Graph does; NoSuchKey is the
    // only definite one.
    const name = (e as { name?: string }).name ?? "";
    return name === "NoSuchKey" || name === "NotFound"
      ? { gone: "The stored source file no longer exists." }
      : { failed: `Storage error: ${name || String(e).slice(0, 120)}` };
  }
}
