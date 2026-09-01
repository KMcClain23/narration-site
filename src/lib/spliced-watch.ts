import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DRIVE_USER } from "@/lib/pickup-graph";
import { chapterMatches, isAudioFile, isHeader, parseWavHeader } from "@/lib/wav";

/**
 * Notice when a chapter gets spliced, and say so.
 *
 * ── WHY DELTA AND NOT A WEBHOOK ────────────────────────────────────────────
 *
 * A webhook needs a public endpoint, a validation handshake, and renewal every
 * few days, for no gain over the sweep that already runs every ten minutes.
 * Ten-minute latency is fine for "chapter 5 is ready". `/drive/root/delta`
 * already works with this app registration — it was what enumerated the drive
 * during the missing-manifest investigation.
 *
 * ── THE FIRST RUN MUST BE SILENT ───────────────────────────────────────────
 *
 * There are already files sitting in Spliced/. A cursor initialised by reading
 * everything would announce every one of them as new, which is the worst
 * possible first impression of a feature whose whole job is to tell you
 * something happened. `?token=latest` returns a position and NO items: the
 * baseline is taken without enumerating, so everything already there is behind
 * the cursor by construction rather than by a filter that has to be right.
 *
 * ── "SPLICED" MUST MEAN "CAN BE CUT FROM" ──────────────────────────────────
 *
 * The send gate's predicate is a folder listing, and a listing shows a file that
 * is still uploading. Telling Dean chapter 5 is ready and having his Send fail
 * anyway recreates the exact race this whole area started with — so readable
 * here means the bytes actually come back AND parse as a WAV header, which is
 * precisely what cutting a clip does. It is a deliberately stricter test than
 * the gate's, for a claim that is stronger than the gate's.
 *
 * A file that is not readable yet is not dropped: the cursor has already moved
 * past it, so it goes to `spliced_pending` and every later sweep re-checks it.
 * Without that queue a large upload would be spliced and never announced.
 *
 * ── AND IT MUST IGNORE THE SYSTEM'S OWN WRITES ─────────────────────────────
 *
 * The sweep files manifests, clips and takes into Pickups/ continuously. The
 * filter is by PARENT ITEM ID against the cards' own audio_folder_item_id — not
 * by path text, not by drive-wide name matching — so nothing this app writes can
 * ever be mistaken for a splice.
 */

const GRAPH = `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive`;
const SCOPE = "spliced";

/** Give up on an unreadable candidate after this. Long enough for a big upload. */
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type DeltaItem = {
  id: string;
  name?: string;
  file?: unknown;
  folder?: unknown;
  size?: number;
  deleted?: unknown;
  parentReference?: { id?: string };
  lastModifiedBy?: { user?: { displayName?: string } };
};

export type SplicedReport = {
  /** True on the very first run: a position was taken and nothing announced. */
  baseline?: { absorbed: string[]; note: string };
  announced: { book: string; chapter: string; file: string; pickupsWaiting: number }[];
  /** Seen, but the bytes are not servable yet. Re-checked next sweep. */
  waiting: { book: string; chapter: string; file: string; since: string }[];
  skipped: string[];
  error?: string;
};

/**
 * Is this file actually servable — not merely listed?
 *
 * THE SAME PARSE A CLIP CUT PERFORMS, on bytes fetched the same way. If this
 * cannot read the header the cutter cannot either, and "chapter 5 is spliced"
 * would be a promise the next Send breaks.
 *
 * parseWavHeader returns a union, not a null: `{ need }` means "ask for more
 * bytes", which for a file still committing is indistinguishable from a
 * truncated read — both mean not yet. Only a parsed header counts.
 */
async function readable(
  token: string, itemId: string, size: number,
): Promise<boolean> {
  const res = await fetch(`${GRAPH}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-4095" },
  });
  // 206 is the expected answer to a Range request; 416/404/503 all occur while
  // a large upload is still committing.
  if (!res.ok && res.status !== 206) return false;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 64) return false;
  // isHeader is the file's own type guard. Hand-checking for a key would drift
  // the day the shape changes, which is exactly what a guard is for.
  return isHeader(parseWavHeader(bytes, size));
}

/** Pickups on this chapter whose clips would be cut on the next sweep. */
async function pickupsWaiting(
  db: SupabaseClient, cardId: string, chapter: string,
): Promise<number> {
  const { count } = await db
    .from("pickups")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId)
    .eq("chapter", chapter)
    .in("status", ["sent", "returned"])
    .is("clip_item_id", null)
    // Retryable only: a permanent skip is not waiting on anything.
    .eq("clip_skip_final", false);
  return count ?? 0;
}

/**
 * One pass. Never throws — the sweep it lives in has other work, and a Graph
 * outage must not take the filing with it.
 */
export async function watchSpliced(
  db: SupabaseClient, token: string,
): Promise<SplicedReport> {
  const report: SplicedReport = { announced: [], waiting: [], skipped: [] };

  try {
    // The books whose spliced folder we know. Everything else on the drive,
    // including every folder this app writes to, is out of scope by omission.
    const { data: cards } = await db
      .from("board_cards")
      .select("id, title, audio_folder_item_id, chapters_total")
      .not("audio_folder_item_id", "is", null);
    const byFolder = new Map(
      (cards ?? []).map(c => [c.audio_folder_item_id as string, c]),
    );
    if (byFolder.size === 0) {
      report.skipped.push("no book has an audio folder recorded");
      return report;
    }

    const { data: cursorRow } = await db
      .from("graph_delta_cursors").select("cursor").eq("scope", SCOPE).maybeSingle();

    /* ── FIRST RUN: take a position, announce nothing ─────────────────── */
    if (!cursorRow) {
      const res = await fetch(`${GRAPH}/root/delta?token=latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        report.error = `baseline delta ${res.status}`;
        return report;
      }
      const body = await res.json();
      const link = String(body["@odata.deltaLink"] ?? "");
      if (!link) {
        report.error = "baseline delta returned no deltaLink";
        return report;
      }
      await db.from("graph_delta_cursors").upsert({ scope: SCOPE, cursor: link });

      // WHAT WAS ABSORBED, listed for the report only. Nothing is logged and no
      // event is written — this is the answer to "what did it decide not to
      // tell me about", which is the one thing a silent baseline owes you.
      const absorbed: string[] = [];
      for (const [folderId, card] of byFolder) {
        const kids = await fetch(
          `${GRAPH}/items/${folderId}/children?$top=400&$select=name,file`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!kids.ok) continue;
        for (const k of ((await kids.json()).value ?? []) as DeltaItem[]) {
          if (k.file && isAudioFile(String(k.name ?? ""))) {
            absorbed.push(`${card.title}/${k.name}`);
          }
        }
      }
      report.baseline = {
        absorbed,
        note:
          "First run. A position was taken with ?token=latest, which returns no items, " +
          "so everything already in these folders is behind the cursor and was not announced.",
      };
      return report;
    }

    /* ── EVERY OTHER RUN: what changed since ──────────────────────────── */
    let next = cursorRow.cursor;
    const candidates: DeltaItem[] = [];
    for (let page = 0; page < 25; page++) {
      const res = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        // A CURSOR CAN EXPIRE (410). Re-baselining silently is right: the
        // alternative is enumerating the whole drive and announcing all of it.
        if (res.status === 410) {
          const fresh = await fetch(`${GRAPH}/root/delta?token=latest`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fresh.ok) {
            const link = String((await fresh.json())["@odata.deltaLink"] ?? "");
            if (link) await db.from("graph_delta_cursors").upsert({ scope: SCOPE, cursor: link });
          }
          report.skipped.push("the delta cursor had expired; a new baseline was taken");
          return report;
        }
        report.error = `delta ${res.status}`;
        return report;
      }
      const body = await res.json();
      for (const item of (body.value ?? []) as DeltaItem[]) {
        if (item.deleted || item.folder || !item.file) continue;
        const parent = item.parentReference?.id;
        if (!parent || !byFolder.has(parent)) continue;   // the whole scope filter
        if (!isAudioFile(String(item.name ?? ""))) continue;
        candidates.push(item);
      }
      const link = String(body["@odata.deltaLink"] ?? "");
      const nextLink = String(body["@odata.nextLink"] ?? "");
      if (link) { next = link; break; }
      if (!nextLink) break;
      next = nextLink;
    }
    // The cursor advances whatever happens to the candidates: they are queued
    // below, so nothing is lost by moving on.
    await db.from("graph_delta_cursors")
      .upsert({ scope: SCOPE, cursor: next, updated_at: new Date().toISOString() });

    for (const item of candidates) {
      const card = byFolder.get(item.parentReference!.id!)!;
      const name = String(item.name ?? "");
      // Which chapter, by the same matcher the gate and the cutter use.
      const total = (card.chapters_total as number | null) ?? 0;
      const keys = Array.from({ length: Math.max(total, 60) }, (_, i) => String(i + 1));
      const chapter = keys.find(k => chapterMatches(name, k));
      if (!chapter) {
        report.skipped.push(`${card.title}/${name} — no chapter could be read from the name`);
        continue;
      }
      await db.from("spliced_pending").upsert({
        item_id: item.id,
        card_id: card.id,
        chapter,
        file_name: name,
        modified_by_name: item.lastModifiedBy?.user?.displayName ?? null,
        size: typeof item.size === "number" ? item.size : null,
      }, { onConflict: "item_id" });
    }

    /* ── the queue: announce what has become readable ─────────────────── */
    const { data: pending } = await db
      .from("spliced_pending")
      .select("item_id, card_id, chapter, file_name, modified_by_name, first_seen_at, attempts, size");

    for (const p of pending ?? []) {
      const card = (cards ?? []).find(c => c.id === p.card_id);
      const title = card?.title ?? "a book";

      if (Date.now() - new Date(p.first_seen_at).getTime() > PENDING_MAX_AGE_MS) {
        await db.from("spliced_pending").delete().eq("item_id", p.item_id);
        report.skipped.push(`${title}/${p.file_name} — never became readable, gave up`);
        continue;
      }

      let ok = false;
      let err: string | null = null;
      try {
        ok = await readable(token, p.item_id, p.size ?? 0);
      } catch (e) {
        err = String(e).slice(0, 200);
      }

      if (!ok) {
        await db.from("spliced_pending").update({
          last_checked_at: new Date().toISOString(),
          attempts: (p.attempts ?? 0) + 1,
          last_error: err,
        }).eq("item_id", p.item_id);
        report.waiting.push({
          book: title, chapter: p.chapter, file: p.file_name, since: p.first_seen_at,
        });
        continue;
      }

      const waiting = await pickupsWaiting(db, p.card_id, p.chapter);

      // THE EVENT. Written before the row is removed, so a failure here leaves
      // the candidate queued rather than losing it.
      const { error: logErr } = await db.rpc("log_activity", {
        p_card_id: p.card_id,
        p_kind: "chapter_spliced",
        p_detail: {
          chapter: p.chapter,
          file_name: p.file_name,
          pickups_waiting: waiting,
          // Graph's name, kept as a name. The folder is shared and Dean exports
          // into it himself, so this is frequently absent — recorded where it
          // exists, never guessed at.
          modified_by_name: p.modified_by_name ?? null,
        },
        p_actor: null,
      });
      if (logErr) {
        report.skipped.push(`${title}/${p.file_name} — the event could not be written`);
        continue;
      }

      await db.from("spliced_pending").delete().eq("item_id", p.item_id);
      report.announced.push({
        book: title, chapter: p.chapter, file: p.file_name, pickupsWaiting: waiting,
      });
    }
  } catch (e) {
    report.error = String(e).slice(0, 300);
  }

  return report;
}
