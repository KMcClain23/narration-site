/**
 * Make the touch-trigger's exclusion drift loud.
 *
 * Usage (from project root):
 *   npm run check-updated-at-exclusions
 *
 * W2 happened because the exclusion was a literal list of four column names and a
 * fifth amazon column was added later without anyone updating it. The fix matched
 * by prefix instead, which removes *that* failure but not the underlying one: the
 * prefix now assumes every `amazon_` column is machine-written. `amazon_asin` and
 * `amazon_url` are both plausible fields on a book record, and the day one is
 * added as something a person types, editing it silently stops counting as
 * activity — no error, just a card that never rises in "Last activity".
 *
 * So this asserts the rule the prefix is standing in for:
 *
 *   the columns the trigger excludes  ==  the columns the ratings cron writes,
 *                                          plus updated_at itself
 *
 * NEITHER SIDE IS HARDCODED HERE, deliberately. A hardcoded expectation is the
 * bug we just fixed wearing a test's clothes: it would agree with the schema on
 * the day it was written and go on agreeing forever. The exclusion side comes
 * from `board_cards_exclusion_audit()`, which extracts the predicate from
 * `pg_get_functiondef` of the trigger that is actually installed. The cron side
 * is read out of the cron's own source.
 *
 * It goes red when:
 *   - a column the cron writes is not excluded  (a robot column outside the
 *     prefix — W2 itself, and it would have caught W2)
 *   - a column is excluded that the cron does not write  (someone added
 *     `amazon_asin` for a human to type)
 *   - an excluded column is granted UPDATE to `authenticated`  (someone made a
 *     machine column writable from the phone)
 *
 * A red result is not automatically a defect. It is the design decision
 * surfacing at the point it is being made, rather than as a Last-activity column
 * that quietly stopped meaning anything.
 *
 * NOTE: this repo has no test runner, so this is a script rather than a test and
 * nothing runs it automatically. It is a check you invoke, not a guard that
 * stands watch.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const CRON_SOURCE = "src/app/api/cron/refresh-amazon-rating/route.ts";

/**
 * Column names the cron actually assigns, read from its source.
 *
 * Scoped to the arguments of `.update(...)` rather than scanned loosely. A loose
 * scan picks up the `Candidate` type declaration — `id`, `title`,
 * `audible_link`, `released_at` — and reports five columns the cron only ever
 * reads. A check that is red for reasons that are not real teaches people to
 * ignore it, which is worse than not having it.
 */
function columnsWrittenByCron(allColumns: Set<string>): Set<string> {
  const raw = readFileSync(resolve(process.cwd(), CRON_SOURCE), "utf-8");

  // Comments first. This file explains at length which columns it does NOT
  // touch, and counting those would invert the whole check.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  /** The balanced region starting at `code[open]`, which must be a bracket. */
  function balanced(open: number): string {
    const pairs: Record<string, string> = { "(": ")", "{": "}" };
    const close = pairs[code[open]];
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === code[open]) depth++;
      else if (code[i] === close) {
        depth--;
        if (depth === 0) return code.slice(open + 1, i);
      }
    }
    return "";
  }

  const keysIn = (region: string): string[] =>
    [...region.matchAll(/\b([a-z_][a-z0-9_]*)\s*:/g)].map(m => m[1]);

  const found = new Set<string>();
  const add = (name: string) => {
    if (allColumns.has(name)) found.add(name);
  };

  for (const m of code.matchAll(/\.update\s*\(/g)) {
    const arg = balanced((m.index as number) + m[0].length - 1).trim();

    if (arg.startsWith("{")) {
      // .update({ amazon_rating_attempted_at: at })
      keysIn(arg).forEach(add);
      continue;
    }

    // .update(update) — follow the variable to where it was built, and pick up
    // anything assigned onto it afterwards.
    const varName = arg.match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (!varName) continue;

    const declRe = new RegExp("\\b(?:const|let|var)\\s+" + varName + "\\b[^=]*=\\s*\\{");
    const declAt = code.search(declRe);
    if (declAt !== -1) keysIn(balanced(code.indexOf("{", declAt))).forEach(add);

    const assignRe = new RegExp("\\b" + varName + "\\.([a-z_][a-z0-9_]*)\\s*=[^=]", "g");
    for (const a of code.matchAll(assignRe)) add(a[1]);
  }

  return found;
}

function report(title: string, cols: string[]): void {
  console.log(`  ${title}: ${cols.length ? cols.sort().join(", ") : "(none)"}`);
}

async function main() {
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");

  const { data, error } = await supabaseAdmin.rpc("board_cards_exclusion_audit");
  if (error) {
    console.error("could not read the exclusion audit:", error.message);
    process.exit(1);
  }

  type Row = { column_name: string; excluded: boolean; granted_to_authenticated: boolean };
  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    console.error("the audit returned no columns — that cannot be right");
    process.exit(1);
  }

  const all = new Set(rows.map(r => r.column_name));
  const excluded = new Set(rows.filter(r => r.excluded).map(r => r.column_name));
  const grantedAndExcluded = rows
    .filter(r => r.excluded && r.granted_to_authenticated)
    .map(r => r.column_name);

  const cron = columnsWrittenByCron(all);

  // updated_at is excluded because the trigger writes it, not because the cron
  // does. It is the one member of the exclusion with a different reason.
  const expected = new Set([...cron, "updated_at"]);

  const notExcluded = [...expected].filter(c => !excluded.has(c));
  const gratuitous = [...excluded].filter(c => !expected.has(c));

  console.log(`\ncolumns on board_cards: ${all.size}`);
  report("excluded by the deployed trigger", [...excluded]);
  report(`written by ${CRON_SOURCE}`, [...cron]);

  const problems: string[] = [];

  if (notExcluded.length) {
    problems.push(
      `the cron writes ${notExcluded.sort().join(", ")}, which the trigger does NOT exclude — ` +
        `every one of those writes bumps updated_at. This is W2.`,
    );
  }
  if (gratuitous.length) {
    problems.push(
      `the trigger excludes ${gratuitous.sort().join(", ")}, which the cron does not write — ` +
        `if a person edits one of those it will not count as activity.`,
    );
  }
  if (grantedAndExcluded.length) {
    problems.push(
      `${grantedAndExcluded.sort().join(", ")} is excluded as machine-written but IS granted ` +
        `UPDATE to authenticated — a phone can write a column that will never register as activity.`,
    );
  }

  if (problems.length) {
    console.error("\nFAIL");
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "\nThis is not automatically a defect. Decide which side is wrong and change that side,\n" +
        "then update this expectation by changing the code it is derived from — never by\n" +
        "hardcoding a list here.",
    );
    process.exit(1);
  }

  console.log("\nPASS — the exclusion set is exactly what the cron writes, plus updated_at.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
