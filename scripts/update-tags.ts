/**
 * Update book tags on board_cards.
 *
 * Usage (from project root):
 *   npx tsx scripts/update-tags.ts            # dry-run (default)
 *   npx tsx scripts/update-tags.ts --apply    # write to DB
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

// ─── tag plan ────────────────────────────────────────────────────────────────
// Each entry: title (must match DB exactly), new full tag array.

const UPDATES: { title: string; reason: string; tags: string[] }[] = [
  {
    title: "A Cowboy's Runaway",
    reason: '"Slow-burn Tension" → "Slow Burn" (standard trope name)',
    tags: ["Enemies to Lovers", "Forced Proximity", "Historical Western Romance", "Slow Burn"],
  },
  {
    title: "All The Ways I'd Live For You",
    reason: "Empty — same series as the other B.W. Lacey books",
    tags: ["Dark Romance", "Thriller", "Obsessive Love", "Stalker Romance"],
  },
  {
    title: "Bleed With Me",
    reason: "Empty — description: Russian mafia, arranged marriage",
    tags: ["Dark Romance", "Mafia Romance", "Arranged Marriage", "Enemies to Lovers"],
  },
  {
    title: "Devils of Seattle",
    reason: "Empty — description: Russian Mafia, female assassin",
    tags: ["Dark Romance", "Mafia Romance", "Female Assassin", "Forbidden Love"],
  },
  {
    title: "Hexes & Heartbreakers",
    reason: 'Capitalization inconsistency: "grumpy x sunshine" and "paranormal" are lowercase',
    tags: ["Grumpy x Sunshine", "Paranormal Romance", "Witchcraft", "Ex Cupid"],
  },
  {
    title: "His For Christmas",
    reason: '"Holiday Romance" missing from a Christmas book',
    tags: ["Holiday Romance", "Steamy Romance", "Emotional Walls", "Intense Chemistry"],
  },
  {
    title: "Leather & Lies",
    reason: "Empty — Emma Slate writes MC romance; title confirms it",
    tags: ["MC Romance", "Dark Romance", "Forbidden Love", "Suspense"],
  },
  {
    title: "Ruined",
    reason: "Empty — description lists tropes verbatim: Masked MMC, enemies to lovers, touch her and die, forced proximity",
    tags: ["Dark Romance", "Masked Hero", "Enemies to Lovers", "Touch & Die"],
  },
  {
    title: "Sparked Revolution",
    reason: "Empty — description: werewolf romance, two future leaders",
    tags: ["Paranormal Romance", "Wolf Shifter", "Rivals to Lovers", "Fated Mates"],
  },
  {
    title: "To Dig Up The Past",
    reason: "Empty — fantasy adventure series (not romance)",
    tags: ["Fantasy Adventure", "High Stakes", "Action", "Supernatural"],
  },
  {
    title: "Unbound",
    reason: 'Wrong genre: "Contemporary Romance, Romance" is redundant and incorrect — it\'s a paranormal mythology novella (5,000-year-old Lilith character from Nineveh)',
    tags: ["Paranormal Romance", "Immortal Heroine", "Mythology", "Enemies to Lovers"],
  },
  {
    title: "Underworld Vows",
    reason: "Empty — description: Hades Greek mythology romance",
    tags: ["Greek Mythology", "Hades Romance", "Dark Fantasy Romance", "Fated Mates"],
  },
  {
    title: "Unmasked Hearts",
    reason: '"Contemporary" alone should be "Contemporary Romance"',
    tags: ["Contemporary Romance", "Best Friend's Sister", "Second Chance", "Playboy Hero"],
  },
  {
    title: "Where My Demons Hide",
    reason: "Empty — same author as Heaven's Gate and How an Angel Dies; supernatural thriller series",
    tags: ["Supernatural Thriller", "Dark Romance", "Psychological Horror", "Angels & Demons"],
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");

  // Fetch all active cards
  const { data: cards, error } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, tags")
    .in("status", ["contracted", "recording", "editing", "released"]);

  if (error || !cards) { console.error("DB error:", error); process.exit(1); }

  const byTitle = new Map(cards.map(c => [c.title as string, c]));

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — ${UPDATES.length} planned updates\n`);
  console.log("=".repeat(72));

  let updated = 0;
  let failed  = 0;
  let notFound = 0;

  for (const plan of UPDATES) {
    const card = byTitle.get(plan.title);
    if (!card) {
      console.log(`\n  NOT FOUND: "${plan.title}"`);
      notFound++;
      continue;
    }

    const currentTags = Array.isArray(card.tags) ? (card.tags as string[]) : [];
    console.log(`\n  "${plan.title}"`);
    console.log(`  Reason : ${plan.reason}`);
    console.log(`  Before : [${currentTags.join(", ")}]`);
    console.log(`  After  : [${plan.tags.join(", ")}]`);

    if (!apply) { updated++; continue; }

    const { error: updateErr } = await supabaseAdmin
      .from("board_cards")
      .update({ tags: plan.tags, updated_at: new Date().toISOString() })
      .eq("id", card.id as string);

    if (updateErr) {
      console.log(`  ✗ FAILED: ${updateErr.message}`);
      failed++;
    } else {
      console.log(`  ✓ updated`);
      updated++;
    }
  }

  console.log("\n" + "=".repeat(72));
  if (apply) {
    console.log(`\nDone: ${updated} updated / ${failed} failed / ${notFound} not found`);
    if (failed > 0 || notFound > 0) process.exit(1);
  } else {
    console.log(`\nDry run: ${updated} would update / ${notFound} not found`);
    console.log('\nRun with --apply to write to DB.');
  }
}

main();
