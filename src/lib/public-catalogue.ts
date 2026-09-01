/**
 * Which board statuses appear on the public catalogue. One list, imported.
 *
 * ── THIS IS THE THIRD TIME ─────────────────────────────────────────────────
 *
 * /api/books filtered on five statuses and /narrated-works/[slug] filtered on
 * four. "prepping" was in the first and not the second, so Ruined and The Wolf
 * King's Bride were listed on the catalogue, linked, and 404'd. Both endpoints
 * were individually correct; the bug lived in the gap between two lists that
 * were never required to agree.
 *
 * The same shape had already been fixed twice — once in admin-routes.ts, where
 * middleware kept a private copy of the route list and /expenses drifted out of
 * it, and once across the two narrator tables. Adding "prepping" to the second
 * array would have repaired today and left the NEXT status to do this again,
 * which is exactly how it recurred the first two times.
 *
 * So: no caller keeps a list. A status becomes public by being added HERE, and
 * every surface changes together or not at all.
 */

/**
 * ── WHY EACH ONE IS HERE ───────────────────────────────────────────────────
 *
 * The catalogue is a portfolio: work Dean has done, or is contracted to do. The
 * question each status has to answer is "is this his, and may it be shown".
 *
 *   contracted  signed, not started. His, and announced deliberately.
 *   prepping    between contracted and recording, both public. Omitting it made
 *               a title VANISH from the public page partway through the
 *               pipeline and reappear once recording began.
 *   recording   in the booth.
 *   editing     recorded, in post.
 *   released    out.
 */
export const PUBLIC_CARD_STATUSES = [
  "contracted",
  "prepping",
  "recording",
  "editing",
  "released",
] as const;

export type PublicCardStatus = (typeof PUBLIC_CARD_STATUSES)[number];

/**
 * ── recast IS EXCLUDED, AND THAT IS A DECISION ─────────────────────────────
 *
 * Recorded here so its absence is a choice and not a gap. It was in neither
 * list before, which made it consistent by luck — and a gap that happens to
 * work is exactly what somebody later "fixes" into a 404 or, worse, into a
 * public claim that is not true.
 *
 * A recast book left Dean. This codebase is unambiguous about what the status
 * means: board-card-utils calls it work that "is not yours any more", and
 * payments/page.tsx keeps recast cards billable precisely because the contract
 * ENDED and a partial project fee is still owed. Someone else finished it and
 * their name is on it.
 *
 * So it must not appear on a page whose entire claim is "these are my
 * narrations". Listing it would advertise a book he did not narrate — a worse
 * failure than a missing entry, because it is wrong rather than incomplete.
 *
 * His For Christmas is the one card in this state today.
 *
 * IF THAT EVER CHANGES — say, a "recast to Dean" case appears — the fix is a
 * new status or a column that says which direction the recast went, NOT adding
 * "recast" here. The status as it stands cannot tell the two apart, and this
 * list must never depend on a distinction the data does not make.
 */
export const EXCLUDED_FROM_CATALOGUE = ["recast"] as const;
