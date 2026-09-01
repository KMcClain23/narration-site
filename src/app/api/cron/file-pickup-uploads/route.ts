import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyEditorsOfFiling } from "@/lib/notify-filed";
import { chapterDir, sanitiseSegment, takeName } from "@/lib/pickup-paths";
import { cutClips, type ClipOutcome } from "@/lib/pickup-clip-cutter";
import { watchSpliced, type SplicedReport } from "@/lib/spliced-watch";
import {
  QUARANTINE_ROOT,
  childrenById,
  deleteInsideQuarantine,
  graphAppToken,
  itemById,
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

/** Abandoned quarantine items older than this are debris, not work in progress. */
const ORPHAN_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * ── RE-ENABLED 2026-08-31, AFTER THE INVESTIGATION CLEARED IT ──────────────
 *
 * This was disabled while two manifests were missing from a book folder and the
 * cause was open. The recycle bin settled it: both were "Deleted by: Dean
 * Miller" — his own account — while every row this app touched is attributed to
 * "SharePoint App". The sweep never touched them.
 *
 * The containment work done during the investigation stays (see
 * deleteInsideQuarantine): it was not the fix for a bug, it is a bound worth
 * having. The decoy test is what backs it — a file planted in a real book folder
 * survives a run, while a genuine orphan inside _incoming is still deleted, so
 * the sweep is contained rather than merely inert.
 */

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const isInternal =
    !!process.env.ADMIN_SECRET_KEY && auth === `Bearer ${process.env.ADMIN_SECRET_KEY}`;
  if (!isCron && !isInternal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    id: string; link_id: string; quarantine_path: string; original_name: string;
    content_type: string; book_title: string; pickups_folder: string | null;
    chapter: string; narrator_name: string; attempts: number; card_id: string;
  }[];

  /** Filed count per batch this run, so five files produce ONE email naming five. */
  const filedPerLink = new Map<string, number>();

  const filed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const ext = row.quarantine_path.split(".").pop() ?? "bin";
      const book = row.pickups_folder ?? sanitiseSegment(row.book_title);
      // A CHAPTER LEVEL, so a narrator folder does not accumulate 23 chapters'
      // worth of loose files. The prefix says what kind of file it is.
      const folder = chapterDir(book, row.narrator_name, row.chapter);
      const name = takeName(row.original_name, ext);

      // moveItem suffixes rather than overwriting, and returns the path it
      // actually used — the requested one would be a lie after a suffix — plus
      // the item id and webUrl from the move response.
      const moved = await moveItem(graph, row.quarantine_path, folder, name);

      /*
        THE LOCATOR IS STORED AT FILING TIME, because this is the only moment it
        is free. The move response IS the item, so id and webUrl cost no extra
        call; going back for them later means a lookup that can fail, on a file
        that may by then be gone.

        The path is still recorded, and is still not an address. filed_at says
        the file was PLACED there — see mark_upload_filed — and the one row in
        this table was filed to a path whose file Dean has since deleted. Only
        the item id can be resolved at click time to find out which.
      */
      await supabaseAdmin.rpc("mark_upload_filed", {
        p_id: row.id,
        p_path: moved.path,
        p_item_id: moved.id,
        p_web_url: moved.webUrl,
      });

      // The book folder, one level up. Recorded from the same run because
      // pickups_folder holds a NAME and cannot address anything after a rename.
      // Best effort: a failure here must not un-file a file that did move.
      if (row.card_id) {
        const { error: folderErr } = await supabaseAdmin.rpc("record_pickups_folder", {
          p_card_id: row.card_id,
          p_item_id: moved.folder.id,
          p_web_url: moved.folder.webUrl,
        });
        if (folderErr) console.warn(`could not record folder locator: ${folderErr.message}`);
      }

      filed.push(moved.path);
      filedPerLink.set(row.link_id, (filedPerLink.get(row.link_id) ?? 0) + 1);
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

  /*
    ── RE-VERIFY WHAT IS ALREADY FILED ──────────────────────────────────────

    filed_at records that a file was PLACED in the book's folder. Nothing
    re-checks, so the hub badge could offer a take that had been deleted months
    ago — which it did, for the one real row in the table.

    The resolver learns the truth at click time, but a take nobody clicks stays
    unverified indefinitely, and "correct once somebody has already been misled"
    is not correct. One Graph lookup per filed upload, bounded, once a cycle.

    ONLY A DEFINITE ANSWER IS WRITTEN DOWN. 404, 410 or a deleted facet stamps
    missing_since; a resolve clears it, so a restore from the recycle bin heals
    the row. A THROW — token, network, throttling, 5xx — writes NOTHING and
    leaves the row exactly as it was. Marking every take missing because Graph
    was briefly unreachable would be the error-as-absence collapse in the most
    expensive place this codebase has one.
  */
  const verified = { checked: 0, nowMissing: 0, cameBack: 0, unknown: 0 };
  try {
    const { data: toVerify } = await supabaseAdmin.rpc("filed_uploads_to_verify", { p_limit: 200 });
    for (const row of (toVerify ?? []) as {
      id: string; onedrive_item_id: string; missing_since: string | null;
    }[]) {
      verified.checked++;
      try {
        const item = await itemById(graph, row.onedrive_item_id);
        if (item === null || item.deleted) {
          if (!row.missing_since) {
            await supabaseAdmin.rpc("mark_upload_missing", { p_id: row.id });
            verified.nowMissing++;
          }
        } else if (row.missing_since) {
          await supabaseAdmin.rpc("mark_upload_present", { p_id: row.id });
          verified.cameBack++;
        }
      } catch {
        // Could not find out. NOT absence — the row is left alone.
        verified.unknown++;
      }
    }
  } catch (e) {
    // The whole pass failing must not touch a single row's state.
    sweepErrors.push(`verify: ${(e as Error).message.slice(0, 150)}`);
  }

  /*
    ── CUT THE CLIPS THAT DID NOT CUT ───────────────────────────────────────

    Clips were cut once, at send, and never again — so a spliced file still
    uploading when Send was pressed cost that batch its clips permanently.
    Measured: chapter 23's source became visible NINE MINUTES after the send,
    chapter 5's seventy-two seconds after, and chapter 6 — the only batch with
    clips — won by eleven seconds.

    The gate on Send now prevents the common case. This catches what it misses:
    a file visible to the check but not yet fully readable, a source folder set
    after the fact, a Graph blip. The same shape the upload path already has —
    land now, file later, attempts recording progress.

    RETRYABLE ONLY. pickups_needing_clips excludes not_wav, unreadable_header,
    ambiguous_chapter_match and timestamp_past_end, because none of them are
    fixed by waiting and the last is a real finding that must stay visible.
  */
  const clipsCut: ClipOutcome[] = [];
  try {
    const { data: pending } = await supabaseAdmin.rpc("pickups_needing_clips", { p_limit: 50 });
    const rows = (pending ?? []) as {
      id: string; card_id: string; chapter: string; timestamp_at: string;
      narrator_name: string; book_title: string;
      pickups_folder: string | null; audio_folder_item_id: string | null;
    }[];

    // Grouped by (card, chapter, narrator): the cutter reads the chapter's
    // header ONCE per group rather than once per pickup.
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.card_id}|${r.chapter}|${r.narrator_name}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }

    for (const group of groups.values()) {
      const first = group[0];
      const cut = await cutClips(
        graph,
        supabaseAdmin,
        {
          title: first.book_title,
          audioFolderItemId: first.audio_folder_item_id,
          bookSegment: first.pickups_folder ?? sanitiseSegment(first.book_title),
        },
        first.chapter,
        sanitiseSegment(first.narrator_name),
        group.map(r => ({ id: r.id, timestamp_at: r.timestamp_at })),
      );
      clipsCut.push(...cut);
    }
  } catch (e) {
    // Clip retry failing must not touch the filing that already succeeded.
    sweepErrors.push(`clips: ${(e as Error).message.slice(0, 150)}`);
  }

  // ── STATE FIRST, THEN EMAIL — the THIRD place these two orderings sit side
  //    by side, and the third different reason. ────────────────────────────
  //
  //   send-pickups  emails FIRST and flips to `sent` only on acceptance, so a
  //                 pickup can never claim an email that did not go. There, the
  //                 email IS the delivery.
  //   confirm       flips to `returned` FIRST, then emails: Ann's re-record
  //                 actually happened and must be recorded either way.
  //   HERE          the file is already MOVED. It is sitting in the book's
  //                 folder. Nothing about a failed email makes that untrue, and
  //                 "un-filing" it to keep a message tidy would delete a fact
  //                 about the drive to preserve a notification. So: log, keep
  //                 the file where it is, and leave filed_at/onedrive_path
  //                 exactly as they are.
  //
  // One call per BATCH, not per file.
  const notified: { linkId: string; outcome: string }[] = [];
  for (const [linkId, count] of filedPerLink) {
    const outcome = await notifyEditorsOfFiling(linkId, count);
    if ("failed" in outcome) {
      console.error(`filed notification failed for ${linkId} (${count} file(s)):`, outcome.failed);
    }
    notified.push({ linkId, outcome: JSON.stringify(outcome) });
  }

  /*
    ── NOTICE WHAT DEAN SPLICED ─────────────────────────────────────────────

    Last, and in its own try, because it is the only part of this route that
    tells somebody something rather than moving their files. A Graph delta
    failure must not cost the filing that already succeeded above.
  */
  let spliced: SplicedReport = { announced: [], waiting: [], skipped: [] };
  try {
    spliced = await watchSpliced(supabaseAdmin, await graphAppToken());
  } catch (e) {
    spliced.error = String(e).slice(0, 300);
  }

  return NextResponse.json({
    spliced,
    filed: filed.length,
    failed: failed.length,
    swept,
    verified,
    clips: {
      attempted: clipsCut.length,
      cut: clipsCut.filter(c => c.path).length,
      skipped: clipsCut.filter(c => c.skip).map(c => `${c.at}: ${c.skip}`),
    },
    notified,
    paths: filed,
    errors: failed,
    sweepErrors,
  });
}
