/**
 * Where a pickup's files live in OneDrive. Pure string rules, no runtime API.
 *
 * ── THE CHAPTER LEVEL ──────────────────────────────────────────────────────
 *
 *   Pickups/{book}/{narrator}/{Chapter 23}/
 *       pickups.txt
 *       clip 12-40.wav
 *       take - Closing Credits.mp3
 *
 * ONE LEVEL, NOT THREE. `clips/` and `takes/` beneath each chapter would be
 * structure for one to six files — more clicks than content. The PREFIX says
 * what kind of file it is; the FOLDER says which chapter. A narrator folder
 * with 23 chapters' worth of loose files is the thing being avoided, and one
 * level fixes that completely.
 *
 * ── THIS MODULE IS DUPLICATED, DELIBERATELY, AND THE COPIES ARE TESTED ─────
 *
 * `supabase/functions` is excluded from tsconfig because it is Deno code, and
 * the Supabase CLI only uploads files that sit beside the function's entry
 * point — so a genuinely shared module is not available across that boundary.
 *
 * The twin lives at supabase/functions/send-pickups/paths.ts. Rather than a
 * comment asking the next person to keep them in step — which is what the slug
 * function had, and it did not hold — scripts/pickup-paths.test.mjs imports
 * BOTH and asserts they agree character for character across a table of cases,
 * including every chapter string in the live data. Edit one and the test goes
 * red naming the input that diverged.
 */

/**
 * A single path component, made safe for OneDrive.
 *
 * Never returns empty: an empty component silently reparents the file one level
 * up, which is far worse than an obviously wrong name.
 */
export function sanitiseSegment(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Untitled";
}

/**
 * The chapter's folder name, rendered the way the UI renders it.
 *
 * A NUMBER GETS THE WORD. "23" alone is a folder called 23, which sorts oddly
 * beside "Prologue" and reads as nothing in particular; "Chapter 23" is what
 * the app calls it on screen and in the email.
 *
 * A NAME IS LEFT BARE. "Prologue", "Opening Credits", "Author's Note" are
 * already the name of the thing — "Chapter Prologue" is wrong, and the chapter
 * field is free text precisely so those can exist.
 */
export function chapterFolder(chapter: string): string {
  const raw = (chapter ?? "").trim();
  // Numeric, with an optional decimal for the 12.5-style interstitials the
  // free-text field permits.
  return sanitiseSegment(/^\d+(\.\d+)?$/.test(raw) ? `Chapter ${raw}` : raw);
}

/** The folder holding everything for one narrator's work on one chapter. */
export function chapterDir(book: string, narrator: string, chapter: string): string {
  return `Pickups/${book}/${sanitiseSegment(narrator)}/${chapterFolder(chapter)}`;
}

/**
 * The manifest. No chapter in the name any more — the folder says it.
 *
 * It was `23 - pickups.txt`, which is where the chapter used to have to live.
 */
export function manifestName(): string {
  return "pickups.txt";
}

/** A clip cut from the combined chapter file, named by its timestamp. */
export function clipName(timestampAt: string): string {
  return `${sanitiseSegment(`clip ${timestampAt}`)}.wav`;
}

/** A take the narrator uploaded. `take - ` so it sorts away from clips. */
export function takeName(originalName: string, extension: string): string {
  const ext = (extension ?? "").replace(/^\.+/, "").toLowerCase() || "bin";
  return `${sanitiseSegment(`take - ${originalName}`)}.${ext}`;
}
