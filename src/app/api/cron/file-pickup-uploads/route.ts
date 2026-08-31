import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  QUARANTINE_ROOT,
  childrenById,
  deleteInsideQuarantine,
  graphAppToken,
  itemByPath,
  moveItem,
  quarantineFolder,
} from "@/lib/pickup-graph";

/**
 * Move verified audio out of quarantine into the book's folder, and clear the
 * debris. Out of band, on a cron.
 *
 * ── WHY THIS IS NOT PART OF ANN'S REQUEST ──────────────────────────────────
 *
 * Her upload landing IS the delivery. The move is internal plumbing, and
 * coupling the two would tell her the upload failed when it did not — she would
 * send the same take again.
 *
 * Same deliberate asymmetry as steps 4 and 5 of send-pickups: a failed email
 * must leave everything DRAFT, and a failed manifest must leave everything SENT.
 * Here, a failed move must leave the upload RECORDED, visible and retryable,
 * never rolled back. `attempts` and `last_error` are what make a stuck file
 * something you can look at rather than something that is merely absent.
 */

/** The forbidden set, exactly as the manifest already solves it. Two book titles contain colons. */
function sanitiseSegment(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Untitled";
}

/** Abandoned quarantine items older than this are debris, not work in progress. */
const ORPHAN_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * ── DISABLED 2026-08-31, PENDING AN INVESTIGATION ──────────────────────────
 *
 * Two manifests disappeared from Pickups/A Cowboy's Runaway/Ann Dahlia/ and the
 * cause is not yet established. This endpoint is the only thing in the system
 * that deletes from Dean's drive on a schedule, so it is off until the cause is
 * known — both halves, because the filing move writes to OneDrive too.
 *
 * It stays off unless PICKUP_SWEEP_ENABLED=1 is set deliberately. Re-enable only
 * with the decoy test in place (a manifest planted in a real book folder, the
 * sweep run, the manifest still there).
 */
const SWEEP_ENABLED = process.env.PICKUP_SWEEP_ENABLED === "1";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const isInternal =
    !!process.env.ADMIN_SECRET_KEY && auth === `Bearer ${process.env.ADMIN_SECRET_KEY}`;
  if (!isCron && !isInternal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Nothing touches the drive while the cause of the missing manifests is open.
  if (!SWEEP_ENABLED) {
    return NextResponse.json(
      {
        disabled: true,
        reason:
          "Filing and the orphan sweep are disabled pending the investigation into " +
          "two manifests deleted from a book folder. Set PICKUP_SWEEP_ENABLED=1 to re-enable.",
      },
      { status: 503 },
    );
  }

  let graph: string;
  try {
    graph = await graphAppToken();
  } catch (e) {
    // Every pending row fails for the same reason; record it on each rather than
    // returning early, so the rows show WHY they are still sitting there.
    const { data: pendingRows } = await supabaseAdmin.rpc("pending_pickup_uploads", { p_limit: 20 });
    for (const row of (pendingRows ?? []) as { id: string }[]) {
      await supabaseAdmin.rpc("mark_upload_failed", {
        p_id: row.id,
        p_error: `Graph token: ${(e as Error).message}`,
      });
    }
    return NextResponse.json(
      { error: "Graph unavailable", marked: (pendingRows ?? []).length },
      { status: 503 },
    );
  }

  // ── phase 2: move what has been verified ─────────────────────────────────
  const { data: pending, error } = await supabaseAdmin.rpc("pending_pickup_uploads", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (pending ?? []) as {
    id: string; quarantine_path: string; original_name: string; content_type: string;
    book_title: string; pickups_folder: string | null; chapter: string;
    narrator_name: string; attempts: number;
  }[];

  const filed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const ext = row.quarantine_path.split(".").pop() ?? "bin";
      const book = row.pickups_folder ?? sanitiseSegment(row.book_title);
      const folder = `Pickups/${book}/${sanitiseSegment(row.narrator_name)}`;
      const name = `${sanitiseSegment(`${row.chapter} - ${row.original_name}`)}.${ext}`;

      // moveItem suffixes rather than overwriting, and returns the path it
      // actually used — the requested one would be a lie after a suffix.
      const actual = await moveItem(graph, row.quarantine_path, folder, name);
      await supabaseAdmin.rpc("mark_upload_filed", { p_id: row.id, p_path: actual });
      filed.push(actual);
    } catch (e) {
      const message = (e as Error).message;
      await supabaseAdmin.rpc("mark_upload_failed", { p_id: row.id, p_error: message });
      failed.push({ id: row.id, error: message.slice(0, 200) });
    }
  }

  // ── orphans: sessions started and never completed ────────────────────────
  //
  // WALKED BY ITEM ID, NOT BY PATH, and every delete re-checks the item's own
  // parentReference against the quarantine root. Containment is a property of
  // the query now rather than of how carefully a path was assembled — after two
  // manifests went missing with no proven cause, "the path looked right" stopped
  // being an acceptable guarantee.
  //
  // Debris still lives in a VISIBLY NAMED folder rather than invisibly; it just
  // must not accumulate.
  let swept = 0;
  const sweepErrors: string[] = [];
  try {
    const root = await quarantineFolder(graph);
    if (root) {
      const { data: livePaths } = await supabaseAdmin.rpc("live_quarantine_paths");
      const live = new Set(
        ((livePaths ?? []) as { quarantine_path: string }[]).map(r => r.quarantine_path),
      );
      const cutoff = Date.now() - ORPHAN_AGE_MS;

      for (const folder of await childrenById(graph, root.id)) {
        if (!folder.folder) continue;
        const children = await childrenById(graph, folder.id);
        for (const child of children) {
          const path = `${QUARANTINE_ROOT}/${folder.name}/${child.name}`;
          if (live.has(path)) continue;
          if (new Date(child.createdDateTime).getTime() > cutoff) continue;
          await deleteInsideQuarantine(graph, child);
          swept++;
        }
        const remaining = await childrenById(graph, folder.id);
        if (remaining.length === 0 && new Date(folder.createdDateTime).getTime() < cutoff) {
          await deleteInsideQuarantine(graph, folder);
        }
      }
    }
  } catch (e) {
    // A failed sweep must not fail the filing that already succeeded — and a
    // REFUSED delete lands here, loudly, rather than being skipped in silence.
    sweepErrors.push((e as Error).message.slice(0, 200));
  }

  // A row whose quarantine item has vanished can never be filed; say so instead
  // of retrying it eight times.
  for (const row of rows) {
    if (filed.length && !failed.find(f => f.id === row.id)) continue;
    try {
      if (!(await itemByPath(graph, row.quarantine_path))) {
        await supabaseAdmin.rpc("mark_upload_rejected", {
          p_id: row.id,
          p_reason: "the quarantined file is no longer there",
        });
      }
    } catch {
      /* the next run will look again */
    }
  }

  return NextResponse.json({
    filed: filed.length,
    failed: failed.length,
    swept,
    paths: filed,
    errors: failed,
    sweepErrors,
  });
}
