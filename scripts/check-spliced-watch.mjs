/**
 * The spliced watch: silent on what is already there, loud once and only once
 * on what is new, and silent on what cannot yet be read.
 *
 * ── THE THREE FAILURES THIS IS AGAINST ─────────────────────────────────────
 *
 *   1. Announcing the backlog. Six files are already sitting in
 *      Spliced/A Cowboy's Runaway. A cursor initialised by enumerating would
 *      report all six as news the first time it ran.
 *   2. Announcing a file that cannot be cut from. A large upload appears in
 *      delta well before Graph will serve its bytes. "Chapter 5 is spliced"
 *      has to mean "chapter 5 can be cut from", or Dean is told it is ready,
 *      presses Send, and the clip fails anyway — the exact race this whole
 *      area started with.
 *   3. Announcing it again on every sweep afterwards.
 *
 * ── IT DOES NOT WRITE TO A REAL BOOK ───────────────────────────────────────
 *
 * The readable-file control needs a genuine spliced WAV, and the only ones that
 * exist belong to A Cowboy's Runaway. So it runs against a PROBE CARD pointed
 * at that same real folder: the file is real, the read is real, and the event
 * lands on a card that is deleted at the end. Dean's own log is not written to.
 *
 * Usage: npm run check-spliced-watch
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

const { watchSpliced } = await import("../src/lib/spliced-watch.ts");
const { graphAppToken } = await import("../src/lib/pickup-graph.ts");

const eventsFor = async cardId => {
  const { data } = await admin.from("activity_events")
    .select("kind, detail, seq").eq("card_id", cardId).eq("kind", "chapter_spliced").order("seq");
  return data ?? [];
};
const allSpliced = async () => {
  const { count } = await admin.from("activity_events")
    .select("id", { count: "exact", head: true }).eq("kind", "chapter_spliced");
  return count ?? 0;
};

let probeCard = null;
let savedCursor = null;

try {
  const token = await graphAppToken();

  const { data: real } = await admin.from("board_cards")
    .select("id, title, audio_folder_item_id")
    .not("audio_folder_item_id", "is", null).limit(1).single();
  ck("SETUP: a book has a real spliced folder recorded", !!real?.audio_folder_item_id, real?.title);

  const listing = await fetch(
    `https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive/items/${real.audio_folder_item_id}` +
      `/children?$select=id,name,size,file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const files = ((await listing.json()).value ?? []).filter(f => f.file && /\.wav$/i.test(f.name));
  ck("SETUP: it already holds files, so a naive baseline would have news to report",
    files.length > 0, `${files.length} already there`);

  /* ── 1. the baseline is silent ─────────────────────────────────────────── */
  console.log("\nThe first run takes a position and announces nothing");
  const { data: existing } = await admin.from("graph_delta_cursors")
    .select("cursor").eq("scope", "spliced").maybeSingle();
  savedCursor = existing?.cursor ?? null;
  await admin.from("graph_delta_cursors").delete().eq("scope", "spliced");

  const before = await allSpliced();
  const first = await watchSpliced(admin, token);
  ck("it reports itself as a baseline", !!first.baseline, first.error ?? JSON.stringify(first).slice(0, 120));
  ck("NOTHING was announced", first.announced.length === 0, `${first.announced.length} announced`);
  ck("and no event was written anywhere", (await allSpliced()) === before,
    `${before} -> ${await allSpliced()}`);
  ck("it names what it absorbed rather than hiding it",
    (first.baseline?.absorbed ?? []).length === files.length,
    `${(first.baseline?.absorbed ?? []).length} listed, ${files.length} in the folder`);
  const { data: cur } = await admin.from("graph_delta_cursors")
    .select("cursor").eq("scope", "spliced").maybeSingle();
  ck("a cursor was stored", !!cur?.cursor);

  /* ── 2. a second run with nothing new says nothing ─────────────────────── */
  console.log("\nA run with no changes");
  const second = await watchSpliced(admin, token);
  ck("announces nothing", second.announced.length === 0 && !second.baseline,
    second.error ?? `${second.announced.length} announced`);
  ck("and still no events", (await allSpliced()) === before);

  /* ── 3. a readable file IS announced, once ─────────────────────────────── */
  console.log("\nA real, readable spliced file");
  const { data: made } = await admin.from("board_cards").insert({
    title: `Spliced Probe ${Date.now()}`,
    status: "editing",
    chapters_total: 23,
    // The SAME real folder. The file and the byte-read are genuine; only the
    // card the event lands on is disposable.
    audio_folder_item_id: real.audio_folder_item_id,
  }).select("id").single();
  probeCard = made.id;

  const target = files.find(f => /chapter\s*5\b/i.test(f.name)) ?? files[0];
  await admin.from("spliced_pending").insert({
    item_id: target.id, card_id: probeCard, chapter: "5",
    file_name: target.name, size: target.size, modified_by_name: "Probe Upload",
  });

  const third = await watchSpliced(admin, token);
  const announced = third.announced.filter(a => a.file === target.name);
  ck("it is announced", announced.length === 1,
    third.error ?? `${third.announced.length} announced, ${third.waiting.length} waiting`);
  const evs = await eventsFor(probeCard);
  ck("exactly one event, naming the chapter", evs.length === 1 && evs[0].detail.chapter === "5",
    evs.map(e => e.detail.chapter).join(","));
  ck("and the file", evs[0]?.detail?.file_name === target.name, evs[0]?.detail?.file_name);
  ck("with the uploader's name where Graph gave one",
    evs[0]?.detail?.modified_by_name === "Probe Upload");
  ck("the pending row is gone", !(await admin.from("spliced_pending")
    .select("item_id").eq("item_id", target.id).maybeSingle()).data);

  /* ── 4. IT DOES NOT REPEAT ─────────────────────────────────────────────── */
  const fourth = await watchSpliced(admin, token);
  ck("a later sweep does NOT announce it again",
    fourth.announced.length === 0 && (await eventsFor(probeCard)).length === 1,
    `${fourth.announced.length} announced, ${(await eventsFor(probeCard)).length} events`);

  /* ── 5. a file that cannot be read is NOT announced ────────────────────── */
  console.log("\nA file whose bytes Graph will not serve");
  // A well-formed item id that resolves to nothing: the byte read fails exactly
  // as it does for an upload still committing, which is the case being modelled.
  await admin.from("spliced_pending").insert({
    item_id: "01ZELPIIINOTAREALITEMIDXXXXXXX", card_id: probeCard, chapter: "9",
    file_name: "Chapter 9.wav", size: 130_000_000, modified_by_name: null,
  });
  const fifth = await watchSpliced(admin, token);
  ck("it is NOT announced", !fifth.announced.some(a => a.chapter === "9"),
    fifth.announced.map(a => a.chapter).join(","));
  ck("it is reported as waiting, not dropped",
    fifth.waiting.some(w => w.chapter === "9"), fifth.waiting.map(w => w.chapter).join(","));
  ck("no event was written for it",
    (await eventsFor(probeCard)).every(e => e.detail.chapter !== "9"));
  const { data: stillPending } = await admin.from("spliced_pending")
    .select("attempts, last_checked_at").eq("item_id", "01ZELPIIINOTAREALITEMIDXXXXXXX").maybeSingle();
  ck("and it stays queued for the next sweep, with the attempt recorded",
    !!stillPending && stillPending.attempts >= 1, `${stillPending?.attempts} attempts`);
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  if (probeCard) {
    await admin.from("spliced_pending").delete().eq("card_id", probeCard);
    await admin.from("activity_events").delete().eq("card_id", probeCard);
    await admin.from("board_cards").delete().eq("id", probeCard);
  }
  // THE CURSOR IS PUT BACK WHERE IT WAS. Leaving this run's position behind
  // would mean anything Dean uploaded during it was silently skipped.
  if (savedCursor) {
    await admin.from("graph_delta_cursors").upsert({ scope: "spliced", cursor: savedCursor });
    console.log("\nrestored the cursor this run found");
  } else {
    console.log("\nleft the baseline this run took — there was none before it");
  }
  console.log(`${await allSpliced()} chapter_spliced events on real books`);
}

console.log(failures === 0 ? "\nSPLICED WATCH OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
