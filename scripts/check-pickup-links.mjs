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
 * holding it. So this issues a REAL token against a REAL batch and asserts rows
 * come back — the one check that would have caught it.
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

// A batch that actually has sent pickups. Chosen from the data rather than
// hardcoded, so this keeps working as books come and go.
const { data: candidates, error: cErr } = await admin
  .from("pickups")
  .select("card_id, chapter, assigned_narrator_id")
  .eq("status", "sent")
  .not("assigned_narrator_id", "is", null)
  .limit(1);
if (cErr) {
  console.error(`could not read pickups: ${cErr.message}`);
  process.exit(2);
}
if (!candidates?.length) {
  // NOT a pass. With no sent pickups there is nothing to prove, and reporting
  // success would be the same shape of lie this script exists to catch.
  console.log("  no sent pickups exist — this check could not run.");
  process.exit(0);
}

const batch = candidates[0];
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
  // Issuing revokes the batch's previous link, so the one minted here is
  // revoked too — leaving no live token behind that was not emailed to anybody.
  if (token) {
    await admin.from("pickup_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("card_id", batch.card_id)
      .eq("chapter", batch.chapter)
      .eq("narrator_id", batch.assigned_narrator_id)
      .is("revoked_at", null);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
