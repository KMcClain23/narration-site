/**
 * Backfill released_at on board_cards for all released books.
 * Fetches each Audible page and parses the publication date.
 *
 * Usage (from project root):
 *   npm run backfill-release-dates            # dry-run (default — no writes)
 *   npm run backfill-release-dates -- --apply # write to DB
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── env loader (must run before supabaseAdmin is imported) ──────────────────

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

// ─── constants ───────────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DELAY_MS = 1500;

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Scrape an Audible product page and return a release date string.
 *
 * Tier 1 — JSON-LD datePublished (most stable, server-rendered for SEO)
 * Tier 2 — <meta> tag fallbacks
 * Tier 3 — visible "Release date" text in the HTML
 *
 * Returns null when no date can be found.
 */
async function scrapeAudibleDate(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // ── Tier 1: JSON-LD ──────────────────────────────────────────────────────
  const ldPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldPattern.exec(html)) !== null) {
    try {
      const json = JSON.parse(ldMatch[1].trim());
      // May be a single object, an array, or contain @graph
      const candidates: unknown[] = [];
      if (Array.isArray(json)) candidates.push(...json);
      else {
        candidates.push(json);
        if (Array.isArray((json as Record<string, unknown>)["@graph"])) {
          candidates.push(...((json as Record<string, unknown>)["@graph"] as unknown[]));
        }
      }
      for (const item of candidates) {
        const dp = (item as Record<string, unknown>)?.datePublished;
        if (typeof dp === "string" && dp) return dp;
      }
    } catch { /* malformed block — skip */ }
  }

  // ── Tier 2: meta tags ────────────────────────────────────────────────────
  const metaPatterns = [
    /<meta[^>]+name="DC\.Date"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+name="DC\.Date"/i,
    /<meta[^>]+property="book:release_date"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+property="book:release_date"/i,
    /<meta[^>]+name="date"[^>]+content="([^"]+)"/i,
  ];
  for (const pat of metaPatterns) {
    const m = html.match(pat);
    if (m) return m[1];
  }

  // ── Tier 3: visible "Release date:" label ─────────────────────────────────
  // Audible renders: <span class="...">Release date:</span>\n  May 21, 2024
  const textMatch = html.match(
    /Release\s+date[^<]{0,40}?(\w+\s+\d{1,2},\s*\d{4})/i
  );
  if (textMatch) return textMatch[1];

  return null;
}

/** Normalize a raw scraped date string to an ISO timestamptz string for Supabase. */
function toISO(raw: string): string | null {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── main ────────────────────────────────────────────────────────────────────

type Result = {
  title: string;
  url: string;
  rawDate: string | null;
  iso: string | null;
  status: "FOUND" | "NOT_FOUND" | string; // string covers ERROR/WRITE_ERROR messages
};

async function main() {
  const apply = process.argv.includes("--apply");
  const { supabaseAdmin } = await import("../src/lib/supabase-admin");

  // Cards that are released but have no release date yet
  const { data: cards, error } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, audible_link")
    .eq("status", "released")
    .is("released_at", null)
    .not("audible_link", "is", null)
    .neq("audible_link", "");

  if (error) { console.error("DB fetch error:", error.message); process.exit(1); }
  if (!cards?.length) {
    console.log("\nNothing to backfill — all released cards already have released_at set.");
    return;
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — ${cards.length} book(s) to process\n`);

  const results: Result[] = [];

  for (const card of cards) {
    process.stdout.write(`  ${card.title.slice(0, 50).padEnd(52)}`);
    let rawDate: string | null = null;
    let iso: string | null = null;
    let status: Result["status"] = "NOT_FOUND";

    try {
      rawDate = await scrapeAudibleDate(card.audible_link as string);
      if (rawDate) {
        iso = toISO(rawDate);
        status = iso ? "FOUND" : `NOT_FOUND (unparseable: "${rawDate}")`;
      }
    } catch (e) {
      status = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }

    process.stdout.write(`${status}\n`);
    results.push({ title: card.title as string, url: card.audible_link as string, rawDate, iso, status });

    if (apply && iso) {
      const { error: updateErr } = await supabaseAdmin
        .from("board_cards")
        .update({ released_at: iso, updated_at: new Date().toISOString() })
        .eq("id", card.id as string);
      if (updateErr) {
        const errStatus = `WRITE_ERROR: ${updateErr.message}`;
        console.log(`    ✗ ${errStatus}`);
        results[results.length - 1].status = errStatus;
      } else {
        console.log(`    ✓ Saved ${rawDate}`);
      }
    }

    await sleep(DELAY_MS);
  }

  // ── summary table ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(80));
  console.log("\n  " + "TITLE".padEnd(48) + "DATE".padEnd(14) + "STATUS");
  console.log("  " + "─".repeat(78));
  for (const r of results) {
    const dateStr = r.rawDate?.slice(0, 10) ?? "—";
    console.log(
      "  " + r.title.slice(0, 46).padEnd(48) + dateStr.padEnd(14) + r.status
    );
  }
  console.log("\n" + "═".repeat(80));

  const found    = results.filter(r => r.status === "FOUND").length;
  const notFound = results.filter(r => r.status.startsWith("NOT_FOUND")).length;
  const errors   = results.filter(r => r.status.startsWith("ERROR") || r.status.startsWith("WRITE_ERROR")).length;

  if (apply) {
    console.log(`\nDone: ${found} updated / ${notFound} not found / ${errors} errors`);
  } else {
    console.log(`\nDry run: ${found} parseable / ${notFound} not found / ${errors} errors`);
    console.log("Run with --apply to write to DB.");
  }

  if (notFound > 0 || errors > 0) {
    console.log("\nBooks needing manual entry in admin:");
    for (const r of results) {
      if (r.status !== "FOUND") console.log(`  · ${r.title}`);
    }
  }
}

main();
