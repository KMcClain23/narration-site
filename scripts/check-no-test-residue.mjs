/**
 * No verification may leave anything behind in production.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * check-editor-moves creates a board card, drives it through every transition,
 * and deletes it in a finally block. One run's card survived — `Moves Probe
 * 1788306706334` — and appeared on Dean's board under Unclaimed, and on
 * Marizete's editor hub, as a real book she might have claimed.
 *
 * A probe that leaves residue is not a passing test. It is an unreported
 * mutation of production, and this one reached a planning view.
 *
 * check-no-probe-accounts covers auth users. This covers everything else a
 * probe touches: the cards themselves, the narrators, the pickups hung off
 * them, and the link rows.
 *
 * ── IT LOOKS FOR THE NAMES PROBES USE, DELIBERATELY ────────────────────────
 *
 * Every harness in this repo names its fixtures with a recognisable prefix and
 * a timestamp — "Moves Probe 1788…", "Activity Probe 1788…", "Link Check 1788…".
 * That convention is what makes residue findable at all, so it is asserted here
 * rather than left as a habit: a fixture named like a real book is one nobody
 * can ever distinguish from one.
 *
 * Usage: npm run check-no-test-residue
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

/** The prefixes every harness here uses for a fixture it intends to delete. */
const FIXTURE = /\b(probe|link check|__linkcheck|activity probe|moves probe|spliced probe|pilot probe|test)\b/i;

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

const checks = [
  { table: "board_cards", label: "board cards", field: "title" },
  { table: "narrators", label: "narrators", field: "display_name" },
  { table: "manuscripts", label: "manuscripts", field: "title" },
];

for (const { table, label, field } of checks) {
  const { data, error } = await admin.from(table).select(`id, ${field}`);
  if (error) {
    console.log(`  FAIL could not read ${label}: ${error.message}`);
    failures++;
    continue;
  }
  // THE POSITIVE CONTROL. An empty read shows no residue and proves nothing.
  ck(`${label} were read`, (data?.length ?? 0) > 0, `${data?.length ?? 0} rows`);
  const left = (data ?? []).filter(r => FIXTURE.test(String(r[field] ?? "")));
  if (left.length > 0) {
    console.log(`  FAIL ${left.length} test fixture(s) survived in ${label}:`);
    for (const r of left) console.log(`         ${r[field]}  (${r.id})`);
    failures++;
  } else {
    console.log(`  ok   no test fixture left in ${label}`);
  }
}

/*
  ── AND THE COLUMN A PROBE FLIPS ON A REAL BOOK ────────────────────────────

  Deleting a fixture card is the easy half. The harder one is a probe that
  changes a REAL row and does not change it back — which is what happened to
  How an Angel Dies: Wrath, whose edited_externally was cleared by a test that
  clicked the first control on the page rather than its own book's.

  This cannot know what the right value is, so it does not guess: it reports
  every book currently flagged, with who asserted it, so a wrong one is visible
  rather than silently true. Dean reads this; the check does not decide.
*/
const { data: flagged } = await admin
  .from("board_cards")
  .select("title, edited_externally_by, edited_externally_at")
  .eq("edited_externally", true)
  .is("archived_at", null);

console.log(`\n${flagged?.length ?? 0} book(s) marked edited elsewhere:`);
for (const b of flagged ?? []) {
  const who = b.edited_externally_by ? "an editor" : "Dean";
  const when = b.edited_externally_at ? ` on ${String(b.edited_externally_at).slice(0, 16)}` : "";
  console.log(`     ${b.title} — marked by ${who}${when}`);
}

console.log(failures === 0 ? "\nNO TEST RESIDUE" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
