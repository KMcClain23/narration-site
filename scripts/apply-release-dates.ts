/**
 * Populate released_at on board_cards from src/data/release-dates.json.
 *
 * Usage (from project root):
 *   npm run apply-release-dates            # dry-run (default — no writes)
 *   npm run apply-release-dates -- --apply # write to DB
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── .env.local loader ───────────────────────────────────────────────────────

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
    ) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

// ─── types ────────────────────────────────────────────────────────────────────

interface JsonEntry {
  title: string;
  author: string;
  released_at: string; // passed verbatim to Supabase — do not re-parse or shift
}

type PlanStatus = "WILL_UPDATE" | "SKIP" | "NOT_FOUND";

interface PlanRow {
  title: string;
  author: string;
  id: string | null;
  current: string | null; // existing released_at in DB, if any
  incoming: string;       // value from JSON
  status: PlanStatus;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim();
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  // Load JSON
  const jsonPath = resolve(process.cwd(), "src/data/release-dates.json");
  if (!existsSync(jsonPath)) {
    console.error(`\nERROR: ${jsonPath} not found.\n`);
    process.exit(1);
  }
  const entries: JsonEntry[] = JSON.parse(readFileSync(jsonPath, "utf-8"));

  // Dynamic import so env is loaded first
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");

  // Fetch all released board_cards
  const { data: cards, error } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, author, released_at")
    .eq("status", "released");

  if (error) { console.error("DB error:", error.message); process.exit(1); }

  // Index cards by norm(title)|norm(author) for O(1) lookup
  const cardIndex = new Map<string, typeof cards[0]>();
  for (const card of cards ?? []) {
    const key = `${norm(card.title as string)}|${norm(card.author as string)}`;
    cardIndex.set(key, card);
  }

  // Build plan
  const plan: PlanRow[] = [];
  for (const entry of entries) {
    const key = `${norm(entry.title)}|${norm(entry.author)}`;
    const card = cardIndex.get(key);

    if (!card) {
      plan.push({ title: entry.title, author: entry.author, id: null, current: null, incoming: entry.released_at, status: "NOT_FOUND" });
      continue;
    }

    const current = (card as Record<string, unknown>).released_at as string | null ?? null;
    // SKIP if the stored value already matches (same ISO string, ignoring sub-second precision)
    const alreadyMatches = current && current.slice(0, 10) === entry.released_at.slice(0, 10);
    plan.push({
      title: entry.title,
      author: entry.author,
      id: card.id as string,
      current,
      incoming: entry.released_at,
      status: alreadyMatches ? "SKIP" : "WILL_UPDATE",
    });
  }

  // Print plan table
  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — ${entries.length} JSON entries\n`);
  console.log("═".repeat(82));

  const COL_TITLE  = 36;
  const COL_DATE   = 13;
  const COL_STATUS = 12;
  console.log(
    `  ${"TITLE".padEnd(COL_TITLE)}${"INCOMING".padEnd(COL_DATE)}${"CURRENT".padEnd(COL_DATE)}STATUS`
  );
  console.log("  " + "─".repeat(80));

  for (const row of plan) {
    const incoming = row.incoming.slice(0, 10);
    const current  = row.current ? row.current.slice(0, 10) : "—";
    const icon = row.status === "WILL_UPDATE" ? "→" : row.status === "SKIP" ? "✓" : "✗";
    console.log(
      `  ${icon} ${row.title.slice(0, COL_TITLE - 2).padEnd(COL_TITLE - 2)}` +
      `${incoming.padEnd(COL_DATE)}${current.padEnd(COL_DATE)}${row.status}`
    );
  }
  console.log("═".repeat(82));

  const willUpdate = plan.filter(r => r.status === "WILL_UPDATE");
  const skip       = plan.filter(r => r.status === "SKIP");
  const notFound   = plan.filter(r => r.status === "NOT_FOUND");

  if (!apply) {
    console.log(`\nDry run: ${willUpdate.length} would update / ${skip.length} already set / ${notFound.length} not found`);
    if (notFound.length) {
      console.log("\nNot matched (check title/author spelling in JSON):");
      for (const r of notFound) console.log(`  · "${r.title}" by ${r.author}`);
    }
    console.log("\nRun with --apply to write to DB.");
    if (notFound.length) process.exit(1);
    return;
  }

  // Apply
  let updated = 0;
  let failed  = 0;

  for (const row of willUpdate) {
    const { error: updateErr } = await supabaseAdmin
      .from("board_cards")
      .update({
        // Pass the timestamp verbatim — it is already noon UTC; do not shift or re-parse.
        released_at: row.incoming,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id!);

    if (updateErr) {
      console.log(`  ✗ FAILED  "${row.title}": ${updateErr.message}`);
      failed++;
    } else {
      console.log(`  ✓ Updated "${row.title}" → ${row.incoming.slice(0, 10)}`);
      updated++;
    }
  }

  console.log(`\nDone: ${updated} updated / ${skip.length} skipped / ${failed} failed / ${notFound.length} not found`);

  if (failed > 0 || notFound.length > 0) process.exit(1);
}

main();
