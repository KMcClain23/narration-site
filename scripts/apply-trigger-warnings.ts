/**
 * Populate trigger_warnings on board_cards from src/data/trigger-warnings.json.
 *
 * Usage (from project root):
 *   npm run apply-trigger-warnings            # dry-run (default — safe, no writes)
 *   npm run apply-trigger-warnings -- --apply # actually update DB rows
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── .env.local loader ───────────────────────────────────────────────────────
// Must run BEFORE supabaseAdmin is imported (dynamic import below ensures order).

function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
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

// ─── types ───────────────────────────────────────────────────────────────────

interface TriggerEntry {
  title: string;
  author: string;
  trigger_warnings: string[];
}

interface DbRow {
  id: string;
  title: string;
  author: string;
  trigger_warnings: string[] | null;
}

type MatchStatus = "WILL_UPDATE" | "NO_CHANGE" | "NOT_FOUND";

interface Plan {
  jsonTitle: string;
  jsonAuthor: string;
  dbId: string | null;
  currentWarnings: string[];
  newWarnings: string[];
  status: MatchStatus;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase();

function arraysEqualIgnoreOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Dynamic import ensures env vars are loaded before the Supabase client initialises.
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");

  const applyMode = process.argv.includes("--apply");
  const isDryRun = !applyMode;

  console.log("\n── Trigger Warnings Applicator ──────────────────────────────────");
  console.log(`Mode: ${isDryRun ? "DRY RUN  (pass --apply to commit changes)" : "APPLY"}\n`);

  // Load JSON
  const jsonPath = resolve(process.cwd(), "src/data/trigger-warnings.json");
  const jsonEntries: TriggerEntry[] = JSON.parse(readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${jsonEntries.length} entries from trigger-warnings.json`);

  // Fetch DB rows
  const { data: dbRows, error: fetchError } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, author, trigger_warnings")
    .in("status", ["contracted", "recording", "editing", "released"]);

  if (fetchError) {
    console.error("Failed to fetch board_cards:", fetchError.message);
    process.exit(1);
  }

  const rows = (dbRows ?? []) as DbRow[];
  console.log(`Fetched ${rows.length} rows from board_cards\n`);

  // Build lookup: "normTitle|normAuthor" → row
  const rowMap = new Map<string, DbRow>();
  for (const row of rows) {
    rowMap.set(`${norm(row.title)}|${norm(row.author)}`, row);
  }

  // Build set of JSON keys for "unmatched DB rows" report
  const jsonKeySet = new Set(
    jsonEntries.map(e => `${norm(e.title)}|${norm(e.author)}`)
  );

  // Build plan
  const plans: Plan[] = [];
  const notFound: TriggerEntry[] = [];

  for (const entry of jsonEntries) {
    const key = `${norm(entry.title)}|${norm(entry.author)}`;
    const row = rowMap.get(key);

    if (!row) {
      notFound.push(entry);
      plans.push({
        jsonTitle: entry.title,
        jsonAuthor: entry.author,
        dbId: null,
        currentWarnings: [],
        newWarnings: entry.trigger_warnings,
        status: "NOT_FOUND",
      });
      continue;
    }

    const currentWarnings: string[] = Array.isArray(row.trigger_warnings)
      ? row.trigger_warnings
      : [];
    const newWarnings: string[] = entry.trigger_warnings;
    const unchanged = arraysEqualIgnoreOrder(currentWarnings, newWarnings);

    plans.push({
      jsonTitle: entry.title,
      jsonAuthor: entry.author,
      dbId: row.id,
      currentWarnings,
      newWarnings,
      status: unchanged ? "NO_CHANGE" : "WILL_UPDATE",
    });
  }

  // Print plan table
  const STATUS_ICON: Record<MatchStatus, string> = {
    WILL_UPDATE: "→",
    NO_CHANGE:   "✓",
    NOT_FOUND:   "✗",
  };

  const titleW = Math.max(...plans.map(p => p.jsonTitle.length), 5);
  const authorW = Math.max(...plans.map(p => p.jsonAuthor.length), 6);

  const header = `${"Title".padEnd(titleW)}  ${"Author".padEnd(authorW)}  Cur  New  Status`;
  console.log(header);
  console.log("─".repeat(header.length + 4));

  for (const p of plans) {
    console.log(
      `${p.jsonTitle.padEnd(titleW)}  ${p.jsonAuthor.padEnd(authorW)}  ` +
      `${String(p.currentWarnings.length).padStart(3)}  ` +
      `${String(p.newWarnings.length).padStart(3)}  ` +
      `${STATUS_ICON[p.status]} ${p.status}`
    );
  }

  // DB rows not in JSON
  const unmatchedDb = rows.filter(r => !jsonKeySet.has(`${norm(r.title)}|${norm(r.author)}`));
  if (unmatchedDb.length > 0) {
    console.log("\n── DB rows with no JSON entry (trigger_warnings unchanged) ──────────");
    for (const r of unmatchedDb) {
      const cur = Array.isArray(r.trigger_warnings) ? r.trigger_warnings.length : 0;
      console.log(`  · "${r.title}" by ${r.author}  (${cur} existing warnings)`);
    }
  }

  const toUpdate = plans.filter(p => p.status === "WILL_UPDATE");
  const noChange = plans.filter(p => p.status === "NO_CHANGE");

  console.log("\n── Summary ─────────────────────────────────────────────────────────");
  console.log(`  Will update  : ${toUpdate.length}`);
  console.log(`  No change    : ${noChange.length}`);
  console.log(`  Not found    : ${notFound.length}`);
  console.log(`  Unmatched DB : ${unmatchedDb.length}`);

  if (isDryRun) {
    console.log("\nDRY RUN complete — no changes written.");
    if (notFound.length > 0) {
      console.error(
        `\n⚠  ${notFound.length} JSON entr${notFound.length === 1 ? "y" : "ies"} matched no DB row:`
      );
      for (const e of notFound) {
        console.error(`   · "${e.title}" by ${e.author}`);
      }
      process.exit(1);
    }
    console.log('Pass --apply to write changes: npm run apply-trigger-warnings -- --apply');
    process.exit(0);
  }

  // Apply
  console.log(`\n── Applying ${toUpdate.length} update(s) ────────────────────────────────────`);

  let successCount = 0;
  let failCount = 0;

  for (const p of toUpdate) {
    if (!p.dbId) continue;
    const { error } = await supabaseAdmin
      .from("board_cards")
      .update({
        trigger_warnings: p.newWarnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.dbId);

    if (error) {
      console.error(`  ✗ FAILED   "${p.jsonTitle}" — ${error.message}`);
      failCount++;
    } else {
      console.log(`  ✓ Updated  "${p.jsonTitle}" → ${p.newWarnings.length} warning(s)`);
      successCount++;
    }
  }

  console.log("\n── Done ────────────────────────────────────────────────────────────");
  console.log(`  Updated : ${successCount}  Failed : ${failCount}  Skipped : ${noChange.length}`);

  if (notFound.length > 0) {
    console.error(
      `\n⚠  ${notFound.length} JSON entr${notFound.length === 1 ? "y" : "ies"} matched no DB row:`
    );
    for (const e of notFound) {
      console.error(`   · "${e.title}" by ${e.author}`);
    }
  }

  process.exit(notFound.length > 0 || failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
