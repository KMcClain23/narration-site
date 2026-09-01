import {
  chapterMatches, clipWindow, isHeader, parseWavHeader, timestampToSeconds,
  to16Bit, wavHeaderFor,
} from "./wav.ts";

/**
 * Step 6 of the send: a ±10 second clip per pickup, cut from the book's
 * combined chapter file.
 *
 * ── NOTHING IN HERE MAY BLOCK A SEND ───────────────────────────────────────
 *
 * By the time this runs the emails are out and the pickups are already SENT.
 * Every failure becomes a `clip_skip_reason` on the row and a line in the
 * outcome report, and the narrator gets the email either way. The email is the
 * delivery; the clip is an enhancement — the same asymmetry as steps 4 and 5,
 * written the same way on purpose.
 *
 * ── RANGE REQUESTS, NOT A DECODER ──────────────────────────────────────────
 *
 * PCM WAV is constant-rate, so byte offset is time. The header comes from a
 * ~4 KB Range read and the window from a second one — measured at 1.68 MB out
 * of a 126 MB chapter. wav.ts holds the arithmetic and the reasons.
 */

/** How much either side of the timestamp. */
export const CLIP_PAD_SECONDS = 10;

/** Every way a clip can be absent. Each one describes a normal send. */
export type ClipSkip =
  | "no_source_folder"
  | "no_chapter_match"
  | "ambiguous_chapter_match"
  | "not_wav"
  | "unreadable_header"
  | "timestamp_past_end"
  | "graph_unavailable";

export type ClipOutcome = {
  pickup: string;
  at: string;
  path?: string;
  seconds?: number;
  clamped?: "start" | "end";
  skip?: ClipSkip;
  detail?: string;
};

const DRIVE = "https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive";
const byPath = (p: string) =>
  `${DRIVE}/root:/${p.split("/").map(encodeURIComponent).join("/")}`;

/**
 * A non-200 is a FAILURE, never an empty list.
 *
 * Drive-wide search once returned 403 here and a `?? []` turned a permission
 * problem into "no results", which was then reported as evidence of absence.
 * 404 is the one status that genuinely means "not there" and it is returned as
 * null so the caller can tell the two apart.
 */
async function graphJson(token: string, url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`graph ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return await res.json();
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export async function cutClips(
  token: string,
  admin: {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<unknown>;
        in: (c: string, v: string[]) => Promise<unknown>;
      };
    };
  },
  card: { title: string; audioFolderItemId: string | null; bookSegment: string },
  chapter: string,
  narratorSegment: string,
  rows: Array<{ id: string; timestamp_at: string }>,
  sanitiseSegment: (s: string) => string,
): Promise<ClipOutcome[]> {
  const out: ClipOutcome[] = [];

  const skipAll = async (skip: ClipSkip, detail?: string): Promise<ClipOutcome[]> => {
    await admin.from("pickups").update({ clip_skip_reason: skip }).in("id", rows.map(r => r.id));
    for (const r of rows) out.push({ pickup: r.id, at: r.timestamp_at, skip, detail });
    return out;
  };

  /*
    THE BOOK SUBFOLDER IS LOAD-BEARING.

    A flat Spliced/ makes "Chapter 23.wav" ambiguous across the eight books in
    editing, and cutting twenty seconds from the wrong book sounds like a bad
    take rather than a bug — the narrator re-records against it before anyone
    notices. So a file sitting in Spliced/ root is never a fallback: no book
    folder means no clips, cleanly. That folder appearing is the signal the book
    has entered this workflow.
  */
  if (!card.audioFolderItemId) return await skipAll("no_source_folder");

  let children: Array<{ id: string; name: string; size: number }>;
  try {
    const listed = await graphJson(
      token,
      `${DRIVE}/items/${card.audioFolderItemId}/children?$top=400&$select=id,name,size,file`,
    );
    if (listed === null) return await skipAll("no_source_folder", "the folder no longer exists");
    children = ((listed.value ?? []) as Array<Record<string, unknown>>)
      .filter(c => c.file)
      .map(c => ({ id: c.id as string, name: c.name as string, size: Number(c.size ?? 0) }));
  } catch (e) {
    return await skipAll("graph_unavailable", String(e).slice(0, 150));
  }

  // ONE MATCH PROCEEDS. Zero or many is a stated skip, never a best guess.
  const matches = children.filter(c => chapterMatches(c.name, chapter));
  if (matches.length === 0) return await skipAll("no_chapter_match");
  if (matches.length > 1) {
    return await skipAll("ambiguous_chapter_match", matches.map(m => m.name).join(", "));
  }
  const source = matches[0];
  if (!/\.wav$/i.test(source.name)) return await skipAll("not_wav", source.name);

  // ── the header, once per chapter rather than once per pickup ────────────
  let header: ReturnType<typeof parseWavHeader> | undefined;
  try {
    let want = 4096;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${DRIVE}/items/${source.id}/content`, {
        headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${want - 1}` },
      });
      if (!res.ok && res.status !== 206) throw new Error(`head ${res.status}`);
      const parsed = parseWavHeader(new Uint8Array(await res.arrayBuffer()), source.size);
      if (isHeader(parsed)) { header = parsed; break; }
      if ("error" in parsed) return await skipAll("unreadable_header", parsed.error);
      want = parsed.need;
    }
  } catch (e) {
    return await skipAll("graph_unavailable", String(e).slice(0, 150));
  }
  if (!header || !isHeader(header)) {
    return await skipAll("unreadable_header", "no data chunk in the first 256 KB");
  }
  const head = header;

  // ── one clip per pickup ─────────────────────────────────────────────────
  for (const row of rows) {
    const at = timestampToSeconds(row.timestamp_at);
    if (at === null) {
      await admin.from("pickups")
        .update({ clip_skip_reason: "timestamp_past_end" }).eq("id", row.id);
      out.push({
        pickup: row.id, at: row.timestamp_at, skip: "timestamp_past_end",
        detail: `could not be read as a timestamp`,
      });
      continue;
    }

    const window = clipWindow(head, at, CLIP_PAD_SECONDS);
    if ("pastEnd" in window) {
      /*
        NOT CLAMPED, REPORTED. A timestamp past the end means the timestamp and
        the file disagree about which take is current — most likely the chapter
        was re-spliced shorter after the pickup was written. Clamping would hide
        that behind a clip of the last ten seconds, which is a plausible wrong
        answer and the worst kind.
      */
      await admin.from("pickups")
        .update({ clip_skip_reason: "timestamp_past_end" }).eq("id", row.id);
      out.push({
        pickup: row.id, at: row.timestamp_at, skip: "timestamp_past_end",
        detail: `past the end of the file, which runs ${mmss(window.durationSeconds)}`,
      });
      continue;
    }

    try {
      const res = await fetch(`${DRIVE}/items/${source.id}/content`, {
        headers: { Authorization: `Bearer ${token}`, Range: `bytes=${window.start}-${window.end}` },
      });
      if (!res.ok && res.status !== 206) throw new Error(`window ${res.status}`);
      const raw = new Uint8Array(await res.arrayBuffer());

      const { bytes, bits } = to16Bit(raw, head.bits);
      const wavHead = wavHeaderFor({ ...head, bits }, bytes.length);
      const clip = new Uint8Array(wavHead.length + bytes.length);
      clip.set(wavHead);
      clip.set(bytes, wavHead.length);

      const name = `${sanitiseSegment(`${chapter} - ${row.timestamp_at} clip`)}.wav`;
      const folder = `Pickups/${card.bookSegment}/${narratorSegment}`;
      // rename, not replace: a second send of the same chapter must not
      // overwrite a clip a narrator may already be listening to.
      const put = await fetch(
        `${byPath(`${folder}/${name}`)}:/content?@microsoft.graph.conflictBehavior=rename`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
          body: clip,
        },
      );
      if (!put.ok) throw new Error(`put ${put.status}: ${(await put.text()).slice(0, 120)}`);
      const made = await put.json();

      const seconds = Number((window.toSeconds - window.fromSeconds).toFixed(2));
      await admin.from("pickups").update({
        clip_item_id: made.id ?? null,
        clip_web_url: made.webUrl ?? null,
        // The name Graph ACTUALLY used. conflictBehavior=rename may suffix it,
        // and recording the requested name would be a lie after that.
        clip_path: `${folder}/${made.name ?? name}`,
        clip_seconds: seconds,
        clip_cut_at: new Date().toISOString(),
        clip_skip_reason: null,
      }).eq("id", row.id);

      out.push({
        pickup: row.id,
        at: row.timestamp_at,
        path: `${folder}/${made.name ?? name}`,
        seconds,
        clamped: window.clampedStart ? "start" : window.clampedEnd ? "end" : undefined,
      });
    } catch (e) {
      await admin.from("pickups")
        .update({ clip_skip_reason: "graph_unavailable" }).eq("id", row.id);
      out.push({
        pickup: row.id, at: row.timestamp_at,
        skip: "graph_unavailable", detail: String(e).slice(0, 150),
      });
    }
  }
  return out;
}
