/**
 * The three moves that are hers, run AS AN EDITOR.
 *
 * ── WHY THE ROLE IS THE WHOLE TEST ─────────────────────────────────────────
 *
 * board_cards has exactly one update policy and it admits admin. Every write
 * here SUCCEEDS FOR DEAN whether the setters exist or not — a run as him cannot
 * fail in the way this feature fails. So this signs in as an editor and never
 * touches the service key for anything it asserts.
 *
 * The RLS check is what keeps the rest honest: a direct UPDATE must still be
 * refused. The setter is meant to be the only door, and if the policy is ever
 * loosened to "fix" something, this catches it.
 *
 * Usage: npm run check-editor-moves
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

/*
  ── WHICH SECTIONS ARE DROP TARGETS, ASSERTED FROM THE SOURCE ─────────────

  The runtime check hovers each illegal section during a real drag and confirms
  it never highlights — but a section only renders when it has books in it, so
  "Finished" is simply absent for a probe that has completed none. An absence
  cannot be tested by hovering it.

  So the structural fact is asserted too: DropZone is used exactly three times
  and only for the three zones that are hers. An illegal target is not a
  droppable at all, which is what makes it inert by construction rather than by
  a check that runs after the gesture.
*/
{
  const hub = readFileSync(new URL("../src/app/editor/page.tsx", import.meta.url), "utf8");
  const zones = [...hub.matchAll(/<DropZone\s+zone="(\w+)"/g)].map(m => m[1]).sort();
  ck("exactly three sections are drop targets", zones.length === 3, zones.join(", "));
  ck("and they are the three that are hers",
    JSON.stringify(zones) === JSON.stringify(["elsewhere", "mine", "unclaimed"]), zones.join(", "));
  for (const forbidden of ["Coming next", "Not yet", "Finished"]) {
    // The heading must not sit inside a DropZone. Checked by proximity: no
    // DropZone opens between the heading and the nearest preceding section.
    const at = hub.indexOf(forbidden);
    const chunk = at > 0 ? hub.slice(Math.max(0, at - 600), at) : "";
    ck(`"${forbidden}" is not wrapped in a drop zone`, !/<DropZone[^>]*>\s*$/.test(chunk));
  }
}

const made = { users: [], cards: [], narrators: [] };
try {
  const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const email = `moves-${Date.now()}@example.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  made.users.push(u.user.id);
  await admin.from("profiles").upsert({ id: u.user.id, role: "editor", display_name: "Moves Probe" });
  const ed = createClient(url, anon, { auth: { persistSession: false } });
  const { error: sErr } = await ed.auth.signInWithPassword({ email, password });
  ck("signed in as an EDITOR, not an admin", !sErr, sErr?.message ?? "editor");

  const { data: card } = await admin
    .from("board_cards")
    .insert({ title: `Moves Probe ${Date.now()}`, status: "editing" })
    .select("id, title")
    .single();
  made.cards.push(card.id);

  const row = async () =>
    (
      await admin
        .from("board_cards")
        .select("editor_id, edited_externally, edited_externally_by, edited_externally_at")
        .eq("id", card.id)
        .single()
    ).data;
  const events = async () =>
    (await admin.from("activity_events").select("kind, detail").eq("card_id", card.id).order("seq"))
      .data ?? [];

  /* ── unclaimed -> edited elsewhere ─────────────────────────────────────── */
  console.log("\nUnclaimed to Edited elsewhere");
  let r = await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: true });
  ck("the setter accepts it from an editor", !r.error, r.error?.message ?? "");
  let a = await row();
  ck("edited_externally is true", a.edited_externally === true);
  ck("and it records HER as the one who asserted it", a.edited_externally_by === u.user.id,
    a.edited_externally_by ?? "null");
  ck("with a timestamp", !!a.edited_externally_at);
  const e1 = await events();
  ck("logged, carrying the previous value",
    e1.some(x => x.kind === "edited_externally_changed" && x.detail.was === false && x.detail.now === true),
    e1.map(x => x.kind).join(", "));
  ck("and says an EDITOR asserted it, not Dean",
    e1.find(x => x.kind === "edited_externally_changed")?.detail?.asserted_by_role === "editor");

  /* ── and back ──────────────────────────────────────────────────────────── */
  console.log("\nEdited elsewhere to Unclaimed");
  r = await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: false });
  ck("accepted", !r.error, r.error?.message ?? "");
  a = await row();
  ck("the flag is cleared", a.edited_externally === false);
  ck("AND BOTH new columns with it",
    a.edited_externally_by === null && a.edited_externally_at === null,
    `by=${a.edited_externally_by} at=${a.edited_externally_at}`);

  /* ── claimed -> elsewhere, one transaction ─────────────────────────────── */
  console.log("\nClaimed to Edited elsewhere");
  await ed.rpc("claim_card_for_editing", { p_card_id: card.id });
  ck("SETUP: she holds it", (await row()).editor_id === u.user.id);
  r = await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: true });
  ck("accepted", !r.error, r.error?.message ?? "");
  a = await row();
  ck("the flag is set AND her claim released, in one call",
    a.edited_externally === true && a.editor_id === null,
    `flag=${a.edited_externally} holder=${a.editor_id}`);
  ck("both transitions logged",
    (await events()).filter(x => x.kind === "book_released").length === 1);
  await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: false });

  /* ── somebody else's claim is not collateral ───────────────────────────── */
  console.log("\nSomebody else's book");
  const other = await admin.auth.admin.createUser({
    email: `moves-other-${Date.now()}@example.invalid`, password, email_confirm: true,
  });
  made.users.push(other.data.user.id);
  await admin.from("profiles").upsert({ id: other.data.user.id, role: "editor", display_name: "Other" });
  await admin.from("board_cards").update({ editor_id: other.data.user.id }).eq("id", card.id);
  r = await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: true });
  a = await row();
  ck("the flag sets, but the other editor keeps the book",
    !r.error && a.edited_externally === true && a.editor_id === other.data.user.id,
    a.editor_id === other.data.user.id ? "holder unchanged" : "HOLDER TAKEN");
  await admin.from("board_cards").update({ editor_id: null }).eq("id", card.id);
  await ed.rpc("set_edited_externally", { p_card_id: card.id, p_value: false });

  /* ── the setter is the only door ───────────────────────────────────────── */
  console.log("\nThe RLS policy still holds");
  const direct = await ed.from("board_cards")
    .update({ edited_externally: true }).eq("id", card.id).select();
  ck("a direct UPDATE is still refused for an editor",
    !!direct.error || (direct.data?.length ?? 0) === 0,
    direct.error?.message ?? `${direct.data?.length ?? 0} rows updated`);
  ck("and the row is untouched by it", (await row()).edited_externally === false);
  const status = await ed.from("board_cards")
    .update({ status: "released" }).eq("id", card.id).select();
  ck("and she still cannot write status",
    !!status.error || (status.data?.length ?? 0) === 0,
    status.error?.message ?? `${status.data?.length ?? 0} rows`);

  /* ── raising a pickup claims an unclaimed book ─────────────────────────── */
  console.log("\nRaising a pickup claims the book");
  const { data: nar } = await admin.from("narrators")
    .insert({ display_name: `Moves Narrator ${Date.now()}` }).select("id").single();
  made.narrators.push(nar.id);
  ck("SETUP: it starts unclaimed", (await row()).editor_id === null);
  r = await ed.rpc("create_pickup", {
    p_card_id: card.id, p_chapter: "1", p_timestamp_at: "00:10", p_kind: "other",
    p_said: "", p_should_be: "", p_note: "probe", p_assigned_narrator_id: nar.id,
  });
  ck("the pickup was raised", !r.error && !!r.data, r.error?.message ?? "");
  ck("AND the book is now hers", (await row()).editor_id === u.user.id);
  const e2 = await events();
  ck("with a book_claimed event saying how",
    e2.some(x => x.kind === "book_claimed" && x.detail.via === "pickup_raised"),
    e2.filter(x => x.kind === "book_claimed").map(x => x.detail?.via).join(", "));

  /* ── and never steals one ──────────────────────────────────────────────── */
  console.log("\nRaising a pickup on somebody else's book");
  await admin.from("board_cards").update({ editor_id: other.data.user.id }).eq("id", card.id);
  r = await ed.rpc("create_pickup", {
    p_card_id: card.id, p_chapter: "2", p_timestamp_at: "00:20", p_kind: "other",
    p_said: "", p_should_be: "", p_note: "probe 2", p_assigned_narrator_id: nar.id,
  });
  ck("the pickup still succeeds", !r.error, r.error?.message ?? "");
  ck("and the holder is UNCHANGED", (await row()).editor_id === other.data.user.id,
    "not reassigned");
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  for (const id of made.cards) {
    await admin.from("activity_events").delete().eq("card_id", id);
    await admin.from("pickups").delete().eq("card_id", id);
    await admin.from("board_cards").delete().eq("id", id);
  }
  for (const id of made.narrators) await admin.from("narrators").delete().eq("id", id);
  /*
    CHECKED AND RETRIED, not fired and forgotten.

    deleteUser returns an error object rather than throwing, which is how four
    probe accounts once survived their runs unnoticed. It also fails
    TRANSIENTLY: called immediately after the probe's card is deleted it
    answers "Database error deleting user", and the identical call a moment
    later succeeds — the cascade from the card is still settling. One retry
    after a pause is the difference between a clean run and a leftover account
    with a role.
  */
  for (const id of made.users) {
    let { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      await new Promise(r => setTimeout(r, 1500));
      ({ error } = await admin.auth.admin.deleteUser(id));
    }
    if (error) console.log(`  WARNING: probe ${id} not deleted — ${error.message}`);
  }
}
console.log(failures === 0 ? "\nEDITOR MOVES OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
