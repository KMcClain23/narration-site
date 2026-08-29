/**
 * The rs_plus branch, checked on both sides WITHOUT touching live data.
 *
 * Usage (from project root):
 *   npm run check-rs-plus
 *
 * WHY IT IS SEPARATE FROM THE RECONCILIATION CHECK. rs_plus is live in both
 * implementations — board-card-utils.ts guards
 * `paymentType !== "pfh" && paymentType !== "rs_plus"`, the database guards
 * `payment_type not in ('pfh', 'rs_plus')` — and no card in Dean's data uses it.
 * A branch nothing reaches is a branch nothing checks, and those two lists could
 * drift apart while every run still reported "All cards reconcile."
 *
 * The first attempt at fixing that created a real rs_plus card on the live
 * board, compared it, and deleted it. That is deleted, and the reason is worth
 * keeping: two concurrent CI runs would have raced. Run B's opening sweep could
 * delete run A's row mid-comparison — a false FAILURE if it landed before A's
 * read, a false PASS if after, with the outcome decided by timing nobody
 * controls. A test that can corrupt live data is not worth what it proves.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ──────────────────────────────────
 *
 * It proves each side handles rs_plus correctly against ONE shared expected
 * value: TypeScript == EXPECTED and SQL == EXPECTED, so TypeScript == SQL
 * transitively. A wrong EXPECTED fails both halves loudly rather than hiding in
 * one of them.
 *
 * It does NOT prove the two agree on a real row end to end. The other eight
 * edge cases in check-card-economics-reconciles.ts do carry that claim: they
 * run both implementations over the same live card and compare the outputs.
 * This one runs each implementation against a number written down by hand.
 *
 * That is a SMALLER CLAIM and it should not be filed as equivalent. If rs_plus
 * ever gets a real card, delete this file and let the reconciliation check
 * cover it properly.
 */

import { createClient } from "@supabase/supabase-js";
import { estimatedEarnings } from "@/components/admin/board-card-utils";
import { cardExpected, type MoneyCard, type PaymentRow } from "@/lib/payments";

/** Cents. Both sides are float/numeric; exact equality would fail on noise. */
const EPSILON = 0.005;

/**
 * The finished-hour divisor the hand-derivation below assumes. It is written
 * here as a literal rather than read from the database on purpose: this is a
 * unit check of the rs_plus branch, not of the studio setting. The SQL half
 * DOES read the live setting, so the two would silently drift apart if Dean
 * changed it — which is why the run asserts the live value still matches and
 * fails with instructions if it does not.
 */
const DIVISOR = 9400;

const WORDS = 100000;
const RATE = 250;

/**
 * ONE expected value, shared by both halves. Derived by hand, longhand:
 *
 *     100,000 words / 9,400 words per finished hour  =  10.638297872340425 finished hours
 *     10.638297872340425 hours  x  $250 per finished hour  =  $2,659.5744680851063
 *     $2,659.5744680851063  x  narrator share 1  =  $2,659.5744680851063
 *
 * The share is 1 because the synthetic card has no narration_format and no
 * explicit narrator_share_percent, which is the solo default on both sides.
 */
const EXPECTED = 2659.5744680851063;

let failures = 0;

function show(v: number | null): string {
  return v == null ? "null" : v.toFixed(4);
}

function assertEarns(half: string, actual: number | null): void {
  // THE NULL GUARD, which is the hole this whole file exists to close. A
  // dropped rs_plus makes its side return null, and null compared against null
  // reconciles while proving nothing. Each half must produce a REAL figure.
  if (actual == null) {
    failures++;
    console.log(`  FAIL ${half} returned null for an rs_plus card.`);
    console.log("       That is exactly what dropping rs_plus from this side looks like:");
    console.log(`       it should have earned ${show(EXPECTED)}.`);
    return;
  }
  if (Math.abs(actual - EXPECTED) >= EPSILON) {
    failures++;
    console.log(`  FAIL ${half} disagrees with the hand-derived figure.`);
    console.log(`         computed ${show(actual)}   expected ${show(EXPECTED)}`);
    return;
  }
  console.log(`  ok   ${half} — ${show(actual)}`);
}

/**
 * Half one: TypeScript, with no database involved at all. A synthetic card
 * object, straight into the functions the app calls.
 */
function checkTypeScript(): void {
  const card = {
    id: "synthetic-rs-plus",
    title: "synthetic rs_plus card",
    status: "recording",
    word_count: WORDS,
    pfh_rate: RATE,
    payment_type: "rs_plus",
    narration_format: null,
    narrator_share_percent: null,
    royalty_split_percent: null,
    co_narrator: null,
  } as unknown as MoneyCard & { payment_type: string; narration_format: string | null };

  assertEarns(
    "TypeScript estimatedEarnings",
    estimatedEarnings(WORDS, RATE, "rs_plus", null, null, DIVISOR),
  );
  // cardExpected is what the surfaces actually call, so it is checked too: it
  // reaches estimatedEarnings only after the explicit-row and recast branches.
  assertEarns("TypeScript cardExpected", cardExpected(card, [] as PaymentRow[], DIVISOR));
}

/**
 * Half two: the database, touching no rows at all.
 *
 * rs_plus_branch_probe() passes synthetic SCALARS to public.card_economics() —
 * the pure arithmetic that card_economics_for_session() also delegates to. It
 * reads no table and writes nothing.
 *
 * It USED to insert an rs_plus card inside a rolled-back subtransaction, because
 * the formula only existed inside a query over three tables and the only way to
 * exercise a branch was to make rows exist. Extracting the arithmetic removed
 * the need, and with it a permanent function whose body wrote to the live board.
 */
async function checkSql(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // The hand-derivation above assumes 9,400. If the studio setting has moved,
  // the SQL half is computing against a different divisor and EXPECTED is
  // stale — say so rather than reporting a mismatch as a code fault.
  const { data: setting, error: settingErr } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "studio_words_per_finished_hour")
    .single();
  if (settingErr) {
    console.error(`could not read studio_words_per_finished_hour: ${settingErr.message}`);
    process.exit(2);
  }
  const live = Number(setting?.value);
  if (live !== DIVISOR) {
    failures++;
    console.log(`  FAIL the studio divisor is now ${live}, not the ${DIVISOR} this check assumes.`);
    console.log("       Re-derive EXPECTED in this file by hand and update DIVISOR. Both");
    console.log("       halves must keep sharing ONE expected value or the check proves nothing.");
    return;
  }

  const { data, error } = await db.rpc("rs_plus_branch_probe");
  if (error) {
    // A check that cannot run is NOT a check that passed.
    console.error(`rs_plus_branch_probe: ${error.message}`);
    process.exit(2);
  }
  assertEarns("SQL card_economics (via rs_plus_branch_probe)", data == null ? null : Number(data));
}

async function main(): Promise<number> {
  console.log("The rs_plus branch, against one hand-derived figure.\n");
  console.log(`  ${WORDS.toLocaleString()} words at $${RATE}/pfh, divisor ${DIVISOR.toLocaleString()}, share 1`);
  console.log(`  expected ${show(EXPECTED)} on both sides\n`);

  checkTypeScript();
  await checkSql();

  console.log(
    failures === 0
      ? "\nBoth sides handle rs_plus. NOTE: this proves each side against a\n" +
          "hand-derived figure — NOT that they agree on a real row end to end."
      : `\n${failures} failure(s). rs_plus has been dropped or changed on one side.`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
