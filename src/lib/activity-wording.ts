/**
 * An event, in words.
 *
 * ── ONE PLACE, BECAUSE EMAIL IS NEXT ───────────────────────────────────────
 *
 * The log page renders these today. Email reads the same table next, and push
 * after that. If the page did its wording inline, the first email would either
 * repeat every one of these sentences in a second file or say something
 * subtly different for the same event — and "Marizete marked chapter 7 done" on
 * screen against "chapter_done on card 37b4…" in an inbox is exactly the drift
 * this codebase keeps paying for. So the sentence lives here, once.
 *
 * ── IT IS PROSE, NOT A ROW DUMP ────────────────────────────────────────────
 *
 * Dean reads this. Not `chapter_done · card_id · uuid` — "Marizete marked
 * chapter 7 done". Every kind gets a real sentence, and an unrecognised kind
 * says so plainly rather than rendering an identifier and hoping.
 */

export type ActivityEvent = {
  id: string;
  card_id: string;
  book_title: string;
  kind: string;
  actor: string | null;
  actor_name: string | null;
  narrator_name: string | null;
  at: string;
  seq: number;
  detail: Record<string, unknown>;
};

/** Who did it, as a subject. Null actor is "not known" and never "the system". */
function who(e: ActivityEvent): string {
  if (e.actor_name) return e.actor_name;
  if (e.detail?.by === "narrator" && e.narrator_name) return e.narrator_name;
  if (e.narrator_name) return e.narrator_name;
  return "Someone";
}

const num = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** "chapter 7" for a number, the name itself for "Prologue". */
export function chapterPhrase(chapter: unknown): string {
  const c = str(chapter);
  if (!c) return "a chapter";
  return /^\d/.test(c.trim()) ? `chapter ${c.trim()}` : c.trim();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The whole sentence, minus the book — the page shows the title separately so a
 * feed filtered to one book does not repeat it on every line.
 */
export function describeActivity(e: ActivityEvent): string {
  const d = e.detail ?? {};
  const subject = who(e);

  switch (e.kind) {
    case "book_claimed":
      return `${subject} claimed this book for editing`;

    case "book_released":
      // An admin can release a book somebody else was holding, so the subject
      // and the person who lost the claim are not always the same.
      return `${subject} released this book`;

    case "editing_started":
      return `${subject} started editing`;

    case "chapter_done": {
      const done = num(d.chapters_done);
      const total = num(d.chapters_total);
      const progress = done !== null && total !== null ? ` (${done} of ${total})` : "";
      return `${subject} marked ${chapterPhrase(d.chapter)} done${progress}`;
    }

    case "chapter_undone":
      return `${subject} unmarked ${chapterPhrase(d.chapter)}`;

    case "pickup_raised":
      return `${subject} raised a pickup on ${chapterPhrase(d.chapter)}${
        str(d.timestamp_at) ? ` at ${str(d.timestamp_at)}` : ""
      }`;

    case "pickups_sent": {
      const n = num(d.count) ?? 0;
      return `${subject} sent ${plural(n, "pickup")} for ${chapterPhrase(d.chapter)}`;
    }

    case "pickup_returned": {
      const n = num(d.count) ?? 1;
      // The narrator did the recording either way; `by` says who pressed it.
      return d.by === "admin"
        ? `${subject} marked ${plural(n, "pickup")} on ${chapterPhrase(d.chapter)} re-recorded${
            e.narrator_name ? ` for ${e.narrator_name}` : ""
          }`
        : `${subject} re-recorded ${plural(n, "pickup")} on ${chapterPhrase(d.chapter)}`;
    }

    case "pickup_resolved":
      return d.resolution === "dismissed"
        ? `${subject} dismissed a pickup on ${chapterPhrase(d.chapter)}`
        : `${subject} verified and closed a pickup on ${chapterPhrase(d.chapter)}`;

    case "book_completed": {
      const open = num(d.open_pickups_at_completion);
      // THE WARNING SURVIVES INTO THE RECORD. If he completed a book with
      // corrections open, the log says so — that is the fact somebody will come
      // back to ask about, and the pickups table would only give today's answer.
      const caveat =
        open !== null && open > 0 ? ` with ${plural(open, "pickup")} still open` : "";
      return `${subject} marked this book complete and mastered${caveat}`;
    }

    case "status_changed": {
      const from = str(d.from_status);
      const to = str(d.to_status);
      const cleared = str(d.released_at_cleared);
      if (from && to && from !== to) {
        return `${subject} moved this book from ${from} to ${to}${
          cleared ? " (its release date was cleared and kept)" : ""
        }`;
      }
      return cleared
        ? `${subject} cleared this book's release date`
        : `${subject} changed this book's status${to ? ` to ${to}` : ""}`;
    }

    case "chapter_spliced": {
      const waiting = num(d.pickups_waiting);
      const base = `${chapterPhrase(d.chapter)} was spliced`;
      const by = e.actor_name ? ` by ${e.actor_name}` : "";
      // ACTIONABLE, not just informational.
      return waiting !== null && waiting > 0
        ? `${base}${by} — ${plural(waiting, "pickup")} waiting, their clips cut on the next sweep`
        : `${base}${by}`;
    }

    default:
      // AN UNKNOWN KIND SAYS SO. The database constrains `kind`, so this can
      // only mean a kind was added without a sentence — which should read as an
      // obvious omission, not as a plausible-looking line.
      return `${subject} did something this page has no wording for (${e.kind})`;
  }
}

/** A coarse grouping, for the dot colour. Not shown as text anywhere. */
export function activityTone(kind: string): "milestone" | "pickup" | "progress" | "neutral" {
  if (kind === "book_completed" || kind === "editing_started" || kind === "status_changed") {
    return "milestone";
  }
  if (kind.startsWith("pickup")) return "pickup";
  if (kind.startsWith("chapter")) return "progress";
  return "neutral";
}
