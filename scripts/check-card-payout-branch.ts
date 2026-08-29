/**
 * The card-level payout branch, checked on both sides WITHOUT touching live data.
 *
 * Usage (from project root):
 *   npm run check-card-payout
 *
 * WHY THIS EXISTS, AND IT IS NOT THE OBVIOUS REASON. A payout with `payment_id`
 * NULL — a cost recorded against a book that no payment settles yet — is what
 * the "+ Editor" button on /payments creates. No such row exists in Dean's data.
 *
 * That left the reconciliation run BLIND to this pairing. Proved, not assumed:
 * `editingCost` was mutated to drop card-level payouts entirely and
 * `npm run check-card-economics` still reported "All cards reconcile." With no
 * row exercising the difference, the two sides have nothing to disagree about,
 * so a one-sided change sails through.
 *
 * A DIFFERENTIAL TEST'S COVERAGE IS A PROPERTY OF THE TEST *AND* THE DATA. The
 * test was correct and blind at the same time. This closes the data half without
 * waiting for Dean to use the button.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ──────────────────────────────────
 *
 * Each side handles a card-level payout correctly against ONE shared set of
 * hand-derived values: TypeScript == EXPECTED and SQL == EXPECTED, so
 * TypeScript == SQL transitively, and a wrong EXPECTED fails both halves loudly
 * rather than hiding in one.
 *
 * It does NOT prove the two agree on a real row end to end — no real row exists.
 * That is a SMALLER claim than the eight edge cases in
 * check-card-economics-reconciles.ts carry, and it should not be filed as
 * equivalent. When a real card-level payout exists, the reconciliation run
 * covers this properly and this file can go.
 */

import { createClient } from "@supabase/supabase-js";
import { estimatedEarnings, narratorShareOf } from "@/components/admin/board-card-utils";
import { editingCost, type LoosePayout, type PaymentRow } from "@/lib/payments";

/** Cents. Both sides are float/numeric; exact equality would fail on noise. */
const EPSILON = 0.005;

/**
 * The finished-hour divisor the hand-derivation assumes. A literal on purpose:
 * this is a unit check of the branch, not of the studio setting. The SQL half
 * reads the live value, so the run asserts they still match and says what to do
 * if they have drifted.
 */
const DIVISOR = 9400;

const WORDS = 100000;
const RATE = 250;
const PAYOUT = 200;
/** duet, so the share is 0.5 and the billed-back half is actually visible. */
const FORMAT = "duet";

/**
 * ONE set of expected values, shared by both halves. Derived by hand, longhand:
 *
 *   income:
 *     100,000 words / 9,400 words per finished hour = 10.638297872340425 finished hours
 *     10.638297872340425 hours x $250 per finished hour = $2,659.5744680851063
 *     x narrator share 0.5 (duet)                       = $1,329.7872340425532
 *
 *   editing_cost:
 *     one $200 editor payout, attributed to the BOOK because it settles against
 *     no payment                                        = $200
 *
 *   invoice_total = income + editing x (1 - share):
 *     $1,329.7872340425532 + $200 x (1 - 0.5)           = $1,429.7872340425532
 *
 * The last line is the whole point of the stage: before it, a payout with no
 * payment contributed NOTHING to either figure.
 */
const EXPECTED_EDITING = 200;
const EXPECTED_INCOME = 1329.7872340425532;
const EXPECTED_INVOICE = 1429.7872340425532;

let failures = 0;

function show(v: number | null): string {
  return v == null ? "null" : v.toFixed(4);
}

/**
 * THE REAL-FIGURE GUARD. On the rs_plus branch the hole was null == null. Here
 * it is 0 == 0: `editingCost` returns a number, never null, so a side that had
 * dropped card-level payouts would return 0 — and if the expected value were
 * ever 0 the comparison would agree while proving nothing. Every figure checked
 * here must be non-null AND non-zero.
 */
function assertReal(half: string, actual: number | null, expected: number): void {
  if (actual == null) {
    failures++;
    console.log(`  FAIL ${half} returned null; it should be ${show(expected)}.`);
    return;
  }
  if (Math.abs(actual) < EPSILON) {
    failures++;
    console.log(`  FAIL ${half} returned zero, which is what dropping this branch looks like.`);
    console.log(`       It should be ${show(expected)}.`);
    return;
  }
  if (Math.abs(actual - expected) >= EPSILON) {
    failures++;
    console.log(`  FAIL ${half} disagrees with the hand-derived figure.`);
    console.log(`         computed ${show(actual)}   expected ${show(expected)}`);
    return;
  }
  console.log(`  ok   ${half} — ${show(actual)}`);
}

/** Half one: TypeScript, no database at all. */
function checkTypeScript(): void {
  // A cost against the book, settling against no payment. It arrives in neither
  // `rows` nor `rows[].payouts` — that is exactly why editingCost takes it as a
  // second, required argument.
  const loose: LoosePayout[] = [
    {
      id: "synthetic",
      card_id: "synthetic-card",
      payment_id: null,
      payee_name: "probe editor",
      kind: "editor",
      amount: PAYOUT,
      rate_pfh: null,
      paid_on: null,
      paid_via: "",
      notes: "",
    },
  ];

  const tsEditing = editingCost([] as PaymentRow[], loose);
  const tsIncome = estimatedEarnings(WORDS, RATE, "pfh", FORMAT, null, DIVISOR);
  const tsShare = narratorShareOf(FORMAT, null);
  const tsInvoice =
    tsIncome == null || tsShare == null ? null : tsIncome + tsEditing * (1 - tsShare);

  assertReal("TypeScript editingCost", tsEditing, EXPECTED_EDITING);
  assertReal("TypeScript income", tsIncome, EXPECTED_INCOME);
  assertReal("TypeScript invoice_total", tsInvoice, EXPECTED_INVOICE);
}

/**
 * Half two: the database, against rows that never commit.
 *
 * card_payout_branch_probe() builds its own card AND its own card-level payout,
 * calls card_economics_for_session() in the same transaction so it sees them,
 * then unconditionally rolls both back from inside a plpgsql subtransaction.
 */
async function checkSql(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

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
    console.log("       Re-derive the EXPECTED values by hand and update DIVISOR. Both halves");
    console.log("       must keep sharing one set of values or the check proves nothing.");
    return;
  }

  const { data, error } = await db.rpc("card_payout_branch_probe");
  if (error) {
    // A check that cannot run is NOT a check that passed.
    console.error(`card_payout_branch_probe: ${error.message}`);
    process.exit(2);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    failures++;
    console.log("  FAIL the probe returned no row.");
    return;
  }
  assertReal("SQL editing_cost", row.editing_cost == null ? null : Number(row.editing_cost), EXPECTED_EDITING);
  assertReal("SQL income", row.income == null ? null : Number(row.income), EXPECTED_INCOME);
  assertReal("SQL invoice_total", row.invoice_total == null ? null : Number(row.invoice_total), EXPECTED_INVOICE);
}

async function main(): Promise<number> {
  console.log("The card-level payout branch, against one hand-derived set of figures.\n");
  console.log(
    `  ${WORDS.toLocaleString()} words at $${RATE}/pfh, ${FORMAT} (share 0.5), ` +
      `one $${PAYOUT} editor payout with NO payment`,
  );
  console.log(
    `  expected  editing ${show(EXPECTED_EDITING)}  income ${show(EXPECTED_INCOME)}  ` +
      `invoice ${show(EXPECTED_INVOICE)}\n`,
  );

  checkTypeScript();
  await checkSql();

  console.log(
    failures === 0
      ? "\nBoth sides count a card-level payout. NOTE: this proves each side against\n" +
          "hand-derived figures — NOT that they agree on a real row end to end."
      : `\n${failures} failure(s). The card-level payout branch has changed on one side.`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
