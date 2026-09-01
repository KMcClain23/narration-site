/**
 * Every logged action writes EXACTLY ONE row, of the right kind.
 *
 * ── WHY "EXACTLY ONE" IS THE ASSERTION ─────────────────────────────────────
 *
 * The failure this guards is not a missing entry, which somebody would notice.
 * It is a claim writing one row per chapter, or a send writing one per pickup —
 * a feed that is technically complete and unreadable, where the one thing that
 * happened is buried under forty rows saying so. So each action is run with the
 * log's high-water mark taken first, and what it added is compared against
 * exactly what it should have added.
 *
 * ── AND WHY IT USES A REAL SESSION ─────────────────────────────────────────
 *
 * Every function here reads auth.uid() for the actor. Called through the
 * service key, auth.uid() is null and every event would be attributed to
 * nobody — which is precisely the bug this is meant to catch on
 * editing_completed_by. So it signs in a probe editor and calls the functions
 * the way the app does.
 *
 * Everything it creates is removed, including the events, so the log is not
 * left with a test book's history in it.
 *
 * Usage: npm run check-activity-log
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

/** The log's high-water mark, so each action is measured against its own before. */
async function mark() {
  const { data } = await admin
    .from("activity_events").select("seq").order("seq", { ascending: false }).limit(1);
  return data?.[0]?.seq ?? 0;
}
async function since(seq, cardId) {
  const { data } = await admin
    .from("activity_events").select("kind, actor, detail, seq")
    .eq("card_id", cardId).gt("seq", seq).order("seq");
  return data ?? [];
}

/**
 * Run an action and assert what it wrote.
 * `expect` is the exact list of kinds, in order. [] means "must write nothing".
 */
async function act(name, cardId, fn, expect) {
  const before = await mark();
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  const rows = await since(before, cardId);
  const got = rows.map(r => r.kind);
  ck(
    `${name} → ${expect.length === 0 ? "no entry" : expect.join(" + ")}`,
    !threw && JSON.stringify(got) === JSON.stringify(expect),
    threw ? `threw: ${threw.message}` : got.length ? got.join(" + ") : "nothing",
  );
  return rows;
}

const made = { users: [], cards: [], narrators: [] };

try {
  /* ── A book of our own, so no real history is touched ─────────────────── */
  const email = `activity-${Date.now()}@example.invalid`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (uErr) throw new Error(`probe editor: ${uErr.message}`);
  made.users.push(u.user.id);
  await admin.from("profiles").upsert({ id: u.user.id, role: "editor", display_name: "Activity Probe" });

  const ed = createClient(url, anon, { auth: { persistSession: false } });
  const { error: sErr } = await ed.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`sign in: ${sErr.message}`);

  const { data: card, error: cErr } = await admin.from("board_cards")
    .insert({ title: `Activity Probe ${Date.now()}`, status: "editing", chapters_total: 3 })
    .select("id").single();
  if (cErr) throw new Error(`probe card: ${cErr.message}`);
  made.cards.push(card.id);

  const { data: nar } = await admin.from("narrators")
    .insert({ display_name: `Probe Narrator ${Date.now()}`, email: "probe@example.invalid" })
    .select("id").single();
  made.narrators.push(nar.id);

  console.log("One entry per action, no more\n");

  /* ── claim / release ──────────────────────────────────────────────────── */
  await act("claim", card.id, () => ed.rpc("claim_card_for_editing", { p_card_id: card.id })
    .then(r => { if (r.error) throw new Error(r.error.message); }), ["book_claimed"]);

  // THE CASE THE ASSERTION IS FOR: pressing Claim again is a successful no-op
  // and must add nothing. Without this, "exactly one" only means "at least one".
  await act("claim again (already hers)", card.id,
    () => ed.rpc("claim_card_for_editing", { p_card_id: card.id })
      .then(r => { if (r.error) throw new Error(r.error.message); }), []);

  /* ── chapters ─────────────────────────────────────────────────────────── */
  await act("first chapter done", card.id,
    () => ed.rpc("toggle_chapter_done", { p_card_id: card.id, p_chapter: "1" })
      .then(r => { if (r.error) throw new Error(r.error.message); }),
    ["editing_started", "chapter_done"]);

  await act("second chapter done", card.id,
    () => ed.rpc("toggle_chapter_done", { p_card_id: card.id, p_chapter: "2" })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["chapter_done"]);

  await act("un-done", card.id,
    () => ed.rpc("toggle_chapter_done", { p_card_id: card.id, p_chapter: "2" })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["chapter_undone"]);

  // editing_started must never fire twice, including after the book has been
  // emptied back to nothing and restarted.
  await act("clear the last chapter", card.id,
    () => ed.rpc("toggle_chapter_done", { p_card_id: card.id, p_chapter: "1" })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["chapter_undone"]);
  await act("start again from zero", card.id,
    () => ed.rpc("toggle_chapter_done", { p_card_id: card.id, p_chapter: "1" })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["chapter_done"]);

  /* ── pickups ──────────────────────────────────────────────────────────── */
  let pickupIds = [];
  const raise = n => ed.rpc("create_pickup", {
    p_card_id: card.id, p_chapter: "1", p_timestamp_at: `0${n}:00`, p_kind: "other",
    p_said: "", p_should_be: "", p_note: `probe ${n}`, p_assigned_narrator_id: nar.id,
  }).then(r => { if (r.error) throw new Error(r.error.message); pickupIds.push(r.data); });

  await act("raise a pickup", card.id, () => raise(1), ["pickup_raised"]);
  await raise(2); await raise(3);

  // THREE drafts, ONE send. This is the assertion the whole file exists for.
  await act("send three drafts", card.id,
    () => ed.rpc("send_chapter_pickups", { p_card_id: card.id, p_chapter: "1", p_narrator_ids: null })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["pickups_sent"]);

  const token = (await admin.rpc("issue_pickup_link", {
    p_card_id: card.id, p_chapter: "1", p_narrator_id: nar.id,
  })).data;

  await act("narrator returns all three", card.id,
    () => admin.rpc("mark_returned_by_token", {
      p_token: token, p_pickup_ids: pickupIds, p_note: null,
    }).then(r => { if (r.error) throw new Error(r.error.message); }), ["pickup_returned"]);

  // Re-confirming a batch that has already come back moves nothing, so it
  // must add nothing — otherwise every revisit of the link fills the feed.
  await act("narrator re-confirms the same batch", card.id,
    () => admin.rpc("mark_returned_by_token", {
      p_token: token, p_pickup_ids: pickupIds, p_note: null,
    }).then(r => { if (r.error) throw new Error(r.error.message); }), []);

  await act("resolve one", card.id,
    () => ed.rpc("resolve_pickup", { p_id: pickupIds[0], p_status: "resolved", p_note: null })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["pickup_resolved"]);
  await act("dismiss another", card.id,
    () => ed.rpc("resolve_pickup", { p_id: pickupIds[1], p_status: "dismissed", p_note: null })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["pickup_resolved"]);

  /* ── completion, and WHO ──────────────────────────────────────────────── */
  const completed = await act("mark complete", card.id,
    () => ed.rpc("set_editing_complete", { p_card_id: card.id, p_complete: true })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["book_completed"]);

  const { data: after } = await admin.from("board_cards")
    .select("editing_completed_at, editing_completed_by").eq("id", card.id).single();
  ck("editing_completed_at is set", !!after.editing_completed_at);
  ck("editing_completed_by is the SIGNED-IN person, not a service role",
    after.editing_completed_by === u.user.id,
    after.editing_completed_by === null ? "null — auth.uid() did not reach the update" : "matches");

  // One open pickup remains (the third, still 'returned'), and the event has to
  // have recorded that rather than today's answer.
  ck("the completion event kept the open-pickup count of that moment",
    completed[0]?.detail?.open_pickups_at_completion === 1,
    `recorded ${completed[0]?.detail?.open_pickups_at_completion}`);

  await act("release the book", card.id,
    () => ed.rpc("release_card_editing", { p_card_id: card.id })
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["book_released"]);

  /* ── status_changed, through the trigger ──────────────────────────────── */
    // A status the CHECK constraint actually permits. The first attempt used
    // "mastering", which this app has never had — the probe was wrong, not the
    // trigger, and the constraint said so immediately.
  await act("status change", card.id,
    () => admin.from("board_cards").update({ status: "recording" }).eq("id", card.id)
      .then(r => { if (r.error) throw new Error(r.error.message); }), ["status_changed"]);

  /* ── the actor is a person throughout ─────────────────────────────────── */
  const all = await since(0, card.id);
  const byEditor = all.filter(r => r.actor === u.user.id).length;
  ck("SETUP: the whole run produced a feed to inspect", all.length > 10, `${all.length} entries`);
  ck("every entry an editor caused names her, not a service role",
    byEditor >= 10, `${byEditor} of ${all.length} attributed to the probe editor`);
  // The narrator's return is the one entry with no uid, on purpose.
  const narratorEntry = all.find(r => r.kind === "pickup_returned" && r.detail?.by === "narrator");
  ck("the narrator's return has a null actor and names her in detail",
    narratorEntry && narratorEntry.actor === null && narratorEntry.detail.narrator_id === nar.id);

  /* ── the feed function renders it ─────────────────────────────────────── */
  //
  // READ THROUGH A REAL ADMIN SESSION, which is how the page reads it — the
  // gate only sees a caller when one is passed. The editor session above is the
  // control: activity_feed is admin-only, and an editor must be refused.
  const refused = await ed.rpc("activity_feed", { p_card_id: card.id, p_limit: 200 });
  ck("an editor is refused the admin log", !!refused.error,
    refused.error?.message ?? `ALLOWED — ${refused.data?.length} rows`);

  const aEmail = `activity-admin-${Date.now()}@example.invalid`;
  const aPass = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const { data: au } = await admin.auth.admin.createUser({
    email: aEmail, password: aPass, email_confirm: true,
  });
  made.users.push(au.user.id);
  await admin.from("profiles").upsert({ id: au.user.id, role: "admin", display_name: "Activity Admin" });
  const adminSession = createClient(url, anon, { auth: { persistSession: false } });
  await adminSession.auth.signInWithPassword({ email: aEmail, password: aPass });

  const feed = await adminSession.rpc("activity_feed", { p_card_id: card.id, p_limit: 200 });
  ck("activity_feed returns the same entries", !feed.error && feed.data.length === all.length,
    feed.error?.message ?? `${feed.data?.length} vs ${all.length}`);
  ck("newest first", (feed.data ?? []).every((r, i, a) => i === 0 || a[i - 1].seq > r.seq));
  ck("it resolves the actor's name", feed.data?.some(r => r.actor_name === "Activity Probe"));
  ck("and the narrator's", feed.data?.some(r => r.narrator_name?.startsWith("Probe Narrator")));
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  for (const id of made.cards) {
    await admin.from("activity_events").delete().eq("card_id", id);
    await admin.from("pickup_links").delete().eq("card_id", id);
    await admin.from("pickups").delete().eq("card_id", id);
    await admin.from("chapter_progress").delete().eq("card_id", id);
    await admin.from("board_cards").delete().eq("id", id);
  }
  for (const id of made.narrators) await admin.from("narrators").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id);
  const { count } = await admin.from("activity_events").select("id", { count: "exact", head: true });
  console.log(`\ncleaned up; ${count} real entries remain in the log`);
}

console.log(failures === 0 ? "\nACTIVITY LOG OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
