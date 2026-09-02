/**
 * Deleting the record of a take whose file is already gone.
 *
 * ── THE TWO THINGS THAT MUST BOTH BE TRUE ──────────────────────────────────
 *
 * The badge stops nagging AND the log still remembers. The sweep exists to
 * surface files that vanish, so a delete that erased the evidence would defeat
 * exactly the thing it is reporting on. Both halves are asserted here, because
 * either one alone would look like it worked.
 *
 * ── AND IT MUST REFUSE A PRESENT ROW ───────────────────────────────────────
 *
 * Chapter 6 holds a missing take and a present one, side by side. Deleting the
 * record of a file that still exists leaves a file in Dean's drive that nothing
 * points at. The UI hides the control on a present row; this proves the DATABASE
 * refuses it, which is the part that actually enforces it.
 *
 * Usage: npm run check-delete-missing-upload
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
  ── NO GRAPH CALL, ASSERTED FROM THE SOURCE ────────────────────────────────

  The file is already gone; reaching for it would either fail or, worse, succeed
  against whatever has since taken its place. This cannot be observed at runtime
  without intercepting the network, so it is asserted structurally: the delete
  goes straight from the browser to an RPC, and the component that calls it
  imports nothing that can reach OneDrive.
*/
console.log("The delete path cannot reach OneDrive");
{
  const src = readFileSync(new URL("../src/components/pickups/TakeLinks.tsx", import.meta.url), "utf8");
  ck("it calls the RPC directly, with no route in between",
    src.includes('supabase.rpc("delete_missing_upload"'));
  for (const forbidden of ["pickup-graph", "graphAppToken", "graph.microsoft.com", "itemById"]) {
    ck(`  and imports nothing named ${forbidden}`, !src.includes(forbidden));
  }
  const fn = readFileSync(new URL("../scripts/check-delete-missing-upload.mjs", import.meta.url), "utf8");
  ck("SETUP: this file would notice — it greps for real names", fn.includes("graphAppToken"));
}

const made = { users: [], cards: [], narrators: [] };
try {
  const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const email = `del-${Date.now()}@example.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  made.users.push(u.user.id);
  await admin.from("profiles").upsert({ id: u.user.id, role: "editor", display_name: "Delete Probe" });
  const ed = createClient(url, anon, { auth: { persistSession: false } });
  await ed.auth.signInWithPassword({ email, password });

  /*
    ── IT BUILDS ITS OWN PAIR ────────────────────────────────────────────────

    The first run of this check deleted the real Closing Credits row, which is
    what Dean asked for — and that made the check unrepeatable, because it
    depended on a row it had just consumed. A guard that can only pass once is
    not a guard.

    So it now creates its own chapter with TWO takes, one missing and one
    present, side by side exactly as chapter 6 had them, and removes both at the
    end. Nothing real is touched.
  */
  const { data: card } = await admin.from("board_cards")
    .insert({ title: `Delete Probe ${Date.now()}`, status: "editing" }).select("id").single();
  made.cards.push(card.id);
  const { data: nar } = await admin.from("narrators")
    .insert({ display_name: `Delete Narrator ${Date.now()}` }).select("id").single();
  made.narrators.push(nar.id);
  await admin.rpc("issue_pickup_link", {
    p_card_id: card.id, p_chapter: "9", p_narrator_id: nar.id,
  });
  const { data: link } = await admin.from("pickup_links").select("id")
    .eq("card_id", card.id).eq("chapter", "9").single();

  const mk = async (name, missing) => {
    const { data, error } = await admin.from("pickup_uploads").insert({
      link_id: link.id,
      original_name: name,
      quarantine_path: `Pickups/_incoming/${link.id}/${name}.wav`,
      content_type: "audio/wav",
      bytes: 1024,
      filed_at: new Date().toISOString(),
      onedrive_path: `Pickups/Probe/${name}.wav`,
      missing_since: missing ? new Date().toISOString() : null,
    }).select("id").single();
    // CHECKED, not assumed. The first version used a column that does not
    // exist (stored_name); the insert returned null and the failure surfaced
    // forty lines later as "cannot read properties of null".
    if (error) throw new Error(`fixture ${name}: ${error.message}`);
    return data;
  };

  await mk("Probe Missing Take", true);
  const presentRow = await mk("Probe Present Take", false);

  const chapter9 = async () =>
    ((await admin.rpc("uploads_for_editor")).data ?? []).find(r => r.card_id === card.id);

  /* ── the present row beside it must be refused ─────────────────────────── */
  console.log("\nA row whose file is still there");
  const refused = await ed.rpc("delete_missing_upload", { p_upload_id: presentRow.id });
  ck("the database REFUSES to delete its record", !!refused.error,
    refused.error?.message?.slice(0, 70) ?? "IT WAS DELETED");
  ck("and the row is still there",
    !!(await admin.from("pickup_uploads").select("id").eq("id", presentRow.id).maybeSingle()).data);
  ck("it is not offered in missing_takes either",
    !((await chapter9())?.missing_takes ?? []).some(t => t.id === presentRow.id));

  /* ── the missing one ───────────────────────────────────────────────────── */
  console.log("\nThe record of a file that is already gone");
  const before = await chapter9();
  ck("SETUP: the chapter reads 1 of 2 takes missing",
    before?.filed === 2 && before?.missing === 1, `filed=${before?.filed} missing=${before?.missing}`);
  const target = (before?.missing_takes ?? [])[0];
  ck("and names it", target?.name === "Probe Missing Take", target?.name ?? "unnamed");

  const eventsBefore = (await admin.from("activity_events")
    .select("id", { count: "exact", head: true }).eq("kind", "upload_record_deleted")).count ?? 0;

  const gone = await ed.rpc("delete_missing_upload", { p_upload_id: target.id });
  ck("an editor may delete it", !gone.error, gone.error?.message ?? "");
  ck("the row is gone",
    !(await admin.from("pickup_uploads").select("id").eq("id", target.id).maybeSingle()).data);

  const after = await chapter9();
  ck("the chapter now shows ONE present take and nothing missing",
    after?.filed === 1 && after?.missing === 0, `filed=${after?.filed} missing=${after?.missing}`);
  ck("so the badge has nothing to say about missing takes",
    (after?.missing_takes ?? []).length === 0);

  /* ── and the log remembers ─────────────────────────────────────────────── */
  console.log("\nThe log still remembers");
  const { data: ev } = await admin.from("activity_events")
    .select("kind, actor, actor_name, detail").eq("card_id", card.id)
    .eq("kind", "upload_record_deleted").order("seq", { ascending: false }).limit(1);
  const e = ev?.[0];
  ck("an event was written", (await admin.from("activity_events")
    .select("id", { count: "exact", head: true }).eq("kind", "upload_record_deleted")).count === eventsBefore + 1);
  ck("  naming the file", e?.detail?.file_name === "Probe Missing Take", e?.detail?.file_name);
  ck("  the chapter", e?.detail?.chapter === "9", e?.detail?.chapter);
  ck("  when it went missing", !!e?.detail?.missing_since, String(e?.detail?.missing_since).slice(0, 19));
  ck("  and who removed it", e?.actor === u.user.id && e?.actor_name === "Delete Probe", `${e?.actor_name}`);
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  for (const id of made.cards) {
    await admin.from("activity_events").delete().eq("card_id", id);
    await admin.from("pickup_uploads").delete().in("link_id",
      ((await admin.from("pickup_links").select("id").eq("card_id", id)).data ?? []).map(l => l.id));
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
console.log(failures === 0 ? "\nDELETE MISSING UPLOAD OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
