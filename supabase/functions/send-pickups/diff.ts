/**
 * THE DENO-SIDE TWIN of src/lib/pickup-diff.ts.
 *
 * Kept in step by scripts/pickup-diff.test.mjs, which imports BOTH files and
 * asserts they produce the same tokens for the same input — including the four
 * live corrections this was built against. `supabase/functions` is excluded
 * from tsconfig (it is Deno code) and the Supabase CLI only uploads files
 * beside the entry point, so a single shared module is not available across
 * that boundary; the test is what replaces it.
 *
 * EDIT BOTH, OR NEITHER. The reasoning for every rule is in the other file.
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
