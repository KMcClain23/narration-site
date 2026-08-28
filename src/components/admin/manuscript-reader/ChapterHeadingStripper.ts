import type { ParagraphBlock } from "./paragraph-highlight";

/**
 * Hides the chapter label that some manuscripts repeat inside the prose.
 *
 * A chapter arrives with its heading twice: once as `chapters.title`, which the
 * reader renders as a styled heading, and again as the opening words of
 * `raw_text` — "PROLOGUE The day before New Year's Eve…", "CARNAGE CHASE
 * SCREAMED." The second one is an artefact of lifting text off a typeset page,
 * where the heading is part of the same text flow as the prose.
 *
 * DISPLAY ONLY. Nothing here writes; `raw_text` keeps the heading, so this is
 * recoverable by deleting one call.
 *
 * Deliberately NOT a case heuristic. Joy Ride sets the opening words of every
 * chapter in small caps, which extract as capitals:
 *
 *   title "CARNAGE"       body "CARNAGE CHASE SCREAMED. And I don't mean…"
 *   title "TESSA"         body "TESSA I WAS SHAKING so hard I could barely…"
 *   title "BLOODLETTING"  body "BLOODLETTING WE SAT IN THE CAR IN absolute…"
 *
 * "Strip the leading run of capitals" would delete CHASE SCREAMED., I WAS
 * SHAKING and WE SAT IN THE CAR IN — real prose, gone with nothing on screen to
 * say so. So the match is anchored to values already stored for the chapter,
 * and to the very start of the text, rather than to how the letters look.
 */

/**
 * A structural heading, recognised without reference to the chapter's title.
 *
 * Independent of the title on purpose: a chapter whose stored title is
 * something else entirely can still open with a body-level "PROLOGUE", and the
 * label is redundant either way. Numerals may be arabic, roman, or spelled —
 * none of the three books uses anything but arabic, so the other two are
 * insurance rather than an observed need.
 */
const STRUCTURAL_HEADING =
  /^(chapter|part)\s+(\d{1,3}|[ivxlcdm]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b|^(prologue|epilogue)\b/i;

/** Whitespace or the punctuation that trails a heading before the prose. */
const HEADING_GAP = /^[\s.,:;—–-]+/;

/**
 * Compare-only normalisation. Never used for anything that reaches the screen.
 *
 * Case differs because the heading is often typeset in capitals while the title
 * is stored in title case. Apostrophes differ because the extracted body
 * carries the typographic form while the title carries the straight one —
 * Joy Ride stores "WHAT'S LEFT BEHIND" against a body reading "WHAT’S LEFT
 * BEHIND", and an exact comparison misses it.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/**
 * Length of the leading run of `text` that repeats `title`, or 0.
 *
 * Grows the candidate one character at a time and compares normalised forms,
 * because the two sides differ in punctuation and spacing and a plain
 * `startsWith` would miss most real cases. The match must end on a word
 * boundary so a title cannot consume the first word of the prose.
 */
function repeatedTitleLength(text: string, title: string | null): number {
  const want = normalise(title ?? "");
  if (!want) return 0;

  let seen = "";
  for (let i = 1; i <= text.length && seen.length <= want.length + 8; i++) {
    seen = normalise(text.slice(0, i));
    if (seen !== want) continue;
    const after = text.slice(i);
    if (after === "" || /^[\s.,:;—–-]/.test(after)) return i;
  }
  return 0;
}

/**
 * How many characters at the start of `text` are a redundant heading.
 *
 * The POV name is intentionally left in place. It IS redundant — the reader
 * shows a POV badge — but "the character's name" is not a shape that can be
 * distinguished from the same name used as prose, and removing prose that
 * happens to match a stored value is a worse failure than showing a redundant
 * word. See the POV badge for where it is said properly.
 */
export function headingLength(text: string, title: string | null): number {
  let cut = repeatedTitleLength(text, title);

  const structural = STRUCTURAL_HEADING.exec(text.slice(cut));
  if (structural) cut += structural[0].length;

  if (cut === 0) return 0;

  const gap = HEADING_GAP.exec(text.slice(cut));
  if (gap) cut += gap[0].length;

  // Never strip the whole paragraph: a chapter that is nothing but its heading
  // should keep showing something rather than collapse to an empty block.
  return cut >= text.length ? 0 : cut;
}

/**
 * Returns `blocks` with the heading hidden from the first one.
 *
 * `start` advances by exactly what `text` loses. Dialogue spans are absolute
 * offsets into raw_text and the renderers slice with `text.slice(cursor -
 * start)`, so moving one without the other would shift every highlight in the
 * chapter by the length of its heading. The same pair is what
 * `data-block-start` reports when a drag-selection becomes a new span, so the
 * offsets written back stay correct too.
 */
export function stripChapterHeading(
  blocks: ParagraphBlock[],
  title: string | null
): ParagraphBlock[] {
  if (!blocks.length) return blocks;

  const [first, ...rest] = blocks;
  const cut = headingLength(first.text, title);
  if (cut === 0) return blocks;

  const start = first.start + cut;
  return [
    {
      ...first,
      text: first.text.slice(cut),
      start,
      // A span that began inside the heading can no longer be placed. In this
      // corpus there are none with a real extent — the only ones are the
      // extractor's zero-length "could not locate" rows, which splitParagraphs
      // already discards.
      spans: first.spans.filter((s) => s.start_offset >= start),
    },
    ...rest,
  ];
}
