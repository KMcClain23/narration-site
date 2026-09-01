/**
 * How a book's public URL is derived. One implementation, imported everywhere.
 *
 * ── WHY THIS IS A MODULE AND NOT A CONVENTION ──────────────────────────────
 *
 * There were FOUR copies of this for books — in /api/board, in SiteSearch, in
 * the catalogue listing, and in the detail page — and the detail page's copy
 * carried a comment saying it "must match /api/books exactly". That comment was
 * correct, load-bearing, and completely unenforceable: nothing anywhere would
 * have failed if somebody edited one of them.
 *
 * It mattered because 21 of 33 cards have `slug` NULL and derive their URL on
 * both sides. The day two copies disagreed, every one of those books would 404
 * at once — the catalogue would link one string and the detail page would look
 * up another.
 *
 * ── THE FOUR COPIES WERE NOT ALL THE SAME ──────────────────────────────────
 *
 * Three were character-identical. The fourth — `makeSlug` in /api/board, which
 * is the one that WRITES the slug column — was a different algorithm: it
 * stripped punctuation instead of replacing it, so an apostrophe vanished
 * rather than becoming a separator.
 *
 *     "The Wolf King's Bride"
 *       writer  ->  the-wolf-kings-bride      (stored in the column today)
 *       readers ->  the-wolf-king-s-bride     (derived when the column is null)
 *
 * Both stored slugs and derived ones are live right now, and they only agree
 * because the stored value WINS on both sides — so a card either has a stored
 * slug used by everyone, or none and is derived identically by everyone.
 *
 * THE READERS' ALGORITHM IS THE ONE KEPT, and that direction is deliberate:
 * every public URL for the 21 slug-less cards is a derived one, and adopting
 * the writer's rule would change all of them. The writer now produces the
 * reader form for NEW cards; the twelve slugs already stored keep working
 * untouched, because stored still wins.
 */

/**
 * Title to slug. Non-alphanumeric runs become one hyphen; edges are trimmed.
 *
 * DO NOT "IMPROVE" THIS. Changing it re-points every URL derived from it, which
 * is most of the catalogue — including links already sent to authors and
 * indexed by search engines. A change here is a migration, not an edit.
 */
export function bookSlug(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * The slug a card is actually reachable at.
 *
 * CONFIDENTIAL CARDS ROUTE ON THEIR ID, never a title-derived slug — a slug
 * built from the real title would leak it, and one built from the redacted
 * "Untitled Project" would collide across every confidential card at once.
 *
 * Otherwise the STORED column wins, falling back to deriving from the title
 * only when it is unset. That precedence is what keeps a renamed card
 * reachable: slug columns do not auto-update, so recomputing from the current
 * title would give a string the listing never linked to.
 */
export function slugForCard(card: {
  id: string;
  title: string;
  slug?: string | null;
  is_confidential?: boolean | null;
}): string {
  if (card.is_confidential) return `confidential-${card.id}`;
  return card.slug || bookSlug(card.title ?? "");
}
