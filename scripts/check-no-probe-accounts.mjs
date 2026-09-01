/**
 * No test account may outlive the test that made it.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Every guard in this repo creates a throwaway account, does its work as a real
 * signed-in user, and deletes it in a finally block. NONE of them checked that
 * the delete succeeded — and `auth.admin.deleteUser` can fail and return an
 * error object rather than throwing.
 *
 * Four accounts were found surviving that way, TWO OF THEM WITH THE ADMIN ROLE,
 * hours after the runs that made them. Their passwords were random and never
 * stored, so nothing could sign in as them — but "nobody knows the password" is
 * not the same as "the account does not exist", and an admin row nobody is
 * tracking is exactly the kind of thing that is discovered much later.
 *
 * The scripts now check their own cleanup. This is the backstop for the one
 * that forgets.
 *
 * ── THE ADDRESS IS THE SIGNAL ──────────────────────────────────────────────
 *
 * Every probe uses @example.invalid — a reserved TLD that can never resolve and
 * can never be a real person. So this cannot mistake a colleague for a leftover,
 * and a leftover cannot disguise itself as a colleague.
 *
 * Usage: npm run check-no-probe-accounts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
if (error) {
  console.error(`could not list accounts: ${error.message}`);
  process.exit(2);
}

const users = data?.users ?? [];
const probes = users.filter(u => /@example\.invalid$/i.test(u.email ?? ""));
const real = users.filter(u => !/@example\.invalid$/i.test(u.email ?? ""));

// THE POSITIVE CONTROL. An empty listing and a clean one look identical; if the
// real accounts are not here, this check is reading nothing and proving nothing.
console.log(`${users.length} accounts — ${real.length} real, ${probes.length} probe`);
let failures = 0;
if (real.length === 0) {
  console.log("  FAIL the listing returned no real accounts — it read nothing");
  failures++;
} else {
  console.log(`  ok   the listing works: ${real.map(u => u.email).join(", ")}`);
}

if (probes.length > 0) {
  console.log(`  FAIL ${probes.length} probe account(s) survived their test run:`);
  for (const u of probes) {
    const { data: p } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
    console.log(`         ${u.email}  role=${p?.role ?? "none"}  made ${String(u.created_at).slice(0, 19)}`);
  }
  console.log("       Remove them, and fix the script that left them:");
  console.log("       auth.admin.deleteUser returns an error object, it does not throw.");
  failures++;
} else {
  console.log("  ok   no probe account outlived its run");
}

console.log(failures === 0 ? "\nACCOUNTS CLEAN" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
