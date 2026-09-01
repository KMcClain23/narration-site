/**
 * "Send a fresh link" — the gate, the replacement, and everything it must NOT do.
 *
 * ── WHY EACH HALF EXISTS ───────────────────────────────────────────────────
 *
 * PART 1 goes through the real HTTP route with real session cookies, because
 * the route handler is the only thing standing in front of a credential mint:
 * `issue_pickup_link` is service_role-only and refuses every other caller, so
 * no gate inside the database can see who is asking. A test that called
 * sendFreshLink() directly would prove the mechanism and nothing about who may
 * reach it.
 *
 * PART 2 calls sendFreshLink() with `fetch` intercepted, because the route
 * deliberately does NOT return the token — so the only way to prove the EMAILED
 * link opens the batch is to read the link out of the outgoing message. The
 * interception forwards to Resend afterwards, so the email really is sent and
 * the thing under test is the real one.
 *
 * ── THE ABSENCE ASSERTIONS ALL HAVE POSITIVE CONTROLS ──────────────────────
 *
 * "No pickup moved" and "no clip was re-cut" are the claims most likely to pass
 * for the wrong reason — a snapshot compared against itself proves nothing if
 * the snapshot was empty or read the wrong rows. So every before/after pair
 * first asserts the rows EXIST and carry the values being watched, and the
 * clip check asserts at least one row has a non-null clip column to compare.
 *
 * Usage: npm run check-fresh-link
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORIGIN = process.env.CHECK_ORIGIN ?? "http://localhost:3000";
if (!url || !anon || !key) {
  console.error("Supabase env not set. Run with --env-file=.env.local, as the npm script does.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const ref = new URL(url).hostname.split(".")[0];

let failures = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};

/** The @supabase/ssr cookie, built by hand so a script can hold a session. */
function authCookie(session) {
  const raw = Buffer.from(JSON.stringify(session), "utf8").toString("base64");
  return `sb-${ref}-auth-token=base64-${raw}`;
}

async function signIn(email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in: ${error.message}`);
  return data.session;
}

async function makeUser(role) {
  const email = `freshlink-${role}-${Date.now()}@example.invalid`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-9!`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw new Error(`create ${role}: ${error.message}`);
  await admin.from("profiles").upsert({ id: data.user.id, role, display_name: `Probe ${role}` });
  return { id: data.user.id, email, password };
}

const post = (body, cookie) =>
  fetch(`${ORIGIN}/api/pickups/fresh-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

/** Everything about the batch's pickups that this action must not change. */
const WATCHED = [
  "id", "status", "sent_at", "resolved_at", "resolved_by",
  "clip_item_id", "clip_skip_reason", "clip_skip_final",
  "clip_attempts", "clip_first_attempt_at", "clip_last_attempt_at", "clip_last_error",
];

async function snapshot(cardId, chapter, narratorId) {
  const { data, error } = await admin
    .from("pickups")
    .select(WATCHED.join(","))
    .eq("card_id", cardId).eq("chapter", chapter).eq("assigned_narrator_id", narratorId)
    .order("id");
  if (error) throw new Error(`snapshot: ${error.message}`);
  return data;
}

const created = [];
let liveTokenAtEnd = null;

try {
  /* ── The batch. A REAL, LIVE one, and one whose narrator is Dean's own
        address — the action sends a real email and a rehearsal must not land
        in someone else's inbox. ─────────────────────────────────────────── */
  const { data: batchRows, error: brErr } = await admin.rpc("pickup_batches_for_editor");
  if (brErr) throw new Error(`batches: ${brErr.message}`);
  const batch = (batchRows ?? [])
    .filter(b => b.has_email && b.open_count + b.returned_count > 0 && b.link_live)
    .sort((a, b) => b.open_count + b.returned_count - (a.open_count + a.returned_count))[0];
  if (!batch) throw new Error("no live batch with rows and an address to test against");

  const { data: nar } = await admin.from("narrators")
    .select("display_name,email").eq("id", batch.narrator_id).single();
  const { data: card } = await admin.from("board_cards")
    .select("title").eq("id", batch.card_id).single();
  console.log(
    `The batch: ${card.title} · chapter ${batch.chapter} · ${nar.display_name} <${nar.email}>\n` +
    `           ${batch.open_count} sent, ${batch.returned_count} returned, link live\n`,
  );
  ck("SETUP: the test address is Dean's own, not a third party's",
    /@dmnarration\.com$/i.test(nar.email ?? ""), nar.email ?? "");
  if (failures) throw new Error("refusing to email anyone else during a check");

  const totalRows = async table =>
    (await admin.from(table).select("id", { count: "exact", head: true })).count;
  const notesBefore = await totalRows("pickup_notes");
  const uploadsBefore = await totalRows("pickup_uploads");

  const before = await snapshot(batch.card_id, batch.chapter, batch.narrator_id);
  ck("SETUP: the snapshot has rows to compare", before.length > 0, `${before.length} rows`);
  // The positive control for "no clip was re-cut": if nothing here has ever had
  // a clip column set, a comparison would agree on a row of nulls and prove
  // nothing about whether cutting was attempted.
  ck("SETUP: at least one row carries a clip value, so the clip check can fail",
    before.some(r => r.clip_item_id || r.clip_skip_reason || r.clip_attempts > 0),
    // The detail names clip_item_id explicitly: the first version showed only
    // attempts and reason, printed "0/- 0/- 0/-" beside a pass, and read like a
    // vacuous assertion when in fact all five rows carry a cut clip.
    before.map(r => `${r.clip_item_id ? "clip" : "none"}:${r.clip_attempts}`).join(" "));

  /* ── PART 0: the gate ─────────────────────────────────────────────────── */
  console.log("\nWho may press it");
  const body = {
    cardId: batch.card_id, chapter: batch.chapter, narratorId: batch.narrator_id,
  };

  const anonRes = await post(body, null);
  ck("a request with no session is refused", anonRes.status === 401, `${anonRes.status}`);

  // THE POSITIVE CONTROL FOR THE GATE. A signed-in account with neither role
  // must also be refused — otherwise "401" above might only mean "no cookie
  // parsed" and the gate could be admitting anyone who is logged in at all.
  const nobody = await makeUser("author");
  created.push(nobody.id);
  const nobodyRes = await post(body, authCookie(await signIn(nobody.email, nobody.password)));
  ck("a signed-in account with neither role is refused",
    nobodyRes.status === 401, `${nobodyRes.status}`);

  const editor = await makeUser("editor");
  created.push(editor.id);
  const editorCookie = authCookie(await signIn(editor.email, editor.password));
  const reach = await post({ cardId: batch.card_id, chapter: "__no_such_chapter", narratorId: batch.narrator_id }, editorCookie);
  const reachBody = await reach.json();
  ck("an editor reaches the handler", reach.status === 200, `${reach.status}`);
  ck("and a batch with no link is refused, not sent",
    reachBody?.outcome?.sent === false && /No link has ever been sent/.test(reachBody?.outcome?.refused ?? ""),
    JSON.stringify(reachBody?.outcome ?? {}).slice(0, 120));

  /* ── PART 1: the replacement, through the route ───────────────────────── */
  console.log("\nThe replacement itself");

  // The link she is holding right now. Minted directly so the script knows the
  // token — this stands in for the one in her inbox.
  const { data: oldToken, error: oErr } = await admin.rpc("issue_pickup_link", {
    p_card_id: batch.card_id, p_chapter: batch.chapter, p_narrator_id: batch.narrator_id,
  });
  if (oErr) throw new Error(`old token: ${oErr.message}`);
  const opened = await admin.rpc("pickup_batch_by_token", { p_token: oldToken });
  ck("SETUP: the link she holds opens the batch",
    (opened.data?.length ?? 0) === before.length, `${opened.data?.length ?? 0} rows`);

  const res = await post(body, editorCookie);
  const out = (await res.json())?.outcome;
  ck("the editor's press is accepted", res.status === 200, `${res.status}`);
  ck("and an email went", out?.sent === true, JSON.stringify(out ?? {}).slice(0, 160));
  ck("to the narrator's own address", out?.email === nar.email, out?.email ?? "");

  const dead = await admin.rpc("pickup_batch_by_token", { p_token: oldToken });
  ck("THE OLD TOKEN NOW OPENS NOTHING",
    !dead.error && (dead.data?.length ?? 0) === 0,
    dead.error?.message ?? `${dead.data?.length} rows`);

  const { data: links } = await admin.from("pickup_links")
    .select("id,created_at,revoked_at,expires_at")
    .eq("card_id", batch.card_id).eq("chapter", batch.chapter).eq("narrator_id", batch.narrator_id);
  const live = links.filter(l => !l.revoked_at && new Date(l.expires_at) > new Date());
  ck("exactly one live link exists for the batch", live.length === 1, `${live.length}`);

  /* ── What must NOT have happened ──────────────────────────────────────── */
  console.log("\nWhat it must not have touched");
  const after = await snapshot(batch.card_id, batch.chapter, batch.narrator_id);
  ck("the same pickups are still there", after.length === before.length,
    `${before.length} -> ${after.length}`);

  const diffs = [];
  for (const b of before) {
    const a = after.find(r => r.id === b.id);
    if (!a) { diffs.push(`${b.id} vanished`); continue; }
    for (const col of WATCHED) {
      if (JSON.stringify(a[col]) !== JSON.stringify(b[col])) {
        diffs.push(`${b.id.slice(0, 8)} ${col}: ${JSON.stringify(b[col])} -> ${JSON.stringify(a[col])}`);
      }
    }
  }
  ck("NO pickup status moved and NO clip column changed", diffs.length === 0, diffs.join("; "));

  // The returned-notification is only ever reachable from a batch whose rows
  // moved to 'returned'. Nothing moved, so it cannot have fired for this batch
  // — and the note count is the second witness, since a return writes one.
  const nowReturned = after.filter(r => r.status === "returned").length;
  const wasReturned = before.filter(r => r.status === "returned").length;
  ck("nothing became 'returned', so the returned-notification cannot have fired",
    nowReturned === wasReturned, `${wasReturned} -> ${nowReturned}`);

  // Two side-effect tables the send writes and this must not. Counted BEFORE
  // the press as well — a bare "after" number agrees with any expectation, and
  // `pickup_notes` has no card_id, so a scoped count would have been an error
  // dressed up as a pass.
  ck("no note was written", notesBefore === (await totalRows("pickup_notes")),
    `${notesBefore} -> ${await totalRows("pickup_notes")}`);
  ck("no upload row appeared", uploadsBefore === (await totalRows("pickup_uploads")),
    `${uploadsBefore} -> ${await totalRows("pickup_uploads")}`);

  /* ── PART 2: the emailed link is the one that works ───────────────────── */
  console.log("\nThe link that was actually emailed");
  // `server-only` throws on import outside a server component. tsx runs this
  // with --conditions=react-server (see the npm script), which is the condition
  // that resolves that package to its no-op build — so the module under test is
  // imported unmodified rather than being copied or stubbed.
  const { sendFreshLink } = await import("../src/lib/pickup-fresh-link.ts");

  let captured = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const href = typeof input === "string" ? input : (input?.url ?? "");
    if (href.startsWith("https://api.resend.com/emails")) {
      captured = JSON.parse(init.body);
    }
    // FORWARDED, not stubbed. The email really goes, so this is the live path.
    return realFetch(input, init);
  };
  const out2 = await sendFreshLink(batch.card_id, batch.chapter, batch.narrator_id);
  globalThis.fetch = realFetch;

  ck("it sent", out2.sent === true, JSON.stringify(out2).slice(0, 160));
  ck("the outgoing message was captured", !!captured);

  const link = (captured?.text ?? "").match(/https?:\/\/\S+\/p\/([0-9a-f]{64})/);
  ck("the email carries a link", !!link, (captured?.text ?? "").slice(0, 60));
  liveTokenAtEnd = link?.[1] ?? null;

  const fresh = await admin.rpc("pickup_batch_by_token", { p_token: liveTokenAtEnd });
  ck("THE EMAILED TOKEN OPENS THE BATCH",
    !fresh.error && (fresh.data?.length ?? 0) === before.length,
    fresh.error?.message ?? `${fresh.data?.length ?? 0} of ${before.length} rows`);
  ck("the same pickups, in the same statuses",
    JSON.stringify((fresh.data ?? []).map(r => [r.pickup_id, r.status]).sort()) ===
      JSON.stringify(before.map(r => [r.id, r.status]).sort()));

  /* ── The counts, now that this batch has several link rows ────────────── */
  //
  // THE REGRESSION THIS PINS. pickup_batches_for_editor first joined
  // pickup_links to pickups and aggregated the result, so the counts were
  // multiplied by the number of links: a batch re-sent nine times reported 45
  // pickups where there were 5. It read correctly on every batch with one link
  // row, which was all of them when it was written.
  //
  // By this point the check itself has minted several links for this batch, so
  // it is the multi-link case by construction rather than by luck.
  console.log("\nThe counts, against a batch with more than one link");
  const { count: linkRows } = await admin.from("pickup_links")
    .select("id", { count: "exact", head: true })
    .eq("card_id", batch.card_id).eq("chapter", batch.chapter).eq("narrator_id", batch.narrator_id);
  ck("SETUP: the batch has several links, so an inflated count could show",
    linkRows > 1, `${linkRows} link rows`);

  const { data: reread } = await admin.rpc("pickup_batches_for_editor");
  const now = (reread ?? []).find(x =>
    x.card_id === batch.card_id && x.chapter === batch.chapter && x.narrator_id === batch.narrator_id);
  const trueSent = before.filter(r => r.status === "sent").length;
  const trueReturned = before.filter(r => r.status === "returned").length;
  ck("the counts are the pickups, not pickups x links",
    now?.open_count === trueSent && now?.returned_count === trueReturned,
    `reported ${now?.open_count}/${now?.returned_count}, true ${trueSent}/${trueReturned}`);

  /* ── The two emails, side by side ─────────────────────────────────────── */
  console.log("\nHow it reads against a pickup send");
  const subject = captured?.subject ?? "";
  const html = captured?.html ?? "";
  const text = captured?.text ?? "";
  console.log(`  send    subject: ${card.title} — chapter ${batch.chapter} pickups`);
  console.log(`  replace subject: ${subject}`);
  ck("the subject is not the send's subject",
    subject !== `${card.title} — chapter ${batch.chapter} pickups`, subject);
  ck("and does not read as pickups being issued",
    !/^\S.*—\s*chapter .* pickups$/.test(subject) && /new link/i.test(subject), subject);
  // WHAT A MAIL LIST ACTUALLY SHOWS. A subject that only differs past the
  // truncation point is the same subject as far as the reader is concerned.
  ck("it is already unmistakable at the width a mail list truncates to",
    !subject.slice(0, 40).startsWith(card.title) && /new link/i.test(subject.slice(0, 40)),
    `"${subject.slice(0, 40)}…"`);

  // The strongest signal, and the instruction: it emails only the link.
  const pickupTexts = before.map(r => r.id);
  ck("no correction is reproduced in the body",
    !/timestamp|Said|Should be/i.test(html.replace(/<[^>]+>/g, " ")) &&
      !pickupTexts.some(id => html.includes(id)));
  ck("no count of pickups appears anywhere",
    !/\b\d+\s+pickups?\b/i.test(html.replace(/<[^>]+>/g, " ")) && !/\b\d+\s+pickups?\b/i.test(text));
  ck("it says outright that nothing new was added",
    /nothing new has been added/i.test(text) && /nothing new has been added/i.test(html));
  ck("it says the previous link is dead",
    /previous link no longer works/i.test(text));

  // THE ARTEFACT IS WRITTEN REDACTED. The first run of this check saved the
  // live token to disk and printed it — a bearer credential with no second
  // factor, copied somewhere that outlives the email, which is the one thing
  // pickup-link.ts says must never happen. The token is used above and then
  // goes no further.
  const redacted = html.replace(/[0-9a-f]{64}/g, "TOKEN-REDACTED");
  ck("the saved artefact carries no token", !/[0-9a-f]{64}/.test(redacted));
  await import("node:fs").then(fs =>
    fs.writeFileSync("C:/Users/DeanM/AppData/Local/Temp/claude/emailcmp/replace.html", redacted));
  console.log("  wrote replace.html (token redacted) beside send.html for the visual read");
} catch (e) {
  console.error(`\nHARNESS ERROR: ${e.message}`);
  failures++;
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  console.log(`\ncleaned up ${created.length} probe account(s)`);
  if (liveTokenAtEnd) {
    const { data } = await admin.rpc("pickup_batch_by_token", { p_token: liveTokenAtEnd });
    console.log(`the batch's live link opens ${data?.length ?? 0} pickups — left working on purpose`);
  }
}

console.log(failures === 0 ? "\nFRESH LINK OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
