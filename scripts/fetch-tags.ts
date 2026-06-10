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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("title, author, status, tags, description")
    .in("status", ["contracted", "recording", "editing", "released"])
    .order("title", { ascending: true });

  if (error) { console.error(error); process.exit(1); }

  for (const card of data ?? []) {
    const tags = Array.isArray(card.tags) ? card.tags.join(", ") : "(none)";
    const desc = card.description ? card.description.slice(0, 200) : "(no description)";
    console.log(`${card.title} — ${card.author} [${card.status}]`);
    console.log(`  tags: ${tags}`);
    console.log(`  desc: ${desc}`);
    console.log();
  }
}

main();
