/**
 * THE DENO-SIDE TWIN of src/lib/pickup-paths.ts.
 *
 * Kept in step by scripts/pickup-paths.test.mjs, which imports BOTH files and
 * asserts they agree character for character. `supabase/functions` is excluded
 * from tsconfig (it is Deno code) and the Supabase CLI only uploads files
 * beside the entry point, so a single shared module is not available across
 * that boundary — the test is what replaces it.
 *
 * EDIT BOTH, OR NEITHER. The reasoning for every rule is in the other file.
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

/**
 * Audio, by extension. The twin of src/lib/wav.ts's copy.
 *
 * The gate needs it so a stray desktop.ini can never be mistaken for the
 * chapter's source and let a send through on a file that is not audio.
 */
const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "flac", "aiff", "aif", "ogg"];

export function isAudioFile(fileName: string): boolean {
  const dot = (fileName ?? "").lastIndexOf(".");
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase());
}

/**
 * Does this file name hold this chapter? The twin of src/lib/wav.ts's copy.
 *
 * Both are pinned character-for-character by scripts/pickup-paths.test.mjs.
 */
export function chapterMatches(fileName: string, chapter: string): boolean {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "");
  const norm = (s: string) =>
    s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const nFile = norm(stem);
  const nChap = norm(chapter);
  if (!nChap) return false;

  if (/^\d+$/.test(nChap)) {
    // `\\s`, not `\s`: inside a template literal `\s` is just "s", which would
    // make this `(^|s)(chapters*)?5(s|$)` and match almost anything. The parity
    // test caught exactly that the first time this twin was written.
    return new RegExp(`(^|\\s)(chapter\\s*)?${nChap}(\\s|$)`).test(nFile);
  }
  return nFile === nChap || nFile.endsWith(` ${nChap}`);
}
