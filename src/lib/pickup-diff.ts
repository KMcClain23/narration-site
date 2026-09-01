/**
 * What actually changed between "said" and "should be".
 *
 * ── WHY A DIFF AT ALL ──────────────────────────────────────────────────────
 *
 * The two versions were shown side by side and the reader had to find the
 * difference themselves. On a long correction that is real work, and it is work
 * done at the microphone by someone who has already read the line four times:
 *
 *   said        "I stack the folded shirts and suddenly quester whether or not
 *                tampering with the green plaid shirt was a good idea."
 *   should be   "I stack the folded shirts and suddenly question whether or not
 *                tampering with the green plaid shirt was a good idea."
 *
 * One word in thirty. Marking it is the whole feature.
 *
 * ── WORD-LEVEL, NOT CHARACTER-LEVEL ────────────────────────────────────────
 *
 * A character diff on quester/question marks "que" as common, "ster"/"stion" as
 * changed, and renders as fragments — noise that is harder to read than no diff
 * at all. Tokens are words, punctuation stays attached to its word, and the
 * comparison ignores case and surrounding punctuation so a full stop moving
 * does not mark a word as rewritten.
 *
 * ── PLAIN LCS, BECAUSE REORDERING IS A REAL CASE ───────────────────────────
 *
 * "together tighter" → "tighter together" is a live example. A naive
 * position-by-position comparison marks both words on both sides; the longest
 * common subsequence keeps one of them anchored and marks only what moved.
 * That is the difference between a diff that helps and one that says "all of
 * this changed" on every reordering.
 *
 * ── ONE IMPLEMENTATION, FOUR SURFACES ──────────────────────────────────────
 *
 * said/should_be renders on /pickups, the editor card page, the narrator page,
 * and in the pickup email. The email is static HTML built in a Deno Edge
 * Function that cannot import from src/, so this file has a deliberate twin at
 * supabase/functions/send-pickups/diff.ts — the same arrangement as
 * pickup-paths.ts, and pinned the same way by a test that runs BOTH and asserts
 * they agree token for token. EDIT BOTH, OR NEITHER.
 *
 * The alternative is what happened with slugs: four implementations of one
 * comparison, disagreeing quietly.
 */

export type DiffToken = {
  text: string;
  /** True when this word has no partner on the other side. */
  changed: boolean;
};

export type PickupDiff = {
  said: DiffToken[];
  shouldBe: DiffToken[];
  /** False when there was nothing to compare — render the plain strings. */
  comparable: boolean;
};

/**
 * Words, with punctuation left where the writer put it.
 *
 * Splitting punctuation into its own token would make "life." two tokens and
 * mark the full stop as a separate change; keeping it attached means the unit
 * on screen is the unit a reader sees.
 */
function tokenise(s: string): string[] {
  return (s ?? "").trim().split(/\s+/).filter(t => t.length > 0);
}

/**
 * What two tokens are compared ON — not what is displayed.
 *
 * Case and edge punctuation are stripped so "Life." and "life" are the same
 * word. A token that is nothing but punctuation keeps its own text as the key,
 * so a stray em dash still compares as itself rather than as the empty string,
 * which would make every such token equal to every other.
 */
function key(token: string): string {
  const stripped = token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");
  return stripped.length > 0 ? stripped : token.toLowerCase();
}

/**
 * A guard on the table size, not a judgement about the text.
 *
 * The LCS table is O(n*m). These are single corrections — thirty words is long
 * — so anything past this is a paste of something else entirely, and the honest
 * answer there is to show both versions plain rather than to spend a second
 * computing a diff nobody can read.
 */
const MAX_TOKENS = 300;

export function diffPickup(said: string | null, shouldBe: string | null): PickupDiff {
  const a = tokenise(said ?? "");
  const b = tokenise(shouldBe ?? "");

  // Nothing to compare against: one side empty means every word on the other is
  // simply the text, not a change from anything.
  if (a.length === 0 || b.length === 0 || a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      said: a.map(text => ({ text, changed: false })),
      shouldBe: b.map(text => ({ text, changed: false })),
      comparable: false,
    };
  }

  const ka = a.map(key);
  const kb = b.map(key);

  // LCS lengths. Row-major, (a.length + 1) x (b.length + 1).
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        ka[i] === kb[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  // Walk it forwards. A token that is part of the common subsequence is
  // unchanged on both sides; everything else is marked on the side it sits on.
  const outA: DiffToken[] = [];
  const outB: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      outA.push({ text: a[i], changed: false });
      outB.push({ text: b[j], changed: false });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      outA.push({ text: a[i], changed: true });
      i++;
    } else {
      outB.push({ text: b[j], changed: true });
      j++;
    }
  }
  while (i < a.length) outA.push({ text: a[i++], changed: true });
  while (j < b.length) outB.push({ text: b[j++], changed: true });

  return { said: outA, shouldBe: outB, comparable: true };
}
