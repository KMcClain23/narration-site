// Front/back-matter section titles that don't get a numbered "Chapter N"
// treatment — shared between the parser (decides ParsedChapter.number,
// though that field currently isn't persisted) and the reader (decides the
// "Chapter N of M" display and the chapter-jump list), so the two can't
// drift out of sync on what counts as a real chapter.
export const UNNUMBERED_SECTION_TITLE =
  /^(prologue|epilogue|dedication|preface|afterword|acknowledgements?|acknowledgments?|author'?s?\s+note|content\s*(?:&|and)\s*trigger\s*warnings?|trigger\s*warnings?|content\s*warnings?)$/i;

export function isUnnumberedSection(title: string | null): boolean {
  if (!title) return false;
  return UNNUMBERED_SECTION_TITLE.test(title.trim());
}

/** A section explicitly titled as a chapter — "Chapter One", "Chapter 12". */
const CHAPTER_TITLED = /^chapter\b/i;

/**
 * Assign chapter numbers across a manuscript's sections, in order.
 *
 * Matching titles against a keyword list alone is not enough. A book's front
 * matter is often titled freely — "To My Family", "Design, Editing Services &
 * Support" — and none of that resembles a known section name, so every page of
 * it counted as a chapter and pushed the real Chapter One down to fourth.
 *
 * When a book labels its chapters explicitly, everything before the first such
 * label is front matter regardless of what it is called. That test is only
 * applied to books that do label them: plenty of books title chapters freely
 * ("The Frost of the Mire"), and there the rule would classify the entire book
 * as front matter.
 *
 * Returns one entry per section: its chapter number, or null for matter.
 */
export function computeChapterNumbers(titles: Array<string | null>): Array<number | null> {
  const firstChapterLabeled = titles.findIndex((t) => t && CHAPTER_TITLED.test(t.trim()));
  const labelsChapters = firstChapterLabeled !== -1;

  let n = 0;
  return titles.map((title, i) => {
    const beforeFirstChapter = labelsChapters && i < firstChapterLabeled;
    if (beforeFirstChapter || isUnnumberedSection(title)) return null;
    return ++n;
  });
}

/** How many of a manuscript's sections are real chapters. */
export function countNumberedChapters(titles: Array<string | null>): number {
  return computeChapterNumbers(titles).filter((n) => n !== null).length;
}
