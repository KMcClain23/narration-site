/**
 * What role a NEW account gets, and whether any gate admits it.
 *
 * Usage (from project root):
 *   npm run check-new-account-role
 *
 * WHY THIS EXISTS. profiles.role defaulted to 'editor'. That was harmless for
 * months, because 'editor' meant nothing — until E1 turned it into a real grant
 * covering the whole board. Nothing changed, and the meaning did. No diff shows
 * that, no review catches it, and the code that "caused" it was written long
 * before the code that made it dangerous. A test that asks the question again on
 * every run is the only thing that notices.
 *
 * TWO PRODUCERS set the role for a new account, and the audit checks both:
 *
 *   1. the column DEFAULT
 *   2. handle_new_user, which names the role explicitly and so OVERRIDES the
 *      default entirely
 *
 * The first version of this guard checked only the default. It looked fine —
 * it failed correctly when the default was set back to 'editor'. The hole showed
 * up in the same run: the simulated signup came out 'pending' anyway, because
 * the trigger decided. A guard that fails while the system is safe will also
 * pass while it is not. Both producers, or neither is really checked.
 *
 * The ADMITTED SET IS DERIVED from the bodies of assert_board_access and
 * assert_editor_access rather than listed here. A hardcoded list would go stale
 * exactly when it mattered — the day someone adds a third gate.
 *
 * WHAT THIS DOES NOT COVER. It reads definitions, it does not create a user. The
 * end-to-end proof (insert an auth.users row in a rolled-back transaction and
 * confirm every editor function REFUSES) was run by hand when the default was
 * fixed, and cannot run from here: an inserted auth user cannot be rolled back
 * through PostgREST, and creating a real one to delete it is worse than the gap.
 */

import { createClient } from "@supabase/supabase-js";

type AuditRow = {
  check_name: string;
  observed: string;
  admitted_roles: string[];
  ok: boolean;
  verdict: string;
};

/**
 * Both producers must be reported. If the audit ever returns fewer rows than
 * this, checks have gone MISSING and the run must fail — an audit that silently
 * stops asking one of its questions is the failure this whole guard is about.
 */
const EXPECTED_CHECKS = [
  "profiles.role column default",
  "handle_new_user role literal",
] as const;

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.rpc("role_default_audit");
  if (error) {
    // A check that cannot run is NOT a check that passed.
    console.error(`role_default_audit: ${error.message}`);
    process.exit(2);
  }
  const rows = (data ?? []) as AuditRow[];
  let failures = 0;

  const admitted = rows[0]?.admitted_roles ?? [];
  console.log(`Roles admitted by the gates: ${admitted.join(", ") || "(none found)"}\n`);

  // Zero admitted roles would make every check below vacuously true — nothing
  // can be "a role a gate admits" if the derivation found no gates at all.
  if (admitted.length === 0) {
    console.log("  FAIL the admitted set came back EMPTY.");
    console.log("       That is not a pass. Either assert_board_access and");
    console.log("       assert_editor_access are gone, or their bodies stopped naming");
    console.log("       roles as literals — and this guard is now comparing against");
    console.log("       nothing, which nothing can fail.");
    return 1;
  }

  for (const r of rows) {
    console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.check_name}`);
    console.log(`       ${r.verdict}`);
    if (!r.ok) failures++;
  }

  const found = rows.map(r => r.check_name).sort();
  const missing = [...EXPECTED_CHECKS].filter(c => !found.includes(c));
  if (missing.length > 0) {
    failures++;
    console.log(`\n  FAIL the audit did not report: ${missing.join(", ")}`);
    console.log("       A producer of the role that stopped being checked is the");
    console.log("       same bug one level up.");
  }

  console.log(
    failures === 0
      ? "\nA new account gets a role no gate admits, from both producers."
      : `\n${failures} problem(s): a new account may be granted access on creation.`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
