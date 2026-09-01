import "server-only";

/**
 * Matching a book title written by two different hands.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────
 *
 * A script arrives as a file Dean named, and has to find the board card it
 * belongs to. Five of seven filenames match a card title exactly. Two do not:
 *
 *     A Cowboys Runaway.pdf             ->  A Cowboy's Runaway
 *     All the Ways I'd Die For You.pdf  ->  All the Ways I'd Die for You
 *
 * One is a missing apostrophe, one is a capital F. Renaming the files is the
 * wrong fix — Dean will add more scripts and the same drift recurs — so the
 * comparison has to absorb it.
 *
 * ── THE APOSTROPHE IS WHY THIS IS ITS OWN FUNCTION ─────────────────────────
 *
 * The obvious normaliser — lowercase, replace non-alphanumerics with a space —
 * FAILS on exactly the case it was written for:
 *
 *     "A Cowboys Runaway"   ->  a cowboys runaway
 *     "A Cowboy's Runaway"  ->  a cowboy s runaway     <- does not match
 *
 * An apostrophe is INSIDE a word; every other punctuation mark separates words.
 * So apostrophes are removed and everything else becomes a space. Get that
 * backwards and the feature fails on the one book pickups actually run on.
 *
 * ── AND WHY IT IS NOT bookSlug ─────────────────────────────────────────────
 *
 * bookSlug() looks like it would do. It would not: it replaces the apostrophe
 * with a hyphen, which is the same failure in a different costume. It is also
 * frozen on purpose — every public catalogue URL derives from it and changing it
 * is a migration, not an edit. This is a different job on the same input and it
 * says so rather than borrowing something that nearly fits.
 *
 * The rule here is the one already used by `chapterMatches` in wav.ts to match
 * a chapter name against a filename. That copy is pinned to a Deno twin by a
 * parity test and is deliberately left where it is: it normalises CHAPTER names
 * for filename matching, this normalises BOOK titles for card matching, and
 * collapsing two jobs into one function because they share three lines is how
 * the wrong list gets edited later.
 */

/** Lowercase, apostrophes removed, every other non-alphanumeric run a space. */
export function normaliseTitle(s: string): string {
  return (s ?? "")
    .toLowerCase()
    // Straight and curly, and the modifier letter apostrophe some exports use.
    .replace(/['‘’ʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The filename without its extension — what gets compared to a title. */
export function fileStem(name: string): string {
  return (name ?? "").replace(/\.[^.]+$/, "");
}

export type TitleMatch<T> =
  | { status: "matched"; card: T }
  /** Nothing looked like it. Dean links it by hand. */
  | { status: "no_card"; normalised: string }
  /** Two or more cards match. NEVER pick one — see below. */
  | { status: "ambiguous"; normalised: string; candidates: T[] };

/**
 * A script file to exactly one card, or an honest refusal.
 *
 * EXACTLY ONE HIT, OR IT IS UNRESOLVED. Zero is unresolved and two is
 * unresolved, and neither may be papered over by taking the first — a script
 * silently attached to the wrong book would put another book's sentences on
 * screen beside a narrator's correction, and it would look entirely plausible.
 * That is the failure mode this codebase keeps paying for, so ambiguity is
 * surfaced for a person to settle.
 */
export function matchTitleToCard<T extends { id: string; title: string }>(
  fileName: string,
  cards: T[],
): TitleMatch<T> {
  const normalised = normaliseTitle(fileStem(fileName));
  if (!normalised) return { status: "no_card", normalised };

  const hits = cards.filter(c => normaliseTitle(c.title) === normalised);
  if (hits.length === 1) return { status: "matched", card: hits[0] };
  if (hits.length === 0) return { status: "no_card", normalised };
  return { status: "ambiguous", normalised, candidates: hits };
}
