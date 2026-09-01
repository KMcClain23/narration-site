/**
 * Point each card at its combined-chapter folder under Spliced/.
 *
 * ── WHY THIS IS A SCRIPT YOU CLICK THROUGH AND NOT A MIGRATION ────────────
 *
 * Because a wrong folder is silent. Cutting twenty seconds from the wrong book
 * produces a clip that plays, is the right length, and points at the wrong
 * words — the narrator re-records against it before anybody notices. Nothing
 * downstream can catch that, so the only real check is a person confirming the
 * pairing once.
 *
 * MATCHING BY TITLE STRING STAYS OUT. That is what was retired for narrators,
 * and Spliced/ proved the point on its first day: the folder was created as
 * "Cowboy's Runaway" for a card titled "A Cowboy's Runaway", then renamed. A
 * matcher would have missed it, and a fuzzy one might have picked something
 * else. Titles are shown side by side so YOU can judge; nothing is scored and
 * nothing is preselected.
 *
 * THE ITEM ID IS WHAT IS STORED, never the path — that same rename would have
 * broken a stored path within the hour.
 *
 * Usage:
 *   npm run audio-folders            list what is set and what is not
 *   npm run audio-folders -- --set   walk the unset cards, confirming each
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const SET = process.argv.includes("--set");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function graphToken() {
  const res = await fetch(
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
  const json = await res.json();
  if (!json.access_token) throw new Error(`Graph token: ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

const DRIVE = "https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive";
const byPath = p => `${DRIVE}/root:/${p.split("/").map(encodeURIComponent).join("/")}`;

/**
 * FAILS LOUDLY ON ANY NON-200.
 *
 * /root/search is 403 for this app registration, so this enumerates instead —
 * and a previous script here read a 403 as "no results" and reported an absence
 * that was really a permission failure. Nothing in this file may return an empty
 * list to mean "I could not find out".
 */
async function children(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph ${res.status} on ${url.slice(0, 90)}`);
  return (await res.json()).value ?? [];
}

const token = await graphToken();

// Spliced/'s own children. A handful of purpose-named folders, not a walk.
let spliced;
try {
  spliced = (await children(token, `${byPath("Spliced")}:/children?$top=200&$select=id,name,folder`))
    .filter(x => x.folder);
} catch (e) {
  console.error(`Could not read Spliced/: ${e.message}`);
  console.error("That is a failure, not an empty folder. Nothing has been changed.");
  process.exit(2);
}

// How many chapter files each holds — a wrong pick is usually obvious from this.
const counts = new Map();
for (const f of spliced) {
  try {
    const kids = await children(token, `${DRIVE}/items/${f.id}/children?$top=400&$select=name,file`);
    counts.set(f.id, kids.filter(k => k.file && /\.wav$/i.test(k.name)).length);
  } catch {
    counts.set(f.id, null); // unknown, and shown as such rather than as zero
  }
}

const { data: cards, error } = await admin
  .from("board_cards")
  .select("id, title, status, audio_folder_item_id, audio_folder_name")
  .eq("status", "editing")
  .is("archived_at", null)
  .order("title");
if (error) throw new Error(error.message);

console.log(`\nSpliced/ holds ${spliced.length} book folder(s):`);
for (const f of spliced) {
  const n = counts.get(f.id);
  console.log(`   ${f.name}  —  ${n === null ? "could not read" : `${n} wav file(s)`}`);
}

console.log(`\n${cards.length} cards in editing:`);
for (const c of cards) {
  const mark = c.audio_folder_item_id ? "set" : "—  ";
  console.log(`   [${mark}] ${c.title}${c.audio_folder_name ? `  ->  Spliced/${c.audio_folder_name}` : ""}`);
}

if (!SET) {
  const unset = cards.filter(c => !c.audio_folder_item_id).length;
  console.log(`\n${unset} card(s) have no folder. They skip cleanly with no_source_folder.`);
  console.log("Run with --set to pair them.\n");
  process.exit(0);
}

const rl = createInterface({ input: stdin, output: stdout });
let changed = 0;
try {
  for (const card of cards) {
    if (card.audio_folder_item_id) continue;
    console.log(`\n──────────────────────────────────────────────`);
    console.log(`Card: ${card.title}`);
    spliced.forEach((f, i) => {
      const n = counts.get(f.id);
      console.log(`   ${i + 1}) Spliced/${f.name}  (${n === null ? "?" : n} wav)`);
    });
    // NO DEFAULT. Enter skips; a number is a deliberate keystroke. There is no
    // "accept all" on purpose — the whole value of this pass is one decision
    // per book.
    // EOF (Ctrl+D, or a piped script running out of input) is "stop here", not
    // a crash. Without this it throws ERR_USE_AFTER_CLOSE and prints a stack
    // trace over a run that was actually going fine.
    let answer;
    try {
      answer = (await rl.question("   number to pair, or Enter to skip: ")).trim();
    } catch {
      console.log("\n   input ended — stopping here.");
      break;
    }
    if (!answer) { console.log("   skipped"); continue; }
    const pick = spliced[Number(answer) - 1];
    if (!pick) { console.log("   not a listed option — skipped"); continue; }

    const { error: upErr } = await admin
      .from("board_cards")
      .update({ audio_folder_item_id: pick.id, audio_folder_name: pick.name })
      .eq("id", card.id);
    if (upErr) { console.log(`   FAILED: ${upErr.message}`); continue; }
    console.log(`   ${card.title}  ->  Spliced/${pick.name}`);
    changed++;
  }
} finally {
  rl.close();
}
console.log(`\n${changed} card(s) paired.\n`);
process.exit(0);
