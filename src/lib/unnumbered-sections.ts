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
