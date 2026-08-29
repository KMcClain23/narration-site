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
  type LoosePayout,
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

  return await runComparison(db, divisor);
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
    .select("id, card_id, payment_id, payee_name, kind, amount, paid_on");
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
  const looseByCard = new Map<string, LoosePayout[]>();
  for (const po of payouts ?? []) {
    if (po.payment_id != null) continue;
    const cardId = po.card_id as string;
    const list = looseByCard.get(cardId) ?? [];
    list.push(po as unknown as LoosePayout);
    looseByCard.set(cardId, list);
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
    const loose = looseByCard.get(card.id) ?? [];
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
    if (editingCost(rows, loose) > 0) bucket("editing cost present");

    const tsShare = narratorShareOf(card.narration_format, card.narrator_share_percent);
    const tsIncome = cardExpected(card, rows, divisor);
    const tsEditing = editingCost(rows, loose);
    // COMPOSED from the three TypeScript primitives rather than called.
    // cardInvoiceTotal was deleted when /payments moved onto the function, so
    // there is no TS implementation of this figure left to call — which is the
    // point. This reconstructs the composition the deleted function performed,
    // and checks the database agrees with the parts TypeScript still owns.
    const tsInvoice =
      tsIncome == null ? null : tsIncome + tsEditing * (1 - (tsShare ?? 1));

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
  // rs_plus has no card in Dean's data and is NOT expected to. It is covered by
  // scripts/check-rs-plus-branch.ts, which checks each side against one
  // hand-derived figure without touching live data. That is a SMALLER claim
  // than the cases here carry — those run both implementations over the same
  // real card — so it is not filed as equivalent, and rs_plus still reports as
  // uncovered below.
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
