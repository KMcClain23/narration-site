/**
 * Link the scripts in OneDrive's Scripts/ folder to their board cards, once.
 *
 * ── WHY THIS IS A ONE-TIME LINK AND NOT A LOOKUP ───────────────────────────
 *
 * The filename does not reliably equal the card title — an apostrophe is
 * missing from one and a capital differs in another — so finding the card means
 * a normalised comparison. Doing that on every read would be a brittle string
 * match running forever. Doing it ONCE and storing the Graph item id turns it
 * into a fact: ids survive renames and moves, so from then on nothing cares what
 * the file is called.
 *
 * ── EXACTLY ONE HIT, OR IT IS LEFT FOR A PERSON ────────────────────────────
 *
 * Zero matches and two matches are both unresolved, and neither is settled by
 * taking the first. A script silently attached to the wrong book would put
 * another book's sentences on screen next to a narrator's correction, and it
 * would look completely plausible.
 *
 * Usage:  npm run link-scripts           report what it would do
 *         npm run link-scripts -- --write actually write
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");

const { normaliseTitle, matchTitleToCard, fileStem } =
  await import("../src/lib/title-match.ts");
const { graphAppToken, DRIVE_USER } = await import("../src/lib/pickup-graph.ts");

const GRAPH = `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive`;

const token = await graphAppToken();
const res = await fetch(
  `${GRAPH}/root:/Scripts:/children?$top=400&$select=id,name,size,file`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!res.ok) {
  console.error(`Scripts/ could not be listed: ${res.status}`);
  process.exit(2);
}
const files = ((await res.json()).value ?? []).filter(f => f.file);

// Archived cards are excluded: a script for a shelved book is not something to
// link automatically, and a title collision with an archived card would make an
// active book ambiguous for no reason.
const { data: cards } = await admin
  .from("board_cards").select("id, title").is("archived_at", null);

const { data: manuscripts } = await admin
  .from("manuscripts").select("id, title, card_id, source_item_id, source_r2_key");

console.log(`${files.length} scripts in Scripts/, ${cards.length} active cards\n`);

let linked = 0;
let unresolved = 0;
for (const f of files) {
  const m = matchTitleToCard(f.name, cards);

  if (m.status !== "matched") {
    unresolved++;
    console.log(`  UNRESOLVED  ${f.name}`);
    console.log(
      m.status === "ambiguous"
        ? `              ${m.candidates.length} cards match "${m.normalised}": ` +
          m.candidates.map(c => c.title).join(", ")
        : `              nothing matches "${m.normalised}" — link it by hand`,
    );
    continue;
  }

  // An existing manuscript row for this card, or for this title. Re-pointing an
  // existing row is the whole point for the three already parsed: their chapters
  // are in Postgres and must not be orphaned by inserting a second row.
  const existing =
    manuscripts.find(x => x.card_id === m.card.id) ??
    manuscripts.find(x => normaliseTitle(x.title) === normaliseTitle(m.card.title));

  const action = existing
    ? existing.source_item_id === f.id
      ? "already linked"
      : `re-point ${existing.source_r2_key ? "off R2" : "row"}`
    : "no manuscript row yet — script is on file but unparsed";

  console.log(`  ${m.card.title}`);
  console.log(`              ${f.name}  ->  ${action}`);

  if (WRITE && existing && existing.source_item_id !== f.id) {
    const { error } = await admin.from("manuscripts").update({
      card_id: m.card.id,
      source_item_id: f.id,
      source_path: `Scripts/${f.name}`,
    }).eq("id", existing.id);
    if (error) console.log(`              WRITE FAILED: ${error.message}`);
    else linked++;
  } else if (WRITE && existing && !existing.card_id) {
    await admin.from("manuscripts").update({ card_id: m.card.id }).eq("id", existing.id);
    linked++;
  }
}

console.log(
  `\n${files.length - unresolved} of ${files.length} resolved to exactly one card; ` +
  `${unresolved} unresolved.`,
);
console.log(WRITE ? `${linked} row(s) updated.` : "Dry run — pass --write to apply.");
process.exit(0);
