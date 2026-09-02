/**
 * The mask, typed one character at a time.
 *
 * ── WHY IT MUST BE SIMULATED KEYSTROKE BY KEYSTROKE ────────────────────────
 *
 * The bug was that the mask ran against its OWN previous output: "134" became
 * "01:34", and the injected zero was then part of the input, so the next digit
 * landed in the tenths slot and 13:47 was stored as 01:34.7. A test that calls
 * maskTimestamp once with the whole string cannot see that — it is the feedback
 * loop that is broken, not any single call.
 *
 * So each case replays the field: value = mask(value + nextChar), exactly as
 * the onChange handler does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { maskTimestamp, normaliseTimestamp } =
  await import("../src/app/editor/card/[id]/EditorCardClient.tsx");

/** What the field holds after typing `keys`, one character at a time. */
function type(keys) {
  let value = "";
  for (const ch of keys) value = maskTimestamp(value + ch);
  return value;
}

const CASES = [
  { typed: "13:47",  shows: "13:47",   stores: "13:47" },
  { typed: "1347",   shows: "13:47",   stores: "13:47" },
  { typed: "432",    shows: "4:32",    stores: "04:32" },
  { typed: "4:32",   shows: "4:32",    stores: "04:32" },
  { typed: "26:30",  shows: "26:30",   stores: "26:30" },
  { typed: "1:01.7", shows: "1:01.7",  stores: "01:01.7" },
  { typed: "13471",  shows: "13:47.1", stores: "13:47.1" },
];

for (const c of CASES) {
  test(`typing ${c.typed} shows ${c.shows} and stores ${c.stores}`, () => {
    const shown = type(c.typed);
    assert.equal(shown, c.shows, `field showed ${shown}`);
    assert.equal(normaliseTimestamp(shown), c.stores);
  });
}

test("THE ORIGINAL BUG: the mask never injects a digit she did not type", () => {
  // "134" used to render "01:34" — the zero then became input.
  assert.equal(type("134"), "1:34");
  assert.equal(type("1347"), "13:47");
});

test("an impossible time is refused on save, not coerced", () => {
  assert.equal(normaliseTimestamp("12:63"), null, "63 seconds must not store");
  assert.equal(normaliseTimestamp("02:63.0"), null);
  assert.equal(normaliseTimestamp("13:59"), "13:59", "59 is still fine");
});

test("half-typed states survive the keystroke that made them", () => {
  assert.equal(type("13:"), "13:");
  assert.equal(type("1:01."), "1:01.");
});

test("the mask is idempotent — running it on its own output changes nothing", () => {
  // This is the property the old one lacked, and it is why the bug existed.
  for (const c of CASES) {
    const once = type(c.typed);
    assert.equal(maskTimestamp(once), once, `${once} changed when re-masked`);
  }
});

test("re-masking a STORED value is stable, for the edit path", () => {
  // EditorCardClient re-masks p.timestamp_at when editing an existing pickup.
  for (const stored of ["04:32", "13:47", "26:30", "01:01.7", "12:40", "23:34"]) {
    assert.equal(maskTimestamp(stored), stored, `${stored} was rewritten`);
    assert.equal(normaliseTimestamp(maskTimestamp(stored)), stored);
  }
});

test("empty stays empty", () => {
  assert.equal(type(""), "");
  assert.equal(normaliseTimestamp(""), "");
});
