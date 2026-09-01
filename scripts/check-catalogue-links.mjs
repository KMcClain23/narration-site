/**
 * Every book the catalogue links to must have a detail page that loads.
 *
 * ── THE BUG THIS WAS WRITTEN AGAINST ───────────────────────────────────────
 *
 * /api/books filtered on five statuses and the detail page filtered on four.
 * "prepping" was in one list and not the other, so Ruined and The Wolf King's
 * Bride appeared on the catalogue, linked, and 404'd. Nothing failed: both
 * endpoints were individually correct and the disagreement lived in the gap
 * between them.
 *
 * That gap is only visible by following the link, which is what this does.
 *
 * ── IT WAS RUN BEFORE THE FIX, AND IT FAILED ───────────────────────────────
 *
 * Naming both books. A guard written against an already-fixed codebase has
 * never seen the failure it exists for, and there is no way to tell one that
 * works from one that merely passes. This one was proven on the live bug first,
 * then again by mutation.
 *
 * Usage: npm run check-catalogue-links [-- --base http://localhost:3000]
 */
// The SAME function the site builds its links with. Re-deriving the slug here
// would make this a test of a second implementation, which is the shape of bug
// it is meant to catch.
import { bookSlug } from "../src/lib/book-slug.ts";
const argBase = process.argv.indexOf("--base");
const BASE = argBase > -1 ? process.argv[argBase + 1] : (process.env.CATALOGUE_BASE ?? "http://localhost:3000");

let failures = 0;
const bad = [];

const res = await fetch(`${BASE}/api/books`).catch(e => ({ ok: false, statusText: e.message }));
if (!res.ok) {
  // A catalogue that cannot be read is NOT a catalogue with no broken links.
  console.error(`could not fetch ${BASE}/api/books — ${res.status ?? ""} ${res.statusText ?? ""}`);
  console.error("That is a failure to check, not a pass.");
  process.exit(2);
}

const payload = await res.json();
const books = Array.isArray(payload) ? payload : (payload.books ?? []);
if (!Array.isArray(books) || books.length === 0) {
  console.error("the catalogue returned no books — nothing to check, which is not a pass either.");
  process.exit(2);
}

console.log(`${books.length} books on the catalogue\n`);

for (const b of books) {
  // Exactly how the catalogue builds the href: the stored slug when there is
  // one, otherwise derived from the title. 20 of 32 have none today, so a guard
  // that only checked stored slugs would skip most of the catalogue.
  const slug = b.slug || bookSlug(b.title);
  if (!slug) {
    bad.push({ title: b.title, slug: "(none)", code: "no slug could be derived" });
    failures++;
    continue;
  }
  const url = `${BASE}/narrated-works/${encodeURIComponent(slug)}`;
  let code;
  try {
    // The page renders on the server; a 404 comes back as a real 404.
    code = (await fetch(url, { redirect: "manual" })).status;
  } catch (e) {
    code = `fetch failed: ${e.message}`;
  }
  if (code !== 200) {
    bad.push({ title: b.title, slug, status: b.status, code });
    failures++;
  }
}

if (bad.length) {
  console.log("Linked from the catalogue, but the detail page does not load:\n");
  for (const b of bad) {
    console.log(`  ${String(b.code).padEnd(12)} ${b.title}`);
    console.log(`  ${" ".repeat(12)} /narrated-works/${b.slug}   (status: ${b.status ?? "?"})`);
  }
  console.log(
    `\n${bad.length} of ${books.length} broken.\n` +
      "If these share a status, the two filters disagree — they must import the\n" +
      "same PUBLIC_CARD_STATUSES rather than each keeping a list.",
  );
} else {
  console.log(`  ok   all ${books.length} detail pages return 200`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
