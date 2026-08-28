/**
 * No function in the public schema may be executable by PUBLIC or by anon.
 *
 * Usage (from project root):
 *   npm run check-function-grants
 *
 * This exists because widening two RPCs re-opened them to anon, silently, and
 * the migration that did it carried a comment asserting the opposite.
 *
 * THE MECHANISM, because it is not obvious and it will happen again:
 *
 *   CREATE OR REPLACE FUNCTION  preserves the existing ACL.
 *   DROP + CREATE               resets it, and CREATE grants EXECUTE to PUBLIC.
 *
 * Postgres will not change a function's return type in place, so widening a
 * table-returning RPC REQUIRES drop-and-create. The grants go with the dropped
 * function and the new one starts open.
 *
 * Re-granting the intended roles by name does not prevent this. The leak
 * arrives through PUBLIC, and no named grant touches PUBLIC — so "I re-granted
 * the right roles" and "only the right roles can execute this" are different
 * statements, and only the second one is about who can call the function.
 *
 * WHY THE WHOLE CLASS AND NOT THE CHANGED ONES. Listing grantees for the two
 * functions that changed would have shown four roles with nothing to say the
 * fourth was wrong. The four untouched RPCs were the control: they showed
 * three, the recreated pair showed four, and the comparison is what made it
 * visible. A verification of the thing you changed carries no control; a
 * verification across the whole class carries its own. So this checks EVERY
 * function in the schema, including ones that do not exist yet.
 *
 * PUBLIC is grantee OID 0 in aclexplode() and matches no row in pg_roles, so a
 * plain join drops it without comment — which is how a check for this can
 * report clean while the grant is sitting there. The query below left-joins and
 * treats a null rolname as PUBLIC.
 */

import { createClient } from "@supabase/supabase-js";

const ALLOWED = ["authenticated", "postgres", "service_role", "supabase_admin"];

/**
 * The audit lives in the database, as a named function, following
 * board_cards_exclusion_audit. A general SQL-over-RPC hole would be a far
 * larger thing to own than the problem it solves.
 */
const AUDIT_RPC = "function_grant_audit";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.rpc(AUDIT_RPC);
  if (error) {
    // A check that cannot run is NOT a check that passed — exit 2, distinct
    // from the exit 1 that means it ran and found something.
    console.error(`Could not run ${AUDIT_RPC}: ${error.message}`);
    process.exit(2);
  }

  const rows = (data ?? []) as {
    function_name: string;
    grantee: string;
    callable: boolean;
  }[];

  // A trigger function cannot be invoked directly whoever holds EXECUTE —
  // Postgres refuses with "trigger functions can only be called as triggers",
  // verified against this database rather than assumed. Its grant is inert, so
  // it is REPORTED but does not fail the check. Listing them as failures would
  // bury the callable ones, and a guard that is mostly noise gets ignored.
  const callable = rows.filter(r => r.callable);
  const inert = rows.filter(r => !r.callable);

  if (inert.length > 0) {
    const names = [...new Set(inert.map(r => r.function_name))];
    console.log(`  note ${names.length} trigger function(s) also grant to PUBLIC/anon,`);
    console.log("       which is inert — Postgres refuses to call a trigger function directly:");
    console.log(`       ${names.join(", ")}`);
    console.log("");
  }

  if (callable.length === 0) {
    console.log("  ok   no CALLABLE function in public grants EXECUTE to PUBLIC or anon");
    console.log(`  (allowed grantees: ${ALLOWED.join(", ")})`);
    console.log("\nAll checks passed.");
    process.exit(0);
  }

  console.log("  FAIL these CALLABLE functions are executable by PUBLIC or anon:");
  for (const r of callable) console.log(`         ${r.function_name}  <-  ${r.grantee}`);
  console.log(
    "\n  A drop-and-recreate resets a function ACL and grants EXECUTE to\n" +
      "  PUBLIC. Revoke from PUBLIC as well as from anon by name:\n" +
      "    revoke execute on function public.<name>(<args>) from public;\n" +
      "    revoke execute on function public.<name>(<args>) from anon;",
  );
  console.log(`\n${callable.length} grant(s) FAILED.`);
  process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
