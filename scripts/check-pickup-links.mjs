/**
 * The token-taking functions must EXECUTE, not just exist.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `pickup_batch_by_token` was widened to carry a clip id. A DROP + CREATE
 * re-authors the whole body, and the rewrite compared a text column against
 * bytea — so every call raised `operator does not exist: text = bytea`,
 * `batchByToken` caught it and returned null, and the narrator page told every
 * real visitor their link had expired. Nothing failed loudly. The grants check
 * passed, the types compiled, the build was green.
 *
 * A function that raises on every call is indistinguishable from one that
 * legitimately has no rows, and both look like "the link is dead" to the person
 * holding it. So this issues a real token and asserts rows come back — the one
 * check that would have caught it.
 *
 * ── IT MUST NOT TOUCH A REAL BATCH ─────────────────────────────────────────
 *
 * The first version issued a token against whatever live batch it found, to
 * prove the functions execute. issue_pickup_link REVOKES the batch's previous
 * link by design — a re-send must close the old door — so every run of this
 * check killed a link sitting in Ann's or Dean's inbox. It did that three
 * times before anyone noticed, and the only symptom would have been a narrator
 * being told their link had expired.
 *
 * So it now builds its OWN throwaway batch: a probe narrator, a draft pickup on
 * a real card, its own link. Nothing a person has been sent is ever the subject
 * of a test.
 *
 * Usage: npm run check-pickup-links
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

// A THROWAWAY batch, built here and removed in the finally block. It needs a
// real card only because pickup_links has a foreign key to one; nothing about
// that card is read or changed.
const { data: card, error: cardErr } = await admin
  .from("board_cards").select("id").is("archived_at", null).limit(1).single();
if (cardErr || !card) {
  console.error(`could not read a card to hang the probe batch on: ${cardErr?.message}`);
  process.exit(2);
}

const PROBE_CHAPTER = `__linkcheck ${Date.now()}`;
let narratorId = null;
let pickupId = null;
try {
  const nar = await admin.from("narrators")
    .insert({ display_name: `Link Check ${Date.now()}`, email: "probe@example.invalid" })
    .select("id").single();
  if (nar.error) throw new Error(`probe narrator: ${nar.error.message}`);
  narratorId = nar.data.id;

  const pk = await admin.from("pickups").insert({
    card_id: card.id, chapter: PROBE_CHAPTER, timestamp_at: "01:00", kind: "other",
    said: "", should_be: "", note: "link check probe", status: "sent",
    assigned_narrator_id: narratorId,
  }).select("id").single();
  if (pk.error) throw new Error(`probe pickup: ${pk.error.message}`);
  pickupId = pk.data.id;
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const batch = { card_id: card.id, chapter: PROBE_CHAPTER, assigned_narrator_id: narratorId };
let token = null;
try {
  const { data, error } = await admin.rpc("issue_pickup_link", {
    p_card_id: batch.card_id,
    p_chapter: batch.chapter,
    p_narrator_id: batch.assigned_narrator_id,
  });
  if (error) throw new Error(error.message);
  token = data;
  ck("issue_pickup_link mints a token", typeof token === "string" && token.length === 64);

  const byToken = await admin.rpc("pickup_batch_by_token", { p_token: token });
  ck("pickup_batch_by_token executes without raising", !byToken.error, byToken.error?.message ?? "");
  ck("and returns the batch's rows", (byToken.data?.length ?? 0) > 0,
    `${byToken.data?.length ?? 0} rows`);
  ck("with the clip columns present on the wire",
    byToken.data?.[0] && "clip_id" in byToken.data[0] && "clip_skip_reason" in byToken.data[0]);

  const byId = await admin.rpc("pickup_link_id_by_token", { p_token: token });
  ck("pickup_link_id_by_token resolves the same token", !byId.error && !!byId.data,
    byId.error?.message ?? String(byId.data));

  // The negative side: a token that was never issued must return nothing, and
  // must do it by finding no rows rather than by raising.
  const bogus = await admin.rpc("pickup_batch_by_token", { p_token: "0".repeat(64) });
  ck("a bogus token returns no rows and no error",
    !bogus.error && (bogus.data?.length ?? 0) === 0, bogus.error?.message ?? `${bogus.data?.length} rows`);
} catch (e) {
  console.error(`\n${e.message}`);
  failures++;
} finally {
  // The whole probe batch goes, links included. Nothing survives a run.
  await admin.from("pickup_links").delete().eq("chapter", PROBE_CHAPTER);
  if (pickupId) await admin.from("pickups").delete().eq("id", pickupId);
  if (narratorId) await admin.from("narrators").delete().eq("id", narratorId);

  const { count } = await admin.from("pickup_links")
    .select("id", { count: "exact", head: true }).eq("chapter", PROBE_CHAPTER);
  if (count) console.error(`WARNING: ${count} probe link(s) left behind`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
