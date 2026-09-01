/**
 * set_editing_progress, through the EXACT call versionCode 49 and 54 make.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `chapters_edited` has two writers with different meanings. The phone writes a
 * COUNT. The website records a SET — one row per chapter in `chapter_progress` —
 * and a trigger derives the count from it. The phone's write used to land on top
 * of the derived number, and the next web toggle recomputed it from the rows and
 * threw the phone's number away. Nothing failed; the number just quietly went
 * backwards, in an app whose whole job is recording progress.
 *
 * So the function now CONVERTS a count into the rows it implies, and REFUSES
 * when converting would destroy information — chapters marked done out of
 * order, where no single number can express the set.
 *
 * THE SIGNATURE MUST NOT MOVE. versionCode 49 and 54 are installed on real
 * phones and call this function with these three arguments; a changed parameter
 * forces DROP+CREATE, which resets the ACL and re-grants EXECUTE to PUBLIC. Both
 * builds send all three named arguments, with an explicit JSON null when a field
 * is blank — so that is what this sends. A test that omitted the nulls would
 * pass while the shipped builds failed.
 *
 * Usage: npm run check-editing-progress
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COWBOY = "37b4ff9b-4ec9-4fe3-ba2c-3b41821a7b94";

let failures = 0;
const ck = (n, p, d = "") => { console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`); if (!p) failures++; };

let userId = null, untracked = null;
const snap = {};

/** Exactly how BoardRepository.setEditingProgress builds the payload. */
const asThePhoneDoes = (client, cardId, edited, total) =>
  client.rpc("set_editing_progress", {
    p_card_id: cardId,
    p_chapters_edited: edited,   // null stays null, as JsonNull does
    p_chapters_total: total,
  });

const setOf = async cardId => {
  const { data } = await admin.from("chapter_progress").select("chapter").eq("card_id", cardId);
  return data.map(r => r.chapter).sort((a, b) => (+a || 1e9) - (+b || 1e9) || a.localeCompare(b));
};
const countOf = async cardId =>
  (await admin.from("board_cards").select("chapters_edited").eq("id", cardId).single()).data.chapters_edited;

try {
  const email = `prog-${Date.now()}@example.invalid`, password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  userId = made.user.id;
  await admin.from("profiles").upsert({ id: userId, role: "editor", display_name: "Progress Probe" });
  const ed = createClient(url, anon, { auth: { persistSession: false } });
  await ed.auth.signInWithPassword({ email, password });

  snap.cowboy = { set: await setOf(COWBOY), count: await countOf(COWBOY) };
  console.log(`A Cowboy's Runaway starts at [${snap.cowboy.set.join(",")}] count=${snap.cowboy.count}\n`);

  // ── CASE 1: an UNTRACKED card — the phone's write must land unchanged ───
  console.log("A card with no chapter rows at all");
  const { data: cards } = await admin.from("board_cards")
    .select("id,title,chapters_edited,chapters_total").is("archived_at", null).eq("status", "editing");
  for (const c of cards) {
    const { count } = await admin.from("chapter_progress")
      .select("chapter", { count: "exact", head: true }).eq("card_id", c.id);
    if (!count) { untracked = c; break; }
  }
  snap.untracked = { edited: untracked.chapters_edited, total: untracked.chapters_total };
  console.log(`       ${untracked.title}`);

  const r1 = await asThePhoneDoes(ed, untracked.id, 9, 20);
  ck("the write is accepted", !r1.error, r1.error?.message ?? "");
  ck("and lands exactly as typed", (await countOf(untracked.id)) === 9, `${await countOf(untracked.id)}`);
  ck("creating no chapter rows — the count IS the record", (await setOf(untracked.id)).length === 0);

  // A blank field on an untracked card still means "clear it", as it always did.
  const r1b = await asThePhoneDoes(ed, untracked.id, null, 20);
  ck("a blank field still clears it on an untracked card",
    !r1b.error && (await countOf(untracked.id)) === null, `${await countOf(untracked.id)}`);

  // ── CASE 2: a TRACKED card with a contiguous set — convert ──────────────
  console.log("\nA Cowboy's Runaway, contiguous 1-6, typing 9");
  ck("SETUP: the set really is contiguous 1-6",
    JSON.stringify(await setOf(COWBOY)) === JSON.stringify(["1","2","3","4","5","6"]),
    (await setOf(COWBOY)).join(","));

  const r2 = await asThePhoneDoes(ed, COWBOY, 9, 23);
  ck("the write is accepted", !r2.error, r2.error?.message ?? "");
  const after = await setOf(COWBOY);
  ck("it produced rows 1-9", JSON.stringify(after) === JSON.stringify(["1","2","3","4","5","6","7","8","9"]), after.join(","));
  ck("and chapters_edited reads 9", (await countOf(COWBOY)) === 9, `${await countOf(COWBOY)}`);

  // Going DOWN removes rows, so the count stays the truth in both directions.
  const r2b = await asThePhoneDoes(ed, COWBOY, 6, 23);
  ck("typing a smaller number removes the extra rows",
    !r2b.error && JSON.stringify(await setOf(COWBOY)) === JSON.stringify(["1","2","3","4","5","6"]),
    (await setOf(COWBOY)).join(","));

  // ── CASE 3: non-contiguous — refuse, and say which chapter ──────────────
  console.log("\nThe same card with 8 done and 7 not");
  await admin.from("chapter_progress").insert({ card_id: COWBOY, chapter: "8" });
  ck("SETUP: the set is 1-6 plus 8", JSON.stringify(await setOf(COWBOY)) ===
    JSON.stringify(["1","2","3","4","5","6","8"]), (await setOf(COWBOY)).join(","));
  const countBefore = await countOf(COWBOY);

  const r3 = await asThePhoneDoes(ed, COWBOY, 7, 23);
  ck("the write is REFUSED", !!r3.error, r3.error?.message ?? "ACCEPTED");
  ck("and the message names the chapter that is out of order",
    /\b8\b/.test(r3.error?.message ?? "") && /out of order/i.test(r3.error?.message ?? ""),
    r3.error?.message ?? "");
  ck("says to use the website", /website/i.test(r3.error?.message ?? ""), r3.error?.message ?? "");
  ck("the set is UNTOUCHED", JSON.stringify(await setOf(COWBOY)) ===
    JSON.stringify(["1","2","3","4","5","6","8"]), (await setOf(COWBOY)).join(","));
  ck("and so is the count", (await countOf(COWBOY)) === countBefore, `${await countOf(COWBOY)}`);

  // The refusal is about the SET, not the number: 8 would also be refused.
  const r3b = await asThePhoneDoes(ed, COWBOY, 8, 23);
  ck("a different number is refused too — the set is what cannot be expressed",
    !!r3b.error, r3b.error?.message ?? "ACCEPTED");

  // ── the blank-field case on a TRACKED card ─────────────────────────────
  console.log("\nA blank field must never delete her per-chapter work");
  const r4 = await asThePhoneDoes(ed, COWBOY, null, 23);
  ck("accepted", !r4.error, r4.error?.message ?? "");
  ck("and the set survives", JSON.stringify(await setOf(COWBOY)) ===
    JSON.stringify(["1","2","3","4","5","6","8"]), (await setOf(COWBOY)).join(","));

  // ── the guard the whole change is for ──────────────────────────────────
  console.log("\nThe silent overwrite is gone");
  await admin.from("chapter_progress").delete().eq("card_id", COWBOY).eq("chapter", "8");
  await asThePhoneDoes(ed, COWBOY, 9, 23);
  const phoneSaid = await countOf(COWBOY);
  // Now a web toggle, which is what used to clobber it.
  await ed.rpc("toggle_chapter_done", { p_card_id: COWBOY, p_chapter: "10" });
  const afterToggle = await countOf(COWBOY);
  ck("the phone's 9 became rows, so a web toggle builds on it rather than erasing it",
    phoneSaid === 9 && afterToggle === 10, `phone=${phoneSaid} afterToggle=${afterToggle}`);
} catch (e) {
  console.error("\nHARNESS ERROR:", e.message);
  failures++;
} finally {
  // Back to exactly what was there.
  await admin.from("chapter_progress").delete().eq("card_id", COWBOY);
  if (snap.cowboy?.set?.length) {
    await admin.from("chapter_progress").insert(snap.cowboy.set.map(ch => ({ card_id: COWBOY, chapter: ch })));
  }
  await admin.from("board_cards").update({ chapters_edited: snap.cowboy?.count ?? null }).eq("id", COWBOY);
  if (untracked) {
    await admin.from("board_cards")
      .update({ chapters_edited: snap.untracked.edited, chapters_total: snap.untracked.total })
      .eq("id", untracked.id);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log(`\nrestored: A Cowboy's Runaway [${(await setOf(COWBOY)).join(",")}] count=${await countOf(COWBOY)}`);
  if (untracked) {
    const u = (await admin.from("board_cards").select("chapters_edited,chapters_total").eq("id", untracked.id).single()).data;
    console.log(`          ${untracked.title} edited=${u.chapters_edited} total=${u.chapters_total}`);
  }
}
console.log(failures === 0 ? "\nPROGRESS OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
