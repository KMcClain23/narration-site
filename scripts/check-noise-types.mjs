/**
 * The noise type: stored, constrained, cleared, and carried to the surfaces
 * that need it.
 *
 * ── THE ANDROID CHECK IS PART OF THIS ONE ──────────────────────────────────
 *
 * The phone decodes pickups_for_editor, pickups_for_session and
 * pickups_needing_me through Postgrest with no serializer, so
 * ignoreUnknownKeys = false and ONE extra column empties the whole list on
 * every installed 0.3.0. So this asserts the column is NOT on those three,
 * rather than trusting that nobody added it — the read this feature needs has
 * its own function precisely so it never has to be.
 *
 * Usage: npm run check-noise-types
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

const made = { users: [], cards: [], narrators: [] };
try {
  /* ── the frozen functions must NOT have gained the column ──────────────── */
  console.log("The functions the phone decodes");
  /*
    READ FROM THE DECLARED SIGNATURE, not from a returned row.

    pickups_needing_me returns an ADMIN'S OWN sent rows, so calling it as
    service_role yields none — and "no rows, therefore no noise_type column" is
    a vacuous pass that would keep passing after somebody added the column.
    function_out_columns reads what the function DECLARES it returns, which is
    the same source check-android-dtos compares the shipped DTOs against and is
    true whether or not any row exists.
  */
  const FROZEN = ["pickups_for_editor", "pickups_for_session", "pickups_needing_me"];
  const sig = await admin.rpc("function_out_columns", { p_names: FROZEN });
  ck("the declared signatures could be read", !sig.error && (sig.data?.length ?? 0) === 3,
    sig.error?.message ?? `${sig.data?.length ?? 0} of 3`);
  for (const fn of FROZEN) {
    const row = (sig.data ?? []).find(r => r.proname === fn);
    const cols = (row?.cols ?? []).map(c => c.name);
    ck(`${fn} declares ${cols.length} columns`, cols.length > 0, cols.length ? "" : "read nothing");
    ck(`  and noise_type is NOT one of them`, !cols.includes("noise_type"),
      cols.includes("noise_type") ? "IT IS — installed builds would break" : "safe");
  }

  const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const email = `noise-${Date.now()}@example.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  made.users.push(u.user.id);
  await admin.from("profiles").upsert({ id: u.user.id, role: "editor", display_name: "Noise Probe" });
  const ed = createClient(url, anon, { auth: { persistSession: false } });
  await ed.auth.signInWithPassword({ email, password });

  const { data: card } = await admin.from("board_cards")
    .insert({ title: `Noise Probe ${Date.now()}`, status: "editing" }).select("id").single();
  made.cards.push(card.id);
  const { data: nar } = await admin.from("narrators")
    .insert({ display_name: `Noise Narrator ${Date.now()}` }).select("id").single();
  made.narrators.push(nar.id);

  const raise = (kind, noise, note = "") =>
    ed.rpc("create_pickup", {
      p_card_id: card.id, p_chapter: "1", p_timestamp_at: "01:34", p_kind: kind,
      p_said: "", p_should_be: "", p_note: note, p_assigned_narrator_id: nar.id,
      p_noise_type: noise,
    });
  const read = async id =>
    (await admin.from("pickups").select("kind, noise_type, note").eq("id", id).single()).data;

  /* ── 1. noise + plosive ────────────────────────────────────────────────── */
  console.log("\nNoise, Plosive");
  let r = await raise("noise", "plosive");
  ck("saved", !r.error && !!r.data, r.error?.message ?? "");
  let row = await read(r.data);
  ck("kind is noise and noise_type is plosive",
    row.kind === "noise" && row.noise_type === "plosive", `${row.kind}/${row.noise_type}`);

  /* ── the two added on Dean's say-so ────────────────────────────────────── */
  for (const v of ["mouth_click", "sibilance"]) {
    r = await raise("noise", v);
    ck(`${v} is accepted`, !r.error, r.error?.message ?? "");
    if (!r.error) ck(`  and stored as ${v}`, (await read(r.data)).noise_type === v);
  }

  /* ── 2. a misread carries none, and the constraint says so ─────────────── */
  console.log("\nA misread");
  r = await ed.rpc("create_pickup", {
    p_card_id: card.id, p_chapter: "1", p_timestamp_at: "02:00", p_kind: "misread",
    p_said: "a", p_should_be: "b", p_note: "", p_assigned_narrator_id: nar.id,
    p_noise_type: "plosive",
  });
  ck("a noise type sent with a misread is ignored, not stored",
    !r.error && (await read(r.data)).noise_type === null, r.error?.message ?? "");

  const direct = await admin.from("pickups").insert({
    card_id: card.id, chapter: "1", timestamp_at: "03:00", kind: "misread",
    said: "a", should_be: "b", note: "", noise_type: "plosive",
  }).select();
  ck("and a DIRECT insert setting both is refused by the constraint",
    !!direct.error, direct.error?.message?.slice(0, 60) ?? "IT WAS ALLOWED");

  const bogus = await raise("noise", "kettle");
  ck("an unknown noise type is refused by name", !!bogus.error,
    bogus.error?.message?.slice(0, 60) ?? "ALLOWED");

  /* ── 3. switching a draft away from noise clears it ────────────────────── */
  console.log("\nSwitching a draft from Noise to Misread");
  r = await raise("noise", "hum");
  const id = r.data;
  ck("SETUP: it starts as a hum", (await read(id)).noise_type === "hum");
  const upd = await ed.rpc("update_own_draft_pickup", {
    p_id: id, p_chapter: "1", p_timestamp_at: "01:34", p_kind: "misread",
    p_said: "x", p_should_be: "y", p_note: "", p_assigned_narrator_id: nar.id,
    p_noise_type: "hum",
  });
  ck("the switch is accepted", !upd.error, upd.error?.message ?? "");
  ck("AND the noise type is cleared, not carried invisibly",
    (await read(id)).noise_type === null, String((await read(id)).noise_type));

  /* ── 4. Other keeps the note ───────────────────────────────────────────── */
  console.log("\nNoise, Other");
  r = await raise("noise", "other", "a chair, I think");
  row = await read(r.data);
  ck("stored as other with the note intact",
    row.noise_type === "other" && row.note === "a chair, I think",
    `${row.noise_type} / ${row.note}`);

  /* ── 5. it reaches the narrator's page ─────────────────────────────────── */
  console.log("\nThe narrator's page");
  const token = (await admin.rpc("issue_pickup_link", {
    p_card_id: card.id, p_chapter: "1", p_narrator_id: nar.id,
  })).data;
  await ed.rpc("send_chapter_pickups", { p_card_id: card.id, p_chapter: "1", p_narrator_ids: null });
  const batch = await admin.rpc("pickup_batch_by_token", { p_token: token });
  ck("the batch function still executes", !batch.error, batch.error?.message ?? "");
  const noisy = (batch.data ?? []).filter(x => x.kind === "noise");
  ck("and carries noise_type to her page",
    noisy.length > 0 && noisy.every(x => !!x.noise_type),
    noisy.map(x => x.noise_type).join(", "));

  /* ── and the editor's own read, which is a separate function ───────────── */
  const mine = await ed.rpc("pickup_noise_types_for_editor");
  ck("the editor read returns the types", !mine.error && (mine.data?.length ?? 0) > 0,
    mine.error?.message ?? `${mine.data?.length} rows`);
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  for (const id of made.cards) {
    await admin.from("activity_events").delete().eq("card_id", id);
    await admin.from("pickup_links").delete().eq("card_id", id);
    await admin.from("pickups").delete().eq("card_id", id);
    await admin.from("board_cards").delete().eq("id", id);
  }
  for (const id of made.narrators) await admin.from("narrators").delete().eq("id", id);
  for (const id of made.users) {
    let { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      await new Promise(r => setTimeout(r, 1500));
      ({ error } = await admin.auth.admin.deleteUser(id));
    }
    if (error) console.log(`  WARNING: probe ${id} not deleted — ${error.message}`);
  }
}
console.log(failures === 0 ? "\nNOISE TYPES OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
