/**
 * /payments must render COSTED FIGURES, not merely return 200.
 *
 * Usage (from project root, with a dev server running):
 *   npm run check-payments-costed
 *
 * This exists because /payments showed every one of 33 projects as
 * "Cannot be worked out — settings unreadable" for two days while every
 * request on the page returned 200 and every stored value was correct.
 *
 * Two existing checks both passed throughout, and the reason each passed is
 * the reason this file is not either of them:
 *
 *   check-settings-honesty imports getStudioSettings and calls it directly.
 *   It proves the LOADER reads 9400. It never touches the endpoint that
 *   serves it, so a route that wrapped the loader's answer in a shape no
 *   client could read would not have moved it.
 *
 *   check-first-render fetches the real routes but asserts HTTP STATUS. A
 *   page rendering an em-dash against all 33 projects returns 200 all day.
 *
 * So this one goes through the ROUTE, parses the body the way the CLIENT
 * parses it, and then asserts a real number comes out the other end.
 *
 * WHAT IT DOES NOT COVER, stated so nobody reads more into a pass than is
 * there: the defect that caused the outage was a stale useMemo dependency,
 * which is React runtime behaviour and not reachable from Node without a
 * browser. This check would NOT have caught it. What catches that is
 * react-hooks/exhaustive-deps, promoted to an error in eslint.config.mjs —
 * the two are complements, and neither is sufficient.
 *
 * What this DOES catch: the route/client shape contract drifting, and the
 * costing arithmetic going absent for a project that should have a figure.
 */

import { projectState, rowValue, PROJECT_STATE_LABEL } from "@/lib/payments";
import type { MoneyCard, PaymentRow } from "@/lib/payments";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";

function adminCookie(): string {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  if (!secret) {
    console.error(
      "ADMIN_SECRET_KEY is not set. Run with --env-file=.env.local, as the npm script does.",
    );
    process.exit(2);
  }
  return `dmn_admin_key=${secret}`;
}

let failures = 0;
function fail(msg: string) {
  failures++;
  console.log(`  FAIL ${msg}`);
}
function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}

async function main() {
  const cookie = adminCookie();

  // 1. THE ROUTE, not the function.
  const res = await fetch(`${BASE}/api/studio-settings`, { headers: { cookie } });
  if (res.status !== 200) {
    fail(`/api/studio-settings answered ${res.status}, not 200`);
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  ok("/api/studio-settings answered 200");

  const body = await res.json();

  // 2. PARSED THE WAY THE CLIENT PARSES IT. Written to mirror
  //    useStudioSettings exactly, including the double dereference — the
  //    route wraps in { settings: ... } and the loader's own return value is
  //    { settings, issues, failure }, so the rates live at
  //    body.settings.settings. That nesting is intentional on both sides;
  //    the point of this line is that it stays that way on both sides.
  const read = body?.settings;
  if (!read?.settings) {
    fail("the response shape is not what the client reads (body.settings.settings)");
    console.log(`  body was: ${JSON.stringify(body).slice(0, 200)}`);
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  ok("the body parses the way useStudioSettings parses it");

  const finishedRate: number | null = read.settings.wordsPerFinishedHour ?? null;
  if (finishedRate == null) {
    fail("wordsPerFinishedHour came back null through the route");
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  ok(`wordsPerFinishedHour = ${finishedRate} through the route`);

  // 3. A REAL NUMBER FOR A REAL PROJECT.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("  (skipping the costing assertion — Supabase env not set)");
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Errors are CHECKED, not destructured away. The first version of this script
  // asked for a `paid_on` column that does not exist, ignored the error, got
  // zero rows back and reported "no project produced a non-zero amount" — a
  // failure that looked like the app's and was the script's. A guard that can
  // fail for its own reasons has to say which reason.
  const { data: cards, error: cardsError } = await db
    .from("board_cards")
    .select("id, title, status, word_count, pfh_rate, payment_type, narration_format, narrator_share_percent, royalty_split_percent, words_recorded")
    .is("archived_at", null);
  if (cardsError) {
    fail(`could not read board_cards: ${cardsError.message}`);
    console.log(`
${failures} check(s) FAILED.`);
    process.exit(1);
  }
  const { data: payments, error: paymentsError } = await db
    .from("payments")
    .select("id, card_id, kind, period, label, amount_expected, amount_gross, amount_received, due_on, invoiced_on, invoice_number");
  if (paymentsError) {
    fail(`could not read payments: ${paymentsError.message}`);
    console.log(`
${failures} check(s) FAILED.`);
    process.exit(1);
  }
  ok(`read ${(cards ?? []).length} cards and ${(payments ?? []).length} payment rows`);

  const rowsByCard = new Map<string, PaymentRow[]>();
  for (const p of (payments ?? []) as unknown as (PaymentRow & { card_id: string })[]) {
    const list = rowsByCard.get(p.card_id) ?? [];
    list.push(p);
    rowsByCard.set(p.card_id, list);
  }

  const all = (cards ?? []) as unknown as MoneyCard[];
  if (all.length === 0) {
    fail("no non-archived board cards to cost");
  }

  // Every project's state, computed with the rate the ROUTE actually served.
  let unknown = 0;
  let costed = 0;
  for (const card of all) {
    const rows = rowsByCard.get(card.id) ?? [];
    const state = projectState(card, rows, finishedRate);
    if (state === "unknown") unknown++;
    const value = rows.reduce((s, r) => s + (rowValue(r, card, rows, finishedRate) || 0), 0);
    if (value > 0) costed++;
  }

  // THE ASSERTION THE OUTAGE WOULD HAVE FAILED. With a readable rate, no
  // project can be "unknown": projectState returns it only when the rate is
  // null, so one here means the rate did not reach the arithmetic.
  if (unknown > 0) {
    fail(
      `${unknown} of ${all.length} projects are "${PROJECT_STATE_LABEL.unknown}" ` +
        `while the route served ${finishedRate}`,
    );
  } else {
    ok(`all ${all.length} projects resolve to a real state (none uncostable)`);
  }

  // And at least one has an actual figure, so a page of zeroes cannot pass.
  if (costed === 0) {
    fail("no project produced a non-zero amount — the page would show only em-dashes");
  } else {
    ok(`${costed} project(s) carry a real amount`);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
