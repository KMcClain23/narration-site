/**
 * The two tables that both mean "narrator" must agree.
 *
 * Usage (from project root):
 *   npm run check-narrator-sync
 *
 * WHY THIS EXISTS. `co_narrators` backs the Contacts page and carries the email
 * addresses. `narrators` is what `pickups.assigned_narrator_id` points at. For
 * months the only thing joining them was `co_narrators.name =
 * narrators.display_name` — a string match that happened to work on all 18
 * overlapping rows, and had already failed twice without anyone noticing: Rylee
 * Kuberra exists only in Contacts, Dean only in narrators.
 *
 * They now share a real key (`narrators.co_narrator_id`) and the address
 * propagates along it. This is the thing that notices when they come apart
 * anyway, because the failure is invisible from either screen: Contacts looks
 * complete, the board looks complete, and a pickup email goes to a stale address
 * or to nobody.
 *
 * KNOWN EXCEPTIONS ARE PRINTED, NOT FILTERED. Dean and Rylee Kuberra are
 * legitimately one-sided today. They are listed every run rather than excluded,
 * because a guard that quietly drops the two rows it finds hardest will be
 * equally quiet about the third.
 *
 * WHAT COUNTS AS A FAILURE:
 *   - a name cast on a live book with no `narrators` row (card_cast RAISES on
 *     this, so it takes the editor's card page down)
 *   - a narrator cast on a live book with no Contacts record behind it, which
 *     means they can never gain an email and their pickups can never be sent
 *   - a linked pair whose addresses disagree, i.e. something wrote around the
 *     trigger
 *   - a linked pair whose NAMES disagree: the FK is the truth now, but
 *     `card_cast` still resolves co-narrators by name, so an unmirrored rename
 *     orphans the cast entry
 */

import { createClient } from "@supabase/supabase-js";

type AuditRow = { severity: string; who: string; detail: string };

/**
 * The one-sided records that are fine today.
 *
 * Not used to filter anything — the audit reports them and this list only
 * decides whether to say "as expected". If one of these ever disappears, or a
 * third appears, the run says so out loud.
 */
const EXPECTED_KNOWN = ["Dean", "Rylee Kuberra"] as const;

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.rpc("narrator_sync_audit");
  if (error) {
    // A check that cannot run is NOT a check that passed.
    console.error(`narrator_sync_audit: ${error.message}`);
    process.exit(2);
  }
  const rows = (data ?? []) as AuditRow[];
  let failures = 0;

  // A CONTROL ON THE COUNTS. The audit could return nothing because everything
  // agrees, or because it is looking at empty tables — those are different, and
  // only one of them is a pass.
  const [{ count: nCount }, { count: cCount }] = await Promise.all([
    db.from("narrators").select("id", { count: "exact", head: true }),
    db.from("co_narrators").select("id", { count: "exact", head: true }),
  ]);
  console.log(`narrators: ${nCount} rows · co_narrators: ${cCount} rows\n`);
  if (!nCount || !cCount) {
    console.log("  FAIL one of the tables is EMPTY.");
    console.log("       Every comparison below would agree vacuously.");
    return 1;
  }

  const problems = rows.filter(r => r.severity === "FAIL");
  const known = rows.filter(r => r.severity === "known");

  for (const k of known) {
    console.log(`  known  ${k.who} — ${k.detail}`);
  }

  const knownNames = known.map(k => k.who).sort();
  const expected = [...EXPECTED_KNOWN].sort();
  if (JSON.stringify(knownNames) !== JSON.stringify(expected)) {
    // Not a failure in itself — a new one-sided record may be deliberate — but
    // it is a change to the set somebody decided was acceptable, so it has to be
    // decided again rather than absorbed.
    console.log(`\n  NOTE the one-sided records changed.`);
    console.log(`       was: ${expected.join(", ")}`);
    console.log(`       now: ${knownNames.join(", ") || "(none)"}`);
    console.log(`       If that is intended, update EXPECTED_KNOWN in this file`);
    console.log(`       in the same commit as whatever caused it.`);
    failures++;
  }

  if (problems.length === 0) {
    console.log("\nThe two tables agree.");
  } else {
    console.log(`\n  ${problems.length} divergence(s):`);
    for (const p of problems) console.log(`  FAIL   ${p.who} — ${p.detail}`);
    console.log("\n       Neither screen shows this. Contacts looks complete and the board");
    console.log("       looks complete, and a pickup email goes to a stale address or to");
    console.log("       nobody at all.");
    failures += problems.length;
  }

  return failures === 0 ? 0 : 1;
}

main()
  .then(code => process.exit(code))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
