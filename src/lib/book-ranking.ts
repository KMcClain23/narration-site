// How the public Narrated Works page orders its Completed section.
//
// Kept out of the route handler because it is pure: no Supabase, no request,
// nothing that needs a server context. That means the ordering rules can be
// exercised directly against fixed inputs, which matters here because the
// interesting cases — a book nobody has rated yet, a perfect score from three
// listeners — only appear once real data exists and would otherwise not be
// noticed until they were already live.

/** The fields ranking needs; anything carrying them can be ranked. */
export type RankableCard = {
  category: string;
  amazon_rating: number | null;
  amazon_review_count: number | null;
  released_at: string | null;
};

/**
 * Descending, with nulls always last regardless of direction.
 *
 * A plain `b - a` puts null first, because arithmetic on null makes it zero
 * and zero beats nothing. An unrated book belongs at the bottom of the
 * section, not the top of it.
 */
export function descNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function releasedTime(card: RankableCard): number | null {
  if (!card.released_at) return null;
  const t = new Date(card.released_at).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Rank the Completed section by how the books were received.
 *
 * Rating first, then review count so a 5.0 from three listeners does not
 * outrank a 4.7 from four hundred, then release date so the order stays total
 * when Amazon has told us nothing. Unrated books keep their relative order by
 * release date and sit below every rated book.
 *
 * This replaces the previous sort_order/title ordering for Completed only, so
 * hand-set board order no longer moves released titles on the public page. The
 * other two sections are untouched, and the array keeps its overall shape: the
 * ranked cards are written back into the slots the completed cards already
 * occupied, because several other callers read this same response.
 */
export function rankCompleted<T extends RankableCard>(cards: T[]): void {
  const slots: number[] = [];
  cards.forEach((c, i) => { if (c.category === "completed") slots.push(i); });

  const ranked = slots.map(i => cards[i]).sort((a, b) =>
    descNullsLast(a.amazon_rating, b.amazon_rating) ||
    descNullsLast(a.amazon_review_count, b.amazon_review_count) ||
    descNullsLast(releasedTime(a), releasedTime(b))
  );

  slots.forEach((slot, k) => { cards[slot] = ranked[k]; });
}
