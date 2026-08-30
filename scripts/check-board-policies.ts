/**
 * The RLS policy set on board_cards, pinned.
 *
 * Usage (from project root):
 *   npm run check-board-policies
 *
 * WHY THIS EXISTS. Today's configuration is correct, and that is not the risk.
 * The risk is someone widening "Role update" in six months for a reason that
 * seems good at the time — which would hand an editor a direct write path to
 * board_cards and route her around every SECURITY DEFINER function E1 and E2
 * built. Those functions are only a boundary while RLS keeps the direct path
 * shut.
 *
 * It checks TWO things, and the second is the one that matters:
 *
 *   1. The policy SET is exactly what it is today. A new policy fails this even
 *      if the audit thinks it is safe, because a new write policy on this table
 *      is a decision somebody should have to state out loud.
 *   2. No policy admits a non-admin WRITE, judged by board_cards_policy_audit().
 *
 * The audit is a database function because pg_policy is not reachable through
 * PostgREST — there is no way to ask this question from here without one.
 *
 * A NOTE ON HOW IT WAS BUILT, because it is the lesson. The first version of the
 * audit matched the policy expression's FORMATTING and flagged the correct
 * policy, whose text carries an ` AS current_app_role)` the planner inserts. The
 * mutation test passed — the bad policy WAS flagged — so mutating alone would
 * have shipped a guard that was red on a correct database. The baseline run is
 * what caught it. A guard has to fire on the bad state AND stay quiet on the
 * good one, and only checking one of those is half a test.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * The policies board_cards has, and is expected to have.
 *
 * If this list needs changing, the change is the thing to think about — not this
 * line. Update it deliberately, in the same commit as the migration, and say why.
 */
const EXPECTED = [
  "Role read",
  "Role update",
  "Service role full access",
] as const;

type PolicyRow = {
  policy_name: string;
  command: string;
  roles: string;
  using_expr: string;
  check_expr: string;
  admits_non_admin_write: boolean;
};

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.rpc("board_cards_policy_audit");
  if (error) {
    // A check that cannot run is NOT a check that passed.
    console.error(`board_cards_policy_audit: ${error.message}`);
    process.exit(2);
  }
  const rows = (data ?? []) as PolicyRow[];
  let failures = 0;

  console.log(`board_cards has ${rows.length} RLS policies.\n`);
  for (const r of rows) {
    const mark = r.admits_non_admin_write ? "ADMITS " : "ok     ";
    console.log(`  ${mark} ${r.policy_name} (${r.command}) — ${r.roles}`);
  }

  // An empty table would make every assertion below vacuously true, and RLS with
  // no policies denies everything, which is a different emergency.
  if (rows.length === 0) {
    console.log("\n  FAIL board_cards has NO policies at all.");
    console.log("       That is not a pass: it means every non-service_role read");
    console.log("       and write is denied, and the board is empty for everyone.");
    return 1;
  }

  const found = rows.map(r => r.policy_name).sort();
  const expected = [...EXPECTED].sort();
  const added = found.filter(n => !expected.includes(n as (typeof EXPECTED)[number]));
  const removed = expected.filter(n => !found.includes(n));

  if (added.length) {
    failures++;
    console.log(`\n  FAIL policies that are not in the pinned set: ${added.join(", ")}`);
    console.log("       A new policy on board_cards is a decision, not a detail. If it is");
    console.log("       intended, add it to EXPECTED in this file and say why in the commit.");
  }
  if (removed.length) {
    failures++;
    console.log(`\n  FAIL pinned policies that no longer exist: ${removed.join(", ")}`);
    console.log("       Removing a policy changes who can read or write the board.");
  }

  const admitting = rows.filter(r => r.admits_non_admin_write);
  if (admitting.length) {
    failures++;
    console.log(`\n  FAIL ${admitting.length} policy/policies admit a non-admin WRITE:`);
    for (const r of admitting) {
      console.log(`         ${r.policy_name} (${r.command})`);
      console.log(`           using: ${r.using_expr}`);
      console.log(`           check: ${r.check_expr}`);
    }
    console.log("       An editor writes through SECURITY DEFINER functions that name their");
    console.log("       columns. A direct write path around them is not a shortcut, it is the");
    console.log("       boundary gone — she could set pfh_rate straight through PostgREST.");
  }

  console.log(
    failures === 0
      ? "\nThe policy set is unchanged and no policy admits a non-admin write."
      : `\n${failures} problem(s) with the board_cards policy set.`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
