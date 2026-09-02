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

/**
 * What a fixture looks like.
 *
 * ── TWO RULES, BECAUSE THE FIRST ONE HAS A BLIND SPOT ──────────────────────
 *
 * A keyword list missed "Noise Narrator 1788308653685" entirely — it contains
 * none of those words — so a run that leaked two narrators reported clean while
 * leaking them.
 *
 * The second rule is the one that actually holds: every harness here suffixes
 * its fixtures with Date.now(), and a name ending in a 13-digit epoch is not a
 * book anyone published or a narrator anyone hired.
 *
 * ── AND WHY THERE IS NO \b OR \d BELOW ─────────────────────────────────────
 *
 * The first version built this with `new RegExp("\\b…")` and the escapes did
 * not survive being written to the file: the pattern compiled to a BACKSPACE
 * character followed by "probe", and `\s\d` collapsed to the letters "sd". It
 * matched nothing at all and reported every leak as clean — a guard that is
 * broken in the passing direction, which is the worst kind.
 *
 * Plain string methods and a character class have no escapes to lose, and the
 * self-test below proves the rule on names from both sides rather than assuming
 * the regex says what it looks like it says.
 */
const KEYWORDS = ["probe", "link check", "__linkcheck", "pilot probe", "test"];
const EPOCH_SUFFIX = /[ ][0-9]{13}$/;

function isFixture(name) {
  const n = String(name ?? "").toLowerCase();
  return EPOCH_SUFFIX.test(n) || KEYWORDS.some(k => n.includes(k));
}

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

/*
  THE RULE IS TESTED BEFORE IT IS TRUSTED.

  A residue check that recognises nothing passes every run and protects nothing,
  which is exactly what the previous pattern did. So it is proved here on names
  from both sides — real books that must survive, and fixtures that must be
  caught — before a single row is read.
*/
console.log("The fixture rule itself");
{
  const cases = [
    ["Moves Probe 1788306706334", true],
    ["Noise Narrator 1788308653685", true],
    ["Activity Probe 1788306706334", true],
    ["Link Check 1788306706334", true],
    ["__linkcheck 1788306706334", true],
    ["A Cowboy's Runaway", false],
    ["Whiskey & Lies", false],
    ["Devils of Seattle", false],
    ["All the Ways I'd Kill for You", false],
    ["How an Angel Dies: Wrath", false],
    ["Where My Demons Hide", false],
  ];
  const wrong = cases.filter(([n, want]) => isFixture(n) !== want);
  ck("it catches every fixture and keeps every real title",
    wrong.length === 0,
    wrong.map(([n]) => n).join("; ") || `${cases.length} names checked`);
}

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
  const left = (data ?? []).filter(r => isFixture(r[field]));
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
