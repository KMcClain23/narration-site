/**
 * One-time bulk import of historical payments.
 *
 * Reads a folder of money documents (processor exports, royalty statements,
 * invoices you issued), parses each through /api/payments/parse-document,
 * matches every row to a project by client name, and prints a plan.
 *
 *   npm run import-payments -- <folder>              # dry run, prints the plan
 *   npm run import-payments -- <folder> --apply      # actually writes
 *   npm run import-payments -- <folder> --map map.json
 *
 * Dry run is the default and --apply is the only way to write anything:
 * this creates financial records, and a silent misparse is worse than no
 * import at all. Read the plan, then re-run with --apply.
 *
 * map.json disambiguates authors with more than one project:
 *   { "Bethanie Loren": "Restrict" }
 *
 * Requires the dev server running (npm run dev) — it reuses the app's own
 * parsing and insert endpoints rather than a second copy of that logic.
 */

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.IMPORT_BASE_URL ?? "http://localhost:3000";
const PARSEABLE = new Set([".xlsx", ".xlsm", ".pdf", ".csv", ".tsv", ".txt", ".png", ".jpg", ".jpeg"]);

type ParsedRow = {
  kind: "fee" | "royalty";
  client_name: string;
  title: string;
  period: string;
  amount: number;
  amount_kind: "received" | "invoiced";
  date: string;
  due_on: string;
  invoice_number: string;
  method: string;
  status: "success" | "declined" | "refunded" | "pending" | "unknown";
  rate_pfh: number;
  hours: number;
  confidence: "high" | "medium" | "low";
  notes: string;
};

type Card = { id: string; title: string; author: string | null; archived_at?: string | null };

function readAdminKey(): string {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find(l => l.startsWith("ADMIN_SECRET_KEY="));
  if (!line) throw new Error("ADMIN_SECRET_KEY not found in .env.local");
  return line.slice("ADMIN_SECRET_KEY=".length).trim().replace(/^"|"$/g, "");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function parseFile(file: string, cookie: string): Promise<ParsedRow[]> {
  const body = new FormData();
  body.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));

  const res = await fetch(`${BASE}/api/payments/parse-document`, {
    method: "POST",
    headers: { cookie },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    console.log(`  ! ${path.basename(file)}: ${json.error ?? res.status}`);
    return [];
  }
  console.log(`  · ${path.basename(file)} → ${json.document_type}, ${json.rows.length} row(s)`);
  return json.rows as ParsedRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find(a => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const mapArg = args[args.indexOf("--map") + 1];

  if (!folder) {
    console.error("Usage: npm run import-payments -- <folder> [--apply] [--map map.json]");
    process.exit(1);
  }

  const overrides: Record<string, string> =
    args.includes("--map") && mapArg ? JSON.parse(fs.readFileSync(mapArg, "utf8")) : {};

  const cookie = `dmn_admin_key=${readAdminKey()}`;

  const cardsRes = await fetch(`${BASE}/api/board`, { headers: { cookie } });
  if (!cardsRes.ok) {
    console.error(`Could not load projects (${cardsRes.status}). Is the dev server running?`);
    process.exit(1);
  }
  const cardsJson = await cardsRes.json();
  const cards: Card[] = (Array.isArray(cardsJson) ? cardsJson : cardsJson.cards ?? []).filter(
    (c: Card) => !c.archived_at,
  );

  const files = fs
    .readdirSync(folder)
    .filter(f => PARSEABLE.has(path.extname(f).toLowerCase()))
    .map(f => path.join(folder, f));

  if (files.length === 0) {
    console.error(`No parseable files in ${folder}`);
    process.exit(1);
  }

  console.log(`\nReading ${files.length} file(s) from ${folder}\n`);

  const rows: ParsedRow[] = [];
  for (const f of files) rows.push(...(await parseFile(f, cookie)));

  // ---- match + classify -------------------------------------------------
  type Plan = { row: ParsedRow; card?: Card; action: "import" | "skip"; reason?: string };
  const plan: Plan[] = rows.map(row => {
    // Declined and refunded rows are reported by the parser on purpose so a
    // retried charge is visible, but they are never money received.
    if (row.status === "declined" || row.status === "refunded") {
      return { row, action: "skip", reason: `${row.status} transaction` };
    }
    if (!row.amount) return { row, action: "skip", reason: "no amount" };

    const override = overrides[row.client_name];
    if (override) {
      const c = cards.find(x => norm(x.title) === norm(override) || x.id === override);
      if (c) return { row, card: c, action: "import" };
      return { row, action: "skip", reason: `map entry "${override}" matched no project` };
    }

    let matches = cards.filter(c => c.author && norm(c.author) === norm(row.client_name));
    // A title in the document disambiguates an author with several projects.
    if (matches.length > 1 && row.title) {
      const byTitle = matches.filter(c => norm(c.title) === norm(row.title));
      if (byTitle.length === 1) matches = byTitle;
    }

    if (matches.length === 1) return { row, card: matches[0], action: "import" };
    if (matches.length === 0) return { row, action: "skip", reason: `no project for "${row.client_name}"` };
    return {
      row,
      action: "skip",
      reason: `"${row.client_name}" has ${matches.length} projects — add to --map: ${matches
        .map(m => m.title)
        .join(" | ")}`,
    };
  });

  // ---- print the plan ---------------------------------------------------
  const money = (n: number) => `$${n.toFixed(2)}`;
  console.log("\n─── PLAN ───────────────────────────────────────────────────────\n");
  for (const p of plan) {
    const mark = p.action === "import" ? "+" : "-";
    const flag = p.row.confidence !== "high" ? `  [${p.row.confidence} confidence]` : "";
    console.log(
      `  ${mark} ${(p.row.date || "no date").padEnd(11)} ${money(p.row.amount).padStart(10)}  ` +
        `${(p.row.client_name || "—").padEnd(22)} ${p.card ? p.card.title : `(${p.reason})`}${flag}`,
    );
    if (p.row.notes && p.row.confidence !== "high") console.log(`      ${p.row.notes}`);
  }

  const toImport = plan.filter(p => p.action === "import");
  const skipped = plan.filter(p => p.action === "skip");
  console.log(
    `\n  ${toImport.length} to import, ${skipped.length} skipped, ` +
      `${money(toImport.reduce((s, p) => s + p.row.amount, 0))} total\n`,
  );

  if (!apply) {
    console.log("  Dry run — nothing written. Re-run with --apply to import.\n");
    return;
  }

  const payload = toImport.map(p => ({
    card_id: p.card!.id,
    kind: p.row.kind,
    period: p.row.period,
    label: p.row.kind === "royalty" ? "" : p.row.invoice_number ? `Invoice ${p.row.invoice_number}` : "",
    amount_received: p.row.amount_kind === "received" ? p.row.amount : 0,
    amount_expected: p.row.amount_kind === "invoiced" ? p.row.amount : null,
    received_on: p.row.amount_kind === "received" ? p.row.date : "",
    invoiced_on: p.row.amount_kind === "invoiced" ? p.row.date : "",
    due_on: p.row.due_on,
    invoice_number: p.row.invoice_number,
    method: p.row.method,
    notes: p.row.notes,
  }));

  const res = await fetch(`${BASE}/api/payments/bulk`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ rows: payload }),
  });
  const result = await res.json();

  if (!res.ok) {
    console.error(`  Import failed: ${result.error}`);
    process.exit(1);
  }
  console.log(`  Imported ${result.imported}.`);
  for (const s of result.skipped ?? []) {
    console.log(`  Skipped row ${s.index}: ${s.reason}`);
  }
  console.log();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
