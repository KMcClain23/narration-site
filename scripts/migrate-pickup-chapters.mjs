/**
 * Move existing pickup files into the chapter layout.
 *
 * ── THIS IS WHAT THE ITEM IDS WERE FOR ─────────────────────────────────────
 *
 * A Graph move does NOT change an item's id. Every link this app hands out —
 * the badge on the hub, the folder link, the clip player — resolves by id at
 * click time, so all of them survive this reorganisation WITHOUT A SINGLE ROW
 * BEING EDITED. That is the whole point of resolve-by-id, and this is its first
 * real use.
 *
 * onedrive_path and manifest_path DO go stale, because they are strings. They
 * are updated here for the rows that moved — not because anything resolves
 * through them, but because a recorded path that points nowhere is a fact
 * that has quietly become false, and the next person to read one would believe
 * it. The id still wins wherever both exist; the path is a record.
 *
 * Nothing is guessed. Every move is enumerated first, printed, and performed by
 * item id so the move cannot land on something other than what was inspected.
 *
 * Usage: npm run migrate-pickup-chapters [-- --apply]
 */
import { createClient } from "@supabase/supabase-js";
import { chapterDir, manifestName } from "../src/lib/pickup-paths.ts";

const APPLY = process.argv.includes("--apply");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function graphToken() {
  const r = await fetch(
    `https://login.microsoftonline.com/${process.env.PICKUPS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.PICKUPS_GRAPH_CLIENT_ID,
        client_secret: process.env.PICKUPS_GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  const j = await r.json();
  if (!j.access_token) throw new Error(`Graph token: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

const DRIVE = "https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive";
const byPath = p => `${DRIVE}/root:/${p.split("/").map(encodeURIComponent).join("/")}`;

const token = await graphToken();

/** Children, failing loudly on any non-200. A 404 is the only "not there". */
async function children(id) {
  const r = await fetch(`${DRIVE}/items/${id}/children?$top=400&$select=id,name,folder,file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`children ${r.status}`);
  return (await r.json()).value ?? [];
}

async function itemAt(path) {
  const r = await fetch(byPath(path), { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`stat ${r.status} on ${path}`);
  return await r.json();
}

async function ensureFolder(path) {
  const existing = await itemAt(path);
  if (existing) return existing.id;
  const parts = path.split("/");
  const name = parts.pop();
  const parent = parts.join("/");
  const parentId = parent ? await ensureFolder(parent) : "root";
  const r = await fetch(`${DRIVE}/items/${parentId}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // "fail", not "return": Graph rejects "return" on this endpoint with
    // "The value for name@conflictBehavior is invalid". The existence check
    // above already handles the ordinary case, so a conflict here means a race,
    // and re-reading the path is the right answer to it.
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (r.status === 409) {
    const raced = await itemAt(path);
    if (raced) return raced.id;
  }
  if (!r.ok) throw new Error(`mkdir ${r.status} on ${path}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).id;
}

// ── enumerate ─────────────────────────────────────────────────────────────
//
// Only files sitting DIRECTLY in a narrator folder are candidates: anything
// already inside a chapter folder has been migrated, and re-running must be a
// no-op rather than a second move.
const pickupsRoot = await itemAt("Pickups");
if (!pickupsRoot) throw new Error("Pickups/ not found");

const planned = [];
for (const book of (await children(pickupsRoot.id)) ?? []) {
  if (!book.folder || book.name === "_incoming") continue;
  for (const narrator of (await children(book.id)) ?? []) {
    if (!narrator.folder) continue;
    for (const entry of (await children(narrator.id)) ?? []) {
      if (!entry.file) continue;

      // "23 - pickups.txt" -> chapter "23". The old naming put the chapter in
      // front of a " - ". A file that does not carry one is left alone and
      // reported, rather than guessed at.
      const m = /^(.+?)\s-\s(.+)$/.exec(entry.name);
      if (!m) {
        planned.push({ skip: entry.name, why: "no ' - ' separator; not migrated", from: `Pickups/${book.name}/${narrator.name}/${entry.name}` });
        continue;
      }
      const [, chapter, rest] = m;
      const dir = chapterDir(book.name, narrator.name, chapter);
      const newName = /^pickups\.txt$/i.test(rest) ? manifestName() : rest;
      planned.push({
        id: entry.id,
        chapter,
        from: `Pickups/${book.name}/${narrator.name}/${entry.name}`,
        to: `${dir}/${newName}`,
        dir,
        newName,
      });
    }
  }
}

console.log(`\n${planned.filter(p => p.id).length} file(s) to move, ${planned.filter(p => p.skip).length} skipped\n`);
for (const p of planned) {
  if (p.skip) console.log(`  SKIP  ${p.from}\n        ${p.why}`);
  else console.log(`  MOVE  ${p.from}\n     -> ${p.to}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to perform these moves.\n");
  process.exit(0);
}

// ── move, by id ───────────────────────────────────────────────────────────
console.log("\nMoving:\n");
let moved = 0;
for (const p of planned) {
  if (!p.id) continue;
  const folderId = await ensureFolder(p.dir);
  const r = await fetch(`${DRIVE}/items/${p.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: folderId }, name: p.newName }),
  });
  if (!r.ok) {
    console.log(`  FAILED ${r.status}  ${p.from}`);
    continue;
  }
  const after = await r.json();
  // THE ID IS UNCHANGED. Asserted rather than assumed, because every link in
  // the app depends on it.
  if (after.id !== p.id) {
    console.log(`  !! the item id CHANGED across the move: ${p.id} -> ${after.id}`);
    console.log("     every stored locator for this file is now wrong. Stopping.");
    process.exit(1);
  }
  console.log(`  moved  ${p.to}`);
  moved++;

  // The stale strings. Not what anything resolves through — but a recorded
  // path pointing nowhere is a fact that has become false.
  const { error: e1 } = await admin.from("pickups")
    .update({ manifest_path: p.to }).eq("manifest_path", p.from);
  if (e1) console.log(`     (manifest_path not updated: ${e1.message})`);
  const { error: e2 } = await admin.from("pickup_uploads")
    .update({ onedrive_path: p.to }).eq("onedrive_path", p.from);
  if (e2) console.log(`     (onedrive_path not updated: ${e2.message})`);
  const { error: e3 } = await admin.from("pickups")
    .update({ clip_path: p.to }).eq("clip_path", p.from);
  if (e3) console.log(`     (clip_path not updated: ${e3.message})`);
}

console.log(`\n${moved} file(s) moved. No row's ITEM ID was touched — every link resolves by id.\n`);
process.exit(0);
