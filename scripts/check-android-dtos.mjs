/**
 * Every relation the Android app decodes, against its real column list.
 *
 * ── WHY A SCRIPT AND NOT A KOTLIN TEST ─────────────────────────────────────
 *
 * DecoderExposureTest already pins this hazard — and it did not catch the bug
 * that produced this file, because it pinned BoardCardDto ALONE while the audit
 * that motivated it had listed fourteen relations. A unit test cannot do
 * better: the column lists live in the database, so a Kotlin fixture of them is
 * a copy that goes stale exactly when the real thing changes.
 *
 * This reads the LIVE function signatures and parses the Kotlin DTOs, so the
 * two cannot drift without it going red.
 *
 * ── THE FAILURE IT EXISTS FOR ──────────────────────────────────────────────
 *
 * editor_assignments() was widened with `edited_externally` for the website,
 * and its editor_id became nullable in the same change. The app decodes with
 * ignoreUnknownKeys = false, so the extra key threw; the non-null String could
 * not take the null either. The Editing tab said "No books are in editing" —
 * plausible, quiet, and wrong.
 *
 * ── ONE DIRECTION, BECAUSE ONLY ONE IS SOUNDLY KNOWABLE ────────────────────
 *
 * An UNDECLARED COLUMN is exact: the function's OUT names are recorded, the
 * DTO's are parsed, and a name in the first and not the second throws on the
 * unknown key. No guessing.
 *
 * NULLABILITY IS NOT CHECKED, deliberately. Postgres does not record it for a
 * RETURNS TABLE column — the type is nullable in principle — so it can only be
 * inferred from whatever the function selects, which this cannot see. A first
 * version derived it from board_cards and reported ten mismatches, almost all
 * of them noise about payments and payouts columns that are not on that table
 * at all. A check that cries wolf teaches people to ignore it, which is worse
 * than not having it, so the guess is gone rather than tuned.
 *
 * The nullable-typed-non-null hazard is real (it was half of the
 * editor_assignments break). It is caught by the Kotlin decode tests and by
 * running the app, not here.
 *
 * Usage: npm run check-android-dtos
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ANDROID = process.env.ANDROID_REPO ?? "../dmn-admin-android";
const DATA_DIR = join(ANDROID, "app/src/main/java/com/dmnarration/admin/data");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/**
 * DTO -> the relations it decodes, taken from the decode sites in the
 * repository rather than guessed.
 */
const MAP = {
  BoardCardDto: ["board_for_session", "board_for_editor"],
  CardDetailDto: ["card_detail", "card_detail_for_editor"],
  PickupDto: ["pickups_for_session", "pickups_for_editor"],
  CastMemberDto: ["card_cast"],
  ReleasedBookDto: ["released_for_session"],
  ArchivedCardDto: ["archived_for_session"],
  CareerTotalsDto: ["career_totals_for_session"],
  PaymentDto: ["payments_for_session"],
  PayoutDto: ["payouts_for_session"],
  PayoutSummaryDto: ["payout_summary_for_session"],
  ExpenseDto: ["expenses_for_session"],
  NeedsMeDto: ["pickups_needing_me"],
  EditorAssignmentDto: ["editor_assignments"],
};

let src = "";
try {
  for (const f of readdirSync(DATA_DIR)) {
    if (f.endsWith(".kt")) src += readFileSync(join(DATA_DIR, f), "utf8") + "\n";
  }
} catch (e) {
  // A repo that cannot be read is NOT a repo with no problems.
  console.error(`could not read the Android DTOs at ${DATA_DIR}: ${e.message}`);
  console.error("That is a failure to check, not a pass. Set ANDROID_REPO if it lives elsewhere.");
  process.exit(2);
}

/** The JSON keys a DTO accepts, and whether each is declared nullable. */
function fields(dto) {
  const m = new RegExp(String.raw`(?:data\s+)?class\s+${dto}\s*\(`).exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  const start = i;
  while (i < src.length) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) break; }
    i++;
  }
  const out = new Map();
  for (const line of src.slice(start + 1, i).split("\n")) {
    const sn = /@SerialName\("([^"]+)"\)/.exec(line);
    const pv = /\bva[lr]\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=,]+)/.exec(line);
    if (pv) {
      const name = sn ? sn[1] : pv[1];
      out.set(name, { nullable: pv[2].trim().endsWith("?") });
    }
  }
  return out;
}

const names = [...new Set(Object.values(MAP).flat())];
const { data: fns, error } = await db.rpc("function_out_columns", { p_names: names })
  .then(r => r, () => ({ data: null, error: { message: "helper not present" } }));

/** Fall back to a direct query when the helper RPC is absent. */
let columns = new Map();
if (!error && fns) {
  for (const r of fns) columns.set(r.proname, r.cols);
} else {
  const { data, error: qErr } = await db.rpc("exec_sql_readonly", { q: "" }).then(r => r, () => ({ data: null, error: true }));
  void data; void qErr;
  console.error("no server-side helper for function signatures; falling back is not implemented.");
  console.error("Add function_out_columns(text[]) or run this against a project that has it.");
  process.exit(2);
}

let failures = 0;
const report = [];
for (const [dto, rels] of Object.entries(MAP)) {
  const declared = fields(dto);
  if (!declared) {
    report.push(`  MISSING DTO  ${dto} — not found in ${DATA_DIR}`);
    failures++;
    continue;
  }
  for (const rel of rels) {
    const cols = columns.get(rel);
    if (!cols) {
      report.push(`  MISSING FN   ${rel} — not in the database`);
      failures++;
      continue;
    }
    const undeclared = cols.filter(c => !declared.has(c.name));
    if (undeclared.length === 0) {
      report.push(`  ok           ${dto} ← ${rel} (${cols.length} columns)`);
      continue;
    }
    failures++;
    report.push(`  UNDECLARED   ${dto} ← ${rel}: ${undeclared.map(c => c.name).join(", ")}`);
    report.push(`               throws on the unknown key and EMPTIES the screen`);
  }
}

console.log(report.join("\n"));
console.log(
  failures === 0
    ? `\nAll ${names.length} decoded relations match their DTOs.`
    : `\n${failures} MISMATCH(ES).\n` +
      "The app decodes with ignoreUnknownKeys = false, so each of these empties a\n" +
      "screen rather than degrading a row. Fix the DTO, and remember an installed\n" +
      "build cannot be corrected after the fact.",
);
process.exit(failures === 0 ? 0 : 1);
