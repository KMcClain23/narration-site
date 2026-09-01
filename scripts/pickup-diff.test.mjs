/**
 * The diff, against the corrections that are actually in the system — and the
 * two copies of it, held together.
 *
 * The four cases below are live rows, not invented ones. Each is a different
 * SHAPE of change, and the reordering is the one a naive comparison gets wrong:
 * position-by-position marks both words on both sides, and an LCS keeps the
 * shared word anchored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const web = await import("../src/lib/pickup-diff.ts");
const deno = await import("../supabase/functions/send-pickups/diff.ts");

/** Marked words, in order, as a readable string. */
const marked = tokens => tokens.filter(t => t.changed).map(t => t.text).join(" ");
const plain = tokens => tokens.map(t => t.text).join(" ");

const CASES = [
  {
    name: "a single word",
    said: "I stack the folded shirts and suddenly quester whether or not tampering with the green plaid shirt was a good idea.",
    shouldBe: "I stack the folded shirts and suddenly question whether or not tampering with the green plaid shirt was a good idea.",
    saidMarked: "quester",
    shouldMarked: "question",
  },
  {
    name: "an insertion",
    said: "used to be",
    shouldBe: "used to be expected",
    saidMarked: "",
    shouldMarked: "expected",
  },
  {
    name: "a reordering — the case an LCS exists for",
    said: "together tighter",
    shouldBe: "tighter together",
    // ONE word moves, not both. A naive diff marks all four.
    saidMarked: "together",
    shouldMarked: "together",
  },
  {
    name: "a phrase swap",
    said: "happy with our life",
    shouldBe: "a happy life",
    saidMarked: "with our",
    shouldMarked: "a",
  },
];

for (const c of CASES) {
  test(`${c.name}`, () => {
    const d = web.diffPickup(c.said, c.shouldBe);
    assert.equal(plain(d.said), c.said, "every original word survives on the said side");
    assert.equal(plain(d.shouldBe), c.shouldBe, "and on the should-be side");
    assert.equal(marked(d.said), c.saidMarked);
    assert.equal(marked(d.shouldBe), c.shouldMarked);
    assert.equal(d.comparable, true);
  });
}

test("the shared words stay anchored on a reorder", () => {
  const d = web.diffPickup("together tighter", "tighter together");
  // The point of the case: "tighter" is untouched on BOTH sides.
  assert.ok(d.said.some(t => t.text === "tighter" && !t.changed));
  assert.ok(d.shouldBe.some(t => t.text === "tighter" && !t.changed));
});

test("case and edge punctuation do not count as a change", () => {
  const d = web.diffPickup("the green plaid shirt.", "The green plaid shirt");
  assert.equal(marked(d.said), "");
  assert.equal(marked(d.shouldBe), "");
});

test("one side empty is not comparable, and nothing is marked", () => {
  const d = web.diffPickup("", "a happy life");
  assert.equal(d.comparable, false);
  assert.equal(marked(d.shouldBe), "");
  assert.equal(plain(d.shouldBe), "a happy life");
});

test("identical text marks nothing", () => {
  const d = web.diffPickup("the same words", "the same words");
  assert.equal(marked(d.said) + marked(d.shouldBe), "");
});

/**
 * THE PARITY TEST. Not "both files exist" — both files agree, on every case
 * above and on the awkward ones, token for token.
 */
test("the Deno twin agrees exactly", () => {
  const inputs = [
    ...CASES.map(c => [c.said, c.shouldBe]),
    ["", "a happy life"],
    ["a happy life", ""],
    ["the same words", "the same words"],
    ["one", "two"],
    ["  spaced   out  words ", "spaced out words"],
    ["He said “hello”", "He said ‘hello’"],
    [null, null],
  ];
  for (const [a, b] of inputs) {
    assert.deepEqual(
      deno.diffPickup(a, b),
      web.diffPickup(a, b),
      `the two copies disagree on ${JSON.stringify([a, b])}`,
    );
  }
});
