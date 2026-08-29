/**
 * The TypeScript and `card_economics_for_session()` must agree on every card.
 *
 * Usage (from project root):
 *   npm run check-card-economics
 *
 * WHY THIS EXISTS, AND WHY IT RUNS BEFORE ANY MIGRATION. /payments now reads
 * its figures from the database function; six other surfaces still compute them
 * in TypeScript. The two are pinned to each other BY THIS TEST rather than by
 * construction, and that is the honest description of the current state — not
 * "the web has migrated".
 *
 * If this passes across every card, moving a surface from one to the other
 * cannot change a number. That is the whole argument for running it first: it
 * turns "verify the totals did not move" into "the totals cannot move".
 *
 * WHERE IT RUNS, stated plainly because it changes what the test is worth: it
 * needs SUPABASE service-role credentials, so it runs locally via
 * `npm run check-card-economics`, and on GitHub Actions
 * (.github/workflows/reconcile.yml) via `npm run check-card-economics:ci`,
 * which carries them as repository secrets.
 *
 * IT IS A SIGNAL, NOT A DEPLOY GATE. Vercel builds from GitHub independently of
 * Actions, so a red run here does not stop a deploy. Calling it a gate would be
 * the same failure it exists to catch — something that looks like it is holding
 * a line and is not. If the secrets are absent the run FAILS rather than skips,
 * because a skipped run reports green and a green tick that checked nothing is
 * worse than no tick at all.
 *
 * The comparison calls the SAME functions the app calls. It does not
 * reimplement them: a reconciliation test that reimplements one side is
 * comparing two copies of the thing it is trying to prove has only one.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { narratorShareOf } from "@/components/admin/board-card-utils";
import {
  cardExpected,
  editingCost,
  type MoneyCard,
  type PaymentRow,
} from "@/lib/payments";

/** Cents. Both sides are numeric/float; exact equality would fail on noise. */
const EPSILON = 0.005;

type EconRow = {
  card_id: string;
  title: string;
  status: string;
  share: number | null;
  income: number | null;
  editing_cost: number | null;
  invoice_total: number | null;
};

let failures = 0;
const covered = new Map<string, number>();

function bucket(name: string) {
  covered.set(name, (covered.get(name) ?? 0) + 1);
}

function near(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < EPSILON;
}

function show(v: number | null): string {
  return v == null ? "null" : v.toFixed(4);
}

function compare(title: string, field: string, ts: number | null, db: number | null) {
  if (near(ts, db)) return;
  failures++;
  console.log(`  FAIL ${title} — ${field}`);
  console.log(`         TypeScript ${show(ts)}   database ${show(db)}`);
}

/**
 * rs_plus is a live branch in BOTH implementations — board-card-utils.ts guards
 * `paymentType !== "pfh" && paymentType !== "rs_plus"`, the database guards
 * `payment_type not in ('pfh', 'rs_plus')` — and no card in Dean's data uses
 * it. A branch nothing reaches is a branch nothing checks: the two lists could
 * drift apart and every run would still say "All cards reconcile."
 *
 * The fixture has to be a REAL unarchived row, because the function reads
 * board_cards directly and filters `archived_at is null`. There is no hidden
 * corner to put it in. So it is created, compared, and deleted.
 *
 * STATED PLAINLY, because it is a real cost: for the few seconds a run takes, a
 * card that is not Dean's exists on the live board and inside the live totals.
 * A leftover from a killed run is swept at the start of the next one.
 */
const FIXTURE_TITLE = "ZZZ reconciliation fixture — rs_plus (auto-deleted)";

async function sweepFixture(db: SupabaseClient): Promise<void> {
  const { error } = await db.from("board_cards").delete().eq("title", FIXTURE_TITLE);
  // A sweep that cannot run means the delete at the end probably cannot either,
  // and this must not leave a card behind quietly.
  if (error) throw new Error(`could not sweep the rs_plus fixture: ${error.message}`);
}

async function createFixture(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("board_cards")
    .insert({
      title: FIXTURE_TITLE,
      status: "recording",
      payment_type: "rs_plus",
      // Round numbers, so a mismatch reads as a formula difference rather than
      // as floating-point noise.
      word_count: 100000,
      pfh_rate: 250,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not create the rs_plus fixture: ${error.message}`);
  return data.id as string;
}

async function removeFixture(db: SupabaseClient, id: string | null): Promise<void> {
  if (!id) return;
  const { error } = await db.from("board_cards").delete().eq("id", id);
  if (error) {
    // Loud, and by title, so it can be removed by hand.
    console.error("");
    console.error(`  COULD NOT DELETE THE FIXTURE (${error.message}).`);
    console.error(
      `  Delete the card titled "${FIXTURE_TITLE}" by hand — it is in the live totals until you do.`,
    );
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const divisorRes = await db
    .from("site_settings")
    .select("value")
    .eq("key", "studio_words_per_finished_hour")
    .single();
  const divisor = Number(divisorRes.data?.value);
  if (!divisor) {
    console.error("Could not read studio_words_per_finished_hour.");
    process.exit(2);
  }

  // The fixture exists for the whole comparison, so BOTH sides see it.
  await sweepFixture(db);
  let fixtureId: string | null = null;
  try {
    fixtureId = await createFixture(db);
    return await runComparison(db, divisor);
  } finally {
    await removeFixture(db, fixtureId);
  }
}

async function runComparison(db: SupabaseClient, divisor: number): Promise<number> {
  const { data: cards, error: cardsErr } = await db
    .from("board_cards")
    .select(
      "id, title, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, royalty_split_percent, co_narrator",
    )
    .is("archived_at", null);
  if (cardsErr) {
    throw new Error(`board_cards: ${cardsErr.message}`);
  }

  const { data: payments, error: payErr } = await db
    .from("payments")
    .select(
      "id, card_id, kind, period, label, amount_expected, amount_gross, amount_received, due_on, invoiced_on, invoice_number, method, notes, sort_order",
    );
  if (payErr) {
    throw new Error(`payments: ${payErr.message}`);
  }

  const { data: payouts, error: poErr } = await db
    .from("payment_payouts")
    .select("id, payment_id, payee_name, kind, amount, paid_on");
  if (poErr) {
    throw new Error(`payment_payouts: ${poErr.message}`);
  }

  // Payouts hang off payment rows, the same shape lib/payments.ts expects.
  const payoutsByPayment = new Map<string, unknown[]>();
  for (const po of payouts ?? []) {
    const list = payoutsByPayment.get(po.payment_id as string) ?? [];
    list.push(po);
    payoutsByPayment.set(po.payment_id as string, list);
  }
  const rowsByCard = new Map<string, PaymentRow[]>();
  for (const p of payments ?? []) {
    const row = { ...p, payouts: payoutsByPayment.get(p.id as string) ?? [] } as unknown as PaymentRow;
    const list = rowsByCard.get(p.card_id as string) ?? [];
    list.push(row);
    rowsByCard.set(p.card_id as string, list);
  }

  const { data: econ, error: econErr } = await db.rpc("card_economics_for_session");
  if (econErr) {
    // A check that cannot run is NOT a check that passed.
    // Thrown, not exited: process.exit would skip the fixture delete.
    throw new Error(`card_economics_for_session: ${econErr.message}`);
  }
  const byId = new Map<string, EconRow>();
  for (const e of (econ ?? []) as EconRow[]) byId.set(e.card_id, e);

  console.log(`Comparing ${(cards ?? []).length} unarchived cards.\n`);

  for (const raw of cards ?? []) {
    const card = raw as unknown as MoneyCard & {
      id: string;
      title: string;
      status: string;
      word_count: number | null;
      pfh_rate: number | null;
      payment_type: string | null;
      narration_format: string | null;
      narrator_share_percent: number | null;
    };
    const rows = rowsByCard.get(card.id) ?? [];
    const dbRow = byId.get(card.id);
    if (!dbRow) {
      failures++;
      console.log(`  FAIL ${card.title} — present in board_cards, absent from the function`);
      continue;
    }

    // Which edge cases this run actually exercises. A bucket with no card in
    // it is UNTESTED, not passing, and is reported as such below.
    if (card.narration_format === "multicast") bucket("multicast (share null)");
    if (card.status === "recast") bucket("status recast (income null)");
    if (card.payment_type === "rs") bucket("payment_type rs");
    if (card.payment_type === "rs_plus") bucket("payment_type rs_plus");
    if (!card.word_count) bucket("word_count 0 or null");
    if (card.narrator_share_percent != null && card.narration_format == null) {
      bucket("narrator_share_percent set, no format");
    }
    if (rows.some(r => r.kind !== "royalty" && r.amount_expected != null)) {
      bucket("explicit amount_expected on a non-royalty row");
    }
    if (editingCost(rows) > 0) bucket("editing cost present");

    const tsShare = narratorShareOf(card.narration_format, card.narrator_share_percent);
    const tsIncome = cardExpected(card, rows, divisor);
    const tsEditing = editingCost(rows);
    // COMPOSED from the three TypeScript primitives rather than called.
    // cardInvoiceTotal was deleted when /payments moved onto the function, so
    // there is no TS implementation of this figure left to call — which is the
    // point. This reconstructs the composition the deleted function performed,
    // and checks the database agrees with the parts TypeScript still owns.
    const tsInvoice =
      tsIncome == null ? null : tsIncome + tsEditing * (1 - (tsShare ?? 1));

    // The fixture reconciling is not enough. If BOTH sides returned null for
    // rs_plus — which is exactly what a dropped rs_plus would look like on the
    // side that dropped it — null equals null and the run passes having proved
    // nothing. The fixture must produce a real figure on both sides.
    if (card.title === FIXTURE_TITLE) {
      if (tsIncome == null || dbRow.income == null) {
        failures++;
        console.log("  FAIL the rs_plus fixture earned nothing on one side:");
        console.log(`         TypeScript ${show(tsIncome)}   database ${show(dbRow.income)}`);
        console.log("       Both null reconciles and proves nothing — rs_plus has been");
        console.log("       dropped from one of the two lists.");
      }
    }

    compare(card.title, "share", tsShare, dbRow.share);
    compare(card.title, "income", tsIncome, dbRow.income);
    compare(card.title, "editing_cost", tsEditing, dbRow.editing_cost);
    compare(card.title, "invoice_total", tsInvoice, dbRow.invoice_total);
  }

  const EDGE_CASES = [
    "multicast (share null)",
    "status recast (income null)",
    "payment_type rs",
    "payment_type rs_plus",
    "word_count 0 or null",
    "narrator_share_percent set, no format",
    "explicit amount_expected on a non-royalty row",
    "editing cost present",
  ];
  console.log("Edge-case coverage in today's data:");
  for (const name of EDGE_CASES) {
    const n = covered.get(name) ?? 0;
    console.log(`  ${n > 0 ? "covered " : "NO ROWS "} ${String(n).padStart(2)}  ${name}`);
  }
  if (!(covered.get("payment_type rs_plus") ?? 0)) {
    failures++;
    console.log("");
    console.log("  FAIL the rs_plus fixture was not compared. It is created before the");
    console.log("       fetch and deleted after, so an empty bucket means it never reached");
    console.log("       one of the two sides — and this run proves nothing about rs_plus.");
  }

  const uncovered = EDGE_CASES.filter(e => !(covered.get(e) ?? 0));
  if (uncovered.length) {
    console.log(
      `\n  ${uncovered.length} edge case(s) have NO CARD in today's data. They are UNTESTED,\n` +
        "  not passing — a branch nothing reaches is a branch nothing checks.",
    );
  }

  console.log(
    failures === 0
      ? "\nAll cards reconcile."
      : `\n${failures} mismatch(es). Do NOT migrate — report both figures and let Dean decide which side is right.`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
