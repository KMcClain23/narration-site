/**
 * The two live filenames that do not equal their card title, and the ambiguity
 * rule that must never be papered over.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
const { normaliseTitle, matchTitleToCard } = await import("../src/lib/title-match.ts");

const CARDS = [
  { id: "1", title: "A Cowboy's Runaway" },
  { id: "2", title: "All the Ways I'd Die for You" },
  { id: "3", title: "Devils of Seattle" },
  { id: "4", title: "Joy Ride" },
  { id: "5", title: "Ruined" },
  { id: "6", title: "Sweetening the Deal" },
  { id: "7", title: "The Wolf King's Bride" },
];

test("the missing apostrophe still matches — the case the feature runs on", () => {
  const m = matchTitleToCard("A Cowboys Runaway.pdf", CARDS);
  assert.equal(m.status, "matched");
  assert.equal(m.card.title, "A Cowboy's Runaway");
});

test("a capital F still matches", () => {
  const m = matchTitleToCard("All the Ways I'd Die For You.pdf", CARDS);
  assert.equal(m.status, "matched");
  assert.equal(m.card.title, "All the Ways I'd Die for You");
});

test("THE NAIVE RULE WOULD HAVE FAILED — apostrophe as a separator", () => {
  // This is the assertion that pins WHY the function is written this way.
  const naive = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  assert.notEqual(naive("A Cowboys Runaway"), naive("A Cowboy's Runaway"));
  assert.equal(normaliseTitle("A Cowboys Runaway"), normaliseTitle("A Cowboy's Runaway"));
});

test("curly apostrophes normalise the same as straight", () => {
  assert.equal(normaliseTitle("A Cowboy’s Runaway"), normaliseTitle("A Cowboy's Runaway"));
});

test("every one of the seven live scripts resolves to exactly one card", () => {
  const files = [
    "A Cowboys Runaway.pdf", "All the Ways I'd Die For You.pdf", "Devils of Seattle.pdf",
    "Joy Ride.pdf", "Ruined.pdf", "Sweetening the Deal.pdf", "The Wolf King's Bride.pdf",
  ];
  for (const f of files) {
    assert.equal(matchTitleToCard(f, CARDS).status, "matched", `${f} did not resolve`);
  }
});

test("a file matching nothing is unresolved, not guessed", () => {
  assert.equal(matchTitleToCard("Some Other Book.pdf", CARDS).status, "no_card");
});

test("TWO MATCHES IS UNRESOLVED — never the first", () => {
  const withDecoy = [...CARDS, { id: "8", title: "Joy  Ride" }];
  const m = matchTitleToCard("Joy Ride.pdf", withDecoy);
  assert.equal(m.status, "ambiguous");
  assert.equal(m.candidates.length, 2);
  assert.ok(!("card" in m), "an ambiguous match must not carry a chosen card");
});

test("an empty or extension-only name is unresolved", () => {
  assert.equal(matchTitleToCard(".pdf", CARDS).status, "no_card");
  assert.equal(matchTitleToCard("", CARDS).status, "no_card");
});
