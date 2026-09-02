import {
  chapterDir, chapterMatches, isAudioFile, manifestName, sanitiseSegment,
} from "./paths.ts";
import { diffPickup } from "./diff.ts";

/**
 * Send a chapter's pickups to their narrators, and file the manifest.
 *
 * A SUPABASE EDGE FUNCTION AND NOT A NEXT.JS ROUTE, deliberately. The Android
 * app can call this today with the user's existing JWT; the website will call
 * the same function after the auth migration with no change. A Next.js route
 * would need site auth that does not exist yet, and building it twice is how the
 * two ends drift.
 *
 * ── THE ORDER IS THE WHOLE POINT ────────────────────────────────────────────
 *
 *   0. REFUSE if a clip was on offer and its source file is not yet visible
 *   1. verify the caller is admin or editor
 *   2. gather the chapter's DRAFT pickups, grouped by narrator
 *   3. send one email per narrator
 *   4. ONLY on acceptance, move those narrators' pickups to SENT
 *   5. file the manifest — and a failure here does NOT undo step 4
 *   6. (clips are cut by the sweep, not here — see the gate at step 0)
 *
 * If the transition ran first and the send failed, pickups would read as SENT
 * with nobody told: invisible, and the exact failure shape this project keeps
 * finding. Steps 4 and 5 fail in OPPOSITE directions on purpose — a failed email
 * must leave everything DRAFT, and a failed manifest must leave everything SENT.
 *
 * ── ENVIRONMENT ─────────────────────────────────────────────────────────────
 *
 * PICKUPS_RESEND_API_KEY, PICKUPS_FROM_ADDRESS
 * PICKUPS_GRAPH_TENANT_ID, PICKUPS_GRAPH_CLIENT_ID, PICKUPS_GRAPH_CLIENT_SECRET
 *
 * NOTHING HERE READS RESEND_API_KEY, RESEND_FROM_EMAIL OR MICROSOFT_*. Those
 * belong to notify-payment.ts and the mailbox OAuth, and sharing them would mean
 * one rotation silently breaking an unrelated feature.
 *
 * AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET ARE AVOIDED BY NAME.
 * @azure/identity is a dependency of the site, and its EnvironmentCredential —
 * first in DefaultAzureCredential's chain — reads exactly those three
 * automatically. Nothing imports it today; one import would make it live,
 * silently, as the wrong application.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** App-only Graph has no "me". The drive is addressed by user principal name. */
const DRIVE_USER = "Dean@DMNarration.com";

/** Where the narrator's tokenised page lives. */
const SITE_ORIGIN = Deno.env.get("PICKUPS_SITE_ORIGIN") ?? "https://www.dmnarration.com";

// ── path sanitisation ───────────────────────────────────────────────────────

/**
 * OneDrive/SharePoint forbid  " * : < > ? / \ |  in a name, plus leading and
 * trailing spaces and trailing periods.
 *
 * THE MAPPING IS FIXED AND MUST NOT DRIFT: every forbidden character becomes a
 * hyphen, runs of whitespace collapse to one space, then trim, then strip
 * trailing periods. A mapping that changes produces a SECOND folder for the same
 * book, with half the manifests in each — which is why the result is also
 * recorded on the card in `pickups_folder` and reused rather than recomputed.
 *
 * Two of Dean's titles contain a colon. Observed against the live API: an
 * unsanitised colon fails with
 *   400 BadRequest "Resource not found for the segment 'root:'"
 * which reads like a bad path rather than a bad character, and is exactly the
 * kind of error someone loses an afternoon to.
 */

// ── the message ─────────────────────────────────────────────────────────────

type Pickup = {
  id: string;
  chapter: string;
  timestamp_at: string;
  kind: string;
  said: string;
  should_be: string;
  note: string;
  /** What sort of noise, for kind = "noise". Null otherwise. */
  noise_type: string | null;
};

/**
 * "mouth_click" -> "Mouth click".
 *
 * NO SHARED LIST AND NO TWIN. The database values are already the words once
 * the underscore is a space, so this needs nothing kept in step with
 * src/lib/noise-types.ts — unlike paths.ts and diff.ts, which do. A list that
 * does not have to exist is the one that cannot drift.
 */
function noiseLabel(v: string | null): string {
  if (!v) return "";
  const words = v.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * ONE PICKUP, BROKEN INTO ITS PARTS — the single source for all three renderings.
 *
 * THE MANIFEST AND THE EMAIL ARE MEANT TO AGREE. The manifest is the narrator's
 * work order and the email is the same instruction in her inbox; if the two can
 * disagree about what was asked for, one of them is lying and nothing on either
 * says which. So a change to what a pickup SAYS is made here, once, and the
 * plain text, the HTML and the manifest all compose from it.
 *
 * A richer HTML layout must NEVER fork this into a second description.
 */
function pickupParts(p: Pickup): { when: string; kind: string; detail: string; extra: string } {
  return {
    when: p.timestamp_at?.trim() ? p.timestamp_at.trim() : "no timestamp",
    kind: p.kind,
    detail: p.kind === "misread"
      ? `said "${p.said}" \u2014 should be "${p.should_be}"`
      // NOISE SAYS WHICH KIND. It is the whole reason the field exists: Ann
      // acts differently on a plosive than on a chair bump, and the email and
      // the manifest are where she reads it. describe() feeds both.
      : p.kind === "noise" && p.noise_type
        ? `${noiseLabel(p.noise_type)}${p.note?.trim() ? ` \u2014 ${p.note.trim()}` : ""}`
        : (p.note?.trim() || "(no note)"),
    extra: p.kind === "misread" && p.note?.trim() ? p.note.trim() : "",
  };
}

/**
 * The correction as EMAIL HTML, with the changed words marked.
 *
 * ── THE PLAIN TEXT DELIBERATELY DOES NOT GET THIS ──────────────────────────
 *
 * plainBody stays the sentence it already was. There is no honest way to mark a
 * word in plain text — asterisks and CAPS both read as emphasis rather than as
 * "this is the difference" — and inventing a convention she has never been
 * taught would be worse than the two full versions she already gets. The HTML
 * gains a SIGNAL, not information: every word appears in both renderings.
 *
 * ── INLINE STYLES, LIKE EVERYTHING ELSE IN THIS FILE ───────────────────────
 *
 * Gmail strips a <style> block and Outlook renders through Word. <s> and <u>
 * are ancient HTML that survive both, and text-decoration is set inline as well
 * so a client that drops the tags' default styling still shows the mark.
 */
function correctionHtml(p: Pickup): string {
  const d = diffPickup(p.said ?? "", p.should_be ?? "");
  const mark = (
    tokens: { text: string; changed: boolean }[],
    tag: "s" | "u",
    decoration: string,
  ) =>
    tokens
      .map(t =>
        t.changed
          ? `<${tag} style="text-decoration:${decoration};">${esc(t.text)}</${tag}>`
          : esc(t.text),
      )
      .join(" ");

  const said = mark(d.said, "s", "line-through");
  const should = mark(d.shouldBe, "u", "underline");
  return (
    `<span style="color:#8b93a7;">said</span> ` +
    `<span style="color:#c4c9d6;">\u201c${said}\u201d</span><br />` +
    `<span style="color:#8b93a7;">should be</span> ` +
    `<span style="color:#ffffff;font-weight:bold;">\u201c${should}\u201d</span>`
  );
}

/** The one-line form, used by the plain text AND the manifest. */
function describe(p: Pickup): string {
  const { when, kind, detail, extra } = pickupParts(p);
  return `${when} \u00b7 ${kind} \u00b7 ${detail}${extra ? ` (${extra})` : ""}`;
}

const esc = (t: string) =>
  (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Brand, matching the site and the page this link lands on. */
const NAVY = "#06082E";
const PANEL = "#0A0D3A";
const GOLD = "#D4AF37";

/**
 * The logo, as an absolute hosted URL.
 *
 * The site already serves this publicly at /logo-mark.png and it is the same
 * asset LOGO_URL points at for the contract PDF, so it is reused rather than
 * copied into R2: a second copy is a second thing to keep in step, and a logo
 * that disagrees with the site is worse than one served from it. (Putting brand
 * assets in the world-readable media bucket would also be fine — that bucket
 * being public is correct for a logo and is not in tension with the R2 finding
 * on pickup_uploads, which is about unreleased AUDIO.)
 */
const LOGO = "https://www.dmnarration.com/logo-mark.png";

/**
 * THE PLAIN-TEXT ALTERNATIVE, and it stays accurate.
 *
 * Several spam filters read this rather than the HTML, and it is what anyone
 * reading in plain text actually gets. If the HTML ever gains information this
 * lacks, THIS IS NOW WRONG — they are two renderings of one message, not a real
 * version and a courtesy copy.
 */
function plainBody(
  book: string, chapter: string, narrator: string, rows: Pickup[], link: string,
): string {
  return [
    `${book} — chapter ${chapter}`,
    `Pickups for ${narrator}`,
    "",
    ...rows.map((p, i) => `${i + 1}. ${describe(p)}`),
    "",
    `${rows.length} pickup${rows.length === 1 ? "" : "s"}.`,
    "",
    "Open this to see them and mark them re-recorded when the audio is done:",
    link,
    "",
    "Reply to this email if anything is unclear.",
  ].join("\n");
}

/**
 * TABLES AND INLINE STYLES ONLY.
 *
 * Email is a hostile rendering target: Gmail strips much of a <style> block and
 * Outlook on Windows renders through Word, which has neither flexbox nor grid.
 * A naive modern layout here looks WORSE than the plain version, not better. So
 * nested tables, 600px, inline styles, and background colours on CELLS rather
 * than on <body>, which several clients drop entirely.
 *
 * THE BUTTON IS TEXT, NOT AN IMAGE: a padded <a> on a coloured table cell. An
 * image-only button disappears for anyone with images blocked — the default in
 * several clients — and that button is the only thing in this email that
 * matters. Outlook VML for its background was considered and left out: every
 * current narrator address is Gmail or a small business domain, and the
 * fallback there is a perfectly usable gold cell with a dark label.
 */
function htmlBody(
  book: string, chapter: string, narrator: string, rows: Pickup[], link: string,
): string {
  const n = rows.length;

  // Gmail shows this beside the subject. Left alone it repeats the book title,
  // which the subject already carried — so it says something useful instead.
  const preheader =
    `${n} pickup${n === 1 ? "" : "s"} to re-record \u2014 open to see the timestamps.`;

  const items = rows
    .map(p => {
      const { when, kind, detail, extra } = pickupParts(p);
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #1A2070;">
          <span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:14px;font-weight:bold;color:${GOLD};background-color:#141A4A;padding:3px 8px;border-radius:4px;">${esc(when)}</span>
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8b93a7;padding-left:8px;text-transform:uppercase;letter-spacing:1px;">${esc(kind)}</span>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#e8ebf2;padding-top:8px;">${p.kind === "misread" ? correctionHtml(p) : esc(detail)}</div>
          ${extra ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8b93a7;padding-top:4px;">${esc(extra)}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(book)}</title>
</head>
<body style="margin:0;padding:0;background-color:${NAVY};">
<span style="display:none !important;font-size:1px;color:${NAVY};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NAVY};">
  <tr>
    <td align="center" style="background-color:${NAVY};padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <tr>
          <td align="center" style="padding:4px 0 20px 0;">
            <img src="${LOGO}" width="56" height="56" alt="Dean Miller Narration" style="display:block;border:0;outline:none;text-decoration:none;width:56px;height:56px;" />
          </td>
        </tr>

        <tr>
          <td style="background-color:${PANEL};border:1px solid #1A2070;border-radius:12px;padding:24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${GOLD};">Pickups for ${esc(narrator)}</p>
            <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:#ffffff;font-weight:normal;">${esc(book)}</h1>
            <p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:#c4c9d6;">Chapter ${esc(chapter)}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
              ${items}
            </table>

            <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#c4c9d6;">
              ${n} pickup${n === 1 ? "" : "s"} in total.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0 auto;">
              <tr>
                <td align="center" bgcolor="${GOLD}" style="background-color:${GOLD};border-radius:8px;">
                  <a href="${esc(link)}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#06082E;text-decoration:none;border-radius:8px;">Open your pickups</a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8b93a7;">
              Or paste this into your browser:<br />
              <span style="color:#c4c9d6;word-break:break-all;">${esc(link)}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:18px 8px 0 8px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5f6478;">Reply to this email if anything is unclear.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body></html>`;
}

/**
 * The manifest, written at SEND time and not at resolve.
 *
 * It is the narrator's work order: it should exist when the email arrives and
 * say the same thing. Plain text because this runs on Deno and the site's PDF
 * libraries are Node-only; PDF becomes an option once the web migration provides
 * a Node route. E5 puts their audio beside it.
 */
function manifestText(
  book: string,
  chapter: string,
  narrator: string,
  sentAt: string,
  rows: Pickup[],
): string {
  return [
    `Book:     ${book}`,
    `Chapter:  ${chapter}`,
    `Narrator: ${narrator}`,
    `Sent:     ${sentAt}`,
    "",
    ...rows.map((p, i) => `${i + 1}. ${describe(p)}`),
    "",
    `${rows.length} pickup${rows.length === 1 ? "" : "s"}.`,
  ].join("\n");
}

// ── Microsoft Graph, app-only ───────────────────────────────────────────────

/**
 * DO NOT REUSE graphToken() from src/lib/microsoft-graph.ts.
 *
 * That one is DELEGATED: a stored refresh token, scope "Mail.Read
 * offline_access", calling /me/. It has no file permission and no drive scope,
 * and reusing it fails with an error that looks like a bad path rather than a
 * wrong credential — the same disguise the colon wears.
 *
 * This is APP-ONLY: client_credentials, scope .default, and no "me".
 */
async function graphAppToken(): Promise<string> {
  const tenant = Deno.env.get("PICKUPS_GRAPH_TENANT_ID");
  const client = Deno.env.get("PICKUPS_GRAPH_CLIENT_ID");
  const secret = Deno.env.get("PICKUPS_GRAPH_CLIENT_SECRET");
  if (!tenant || !client || !secret) throw new Error("PICKUPS_GRAPH_* not configured");

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Graph token ${res.status}: ${json.error_description ?? json.error ?? ""}`);
  return json.access_token as string;
}

/**
 * Upload the manifest.
 *
 * VERIFIED AGAINST THE LIVE API rather than assumed: a PUT to a path whose
 * parent folders do not exist returns 201 and CREATES them. So nothing here
 * pre-creates the tree — if that behaviour ever changes, this is the line that
 * would need it, and the observation is recorded so the next person knows which
 * way it was.
 */
async function uploadManifest(
  token: string,
  /** The full chapter folder, from chapterDir — book, narrator and chapter. */
  folder: string,
  fileName: string,
  body: string,
): Promise<string> {
  const path = `${folder}/${fileName}`;
  const url =
    `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive/root:/${encodeURI(path)}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Graph upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return path;
}

// ── the handler ─────────────────────────────────────────────────────────────

/**
 * CORS, because the WEBSITE now calls this and a browser asks first.
 *
 * The Android app never needed it — native HTTP sends no preflight — so this
 * function answered OPTIONS with 405 and the browser refused to make the real
 * request at all. From the page that looks like "Failed to send a request to the
 * Edge Function", which names the symptom and not the cause; the function itself
 * was healthy the whole time and answered Node calls correctly.
 *
 * `*` is right here and is not a weakening: this endpoint authenticates with an
 * Authorization header, never a cookie, so a hostile page gains nothing by being
 * allowed to ask — it still has no token to send. CORS is not the boundary;
 * verify_jwt and assert_editor_access are.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Two clients, on purpose.
  //
  // userClient carries the CALLER's JWT: it is what the gate is checked against,
  // and what performs the draft-to-sent transition — send_chapter_pickups scopes
  // to auth.uid(), so doing it as the service role would match nothing.
  //
  // adminClient reads narrator EMAIL, which the editor is deliberately not
  // allowed to see, and writes manifest_path.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let cardId: string, chapter: string;
  try {
    const body = await req.json();
    cardId = String(body.cardId ?? "");
    chapter = String(body.chapter ?? "").trim();
    if (!cardId || !chapter) return json({ error: "cardId and chapter are required" }, 400);
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // ---- 1. the caller is admin or editor -----------------------------------
  //
  // Asked of the DATABASE rather than decided here: assert_editor_access is the
  // same gate every other editor path uses, so there is one answer to "may she"
  // and not two that can drift.
  const { error: gateError } = await userClient.rpc("assert_editor_access");
  if (gateError) {
    return json({ error: "Not permitted", detail: gateError.message }, 403);
  }
  const { data: userData } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ error: "No user on that token" }, 401);

  // ---- 2. gather --------------------------------------------------------
  const { data: card, error: cardError } = await adminClient
    .from("board_cards")
    .select("id, title, pickups_folder, audio_folder_item_id")
    .eq("id", cardId)
    .single();
  if (cardError || !card) return json({ error: "No such book" }, 404);

  /*
    ── STEP 0, BEFORE ANY EMAIL LEAVES ──────────────────────────────────────

    Checked here rather than after the drafts are gathered, so a refusal costs
    nothing and changes nothing. See clipSourceMissing for why this reverses
    "a clip never blocks a send".
  */
  /*
    THE WHOLE GATE IS INSIDE A try. A GATE THAT CRASHES IS WORSE THAN NO GATE.

    The first version of this threw a ReferenceError — one missing name in an
    import — and every send on a book with a source folder returned 500. That is
    strictly worse than the missing clips it was added to prevent: it stopped
    the work rather than degrading it.

    So the only outcome this block can produce, other than a deliberate 409, is
    to fall through and let the send proceed. Refusing is a decision; failing is
    not a reason to refuse.
  */
  if (card.audio_folder_item_id) {
    let blockedChapter = false;
    try {
      const gateToken = await graphAppToken();
      blockedChapter = await clipSourceMissing(gateToken, card.audio_folder_item_id, chapter);
    } catch (e) {
      console.error(`clip gate could not run, allowing the send: ${String(e).slice(0, 200)}`);
      blockedChapter = false;
    }
    if (blockedChapter) {
      return json({
        error:
          `Chapter ${chapter} isn't in OneDrive yet. It may still be uploading — ` +
          `try again in a minute.`,
        blocked: "clip_source_missing",
        chapter,
      }, 409);
    }
  }

  const { data: drafts, error: draftError } = await adminClient
    .from("pickups")
    .select("id, chapter, timestamp_at, kind, said, should_be, note, noise_type, assigned_narrator_id")
    .eq("card_id", cardId)
    .eq("chapter", chapter)
    .eq("status", "draft")
    .eq("created_by", callerId)
    .order("created_at");
  if (draftError) return json({ error: draftError.message }, 500);
  if (!drafts || drafts.length === 0) {
    return json({ error: "There are no drafts of yours to send for that chapter." }, 400);
  }

  const narratorIds = [...new Set(drafts.map(d => d.assigned_narrator_id).filter(Boolean))];
  const { data: narrators } = await adminClient
    .from("narrators")
    .select("id, display_name, email")
    .in("id", narratorIds.length > 0 ? narratorIds : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((narrators ?? []).map(n => [n.id, n]));

  // Grouped by narrator. Anything with no narrator at all is its own report
  // line: unassigned is not the same as unreachable, and neither is silent.
  const groups = new Map<string, Pickup[]>();
  const unassigned: Pickup[] = [];
  for (const d of drafts) {
    if (!d.assigned_narrator_id) unassigned.push(d as Pickup);
    else {
      const list = groups.get(d.assigned_narrator_id) ?? [];
      list.push(d as Pickup);
      groups.set(d.assigned_narrator_id, list);
    }
  }

  const emailed: Array<{ narrator: string; count: number }> = [];
  const skipped: Array<{ narrator: string; count: number; reason: string }> = [];
  const failed: Array<{ narrator: string; count: number; reason: string }> = [];
  const sentNarratorIds: string[] = [];

  if (unassigned.length > 0) {
    skipped.push({
      narrator: "(nobody assigned)",
      count: unassigned.length,
      reason: "no narrator assigned",
    });
  }

  const resendKey = Deno.env.get("PICKUPS_RESEND_API_KEY");
  const fromAddress = Deno.env.get("PICKUPS_FROM_ADDRESS");
  if (!resendKey || !fromAddress) {
    return json({ error: "PICKUPS_RESEND_API_KEY and PICKUPS_FROM_ADDRESS are not configured" }, 500);
  }

  // ---- 3. send ----------------------------------------------------------
  for (const [narratorId, rows] of groups) {
    const narrator = byId.get(narratorId);
    const name = narrator?.display_name ?? "(unknown narrator)";

    // SKIP AND REPORT, never silently drop. No address on file is a fact about
    // the narrator record, and the only useful response is to say so.
    if (!narrator?.email) {
      skipped.push({ narrator: name, count: rows.length, reason: "no email address on file" });
      continue;
    }

    // ONE LINK PER BATCH, minted just before the email that carries it.
    //
    // issue_pickup_link revokes any live link for the same batch first, so a
    // re-send kills the previous email's URL instead of leaving two live doors.
    // The raw token exists ONLY in this variable and in the email body: it is
    // never logged, never put in this function's JSON response, and never in an
    // error message. A failure here skips the narrator rather than sending an
    // email with no way to act on it.
    let link: string;
    try {
      const { data: token, error: linkError } = await adminClient.rpc("issue_pickup_link", {
        p_card_id: cardId,
        p_chapter: chapter,
        p_narrator_id: narratorId,
      });
      if (linkError || !token) throw new Error(linkError?.message ?? "no token returned");
      link = `${SITE_ORIGIN}/p/${token}`;
    } catch (e) {
      failed.push({
        narrator: name,
        count: rows.length,
        // The MESSAGE, never the token.
        reason: `could not issue a link: ${String(e).slice(0, 150)}`,
      });
      continue;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [narrator.email],
          // Reply-to is the pickups address, which Dean has confirmed reaches him.
          reply_to: fromAddress,
          subject: `${card.title} — chapter ${chapter} pickups`,
          // BOTH parts. These are read on phones in booths, where a text part is
          // not a fallback so much as the thing that actually renders.
          text: plainBody(card.title, chapter, name, rows, link),
          html: htmlBody(card.title, chapter, name, rows, link),
        }),
      });
      if (!res.ok) {
        failed.push({
          narrator: name,
          count: rows.length,
          reason: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`,
        });
        continue;
      }
      emailed.push({ narrator: name, count: rows.length });
      sentNarratorIds.push(narratorId);
    } catch (e) {
      failed.push({ narrator: name, count: rows.length, reason: String(e).slice(0, 200) });
    }
  }

  // ---- 4. ONLY NOW, move to sent ----------------------------------------
  //
  // Scoped to the narrators actually emailed. A skipped narrator's pickups stay
  // DRAFT — marking them sent would be the original failure one level down.
  let moved = 0;
  if (sentNarratorIds.length > 0) {
    const { data: n, error: sendError } = await userClient.rpc("send_chapter_pickups", {
      p_card_id: cardId,
      p_chapter: chapter,
      p_narrator_ids: sentNarratorIds,
    });
    if (sendError) {
      // The emails ARE out. Say so loudly rather than pretending nothing
      // happened: the narrators have been told and the records disagree.
      return json({
        error: "Emails were sent but the pickups could not be marked sent.",
        detail: sendError.message,
        emailed, skipped, failed,
        warning: "These pickups are still DRAFT and re-sending would email twice.",
      }, 500);
    }
    moved = (n as number) ?? 0;
  }

  // ---- 5. file the manifest ---------------------------------------------
  //
  // A FAILURE HERE MUST NOT UNDO THE SEND. The email is the delivery; the
  // manifest is the record. manifest_path stays null, which is visible and
  // retryable rather than a silent gap.
  const manifests: Array<{ narrator: string; path?: string; error?: string }> = [];
  if (emailed.length > 0) {
    const bookSegment = card.pickups_folder ?? sanitiseSegment(card.title);
    // Recorded on first use so the same book always resolves to the same folder,
    // even if the title is edited later.
    if (!card.pickups_folder) {
      await adminClient.from("board_cards").update({ pickups_folder: bookSegment }).eq("id", cardId);
    }

    let token: string | null = null;
    try {
      token = await graphAppToken();
    } catch (e) {
      manifests.push({ narrator: "(all)", error: `token: ${String(e).slice(0, 200)}` });
    }

    if (token) {
      const sentAt = new Date().toISOString();
      for (const narratorId of sentNarratorIds) {
        const narrator = byId.get(narratorId);
        const name = narrator?.display_name ?? "unknown";
        const rows = groups.get(narratorId) ?? [];
        try {
          // The chapter is a FOLDER now, not a filename prefix — so a
          // narrator folder holds one entry per chapter instead of a flat list
          // of every manifest, clip and take across the whole book.
          const path = await uploadManifest(
            token,
            chapterDir(bookSegment, name, chapter),
            manifestName(),
            manifestText(card.title, chapter, name, sentAt, rows),
          );
          await adminClient
            .from("pickups")
            .update({ manifest_path: path })
            .in("id", rows.map(r => r.id));
          manifests.push({ narrator: name, path });
        } catch (e) {
          manifests.push({ narrator: name, error: String(e).slice(0, 200) });
        }

      }
    }
  }

  return json({
    book: card.title,
    chapter,
    moved,
    emailed,
    skipped,
    failed,
    manifests,
  }, failed.length > 0 ? 207 : 200);
});


/**
 * ── STEP 0: REFUSE A SEND WHOSE CLIP SOURCE IS NOT THERE YET ───────────────
 *
 * THIS REVERSES A STATED RULE, and the reversal is the point of this comment.
 *
 * "A missing clip must never block a send" was written deliberately, and it was
 * right when a clip was a bonus. It is wrong now, and the measurements are why:
 *
 *   ch 23 -> Ann   sent 01:22:21   source visible 01:31:08   9 min late
 *   ch  5 -> Ann   sent 03:08:26   source visible 03:09:38   72 sec late
 *   ch  6 -> both  sent 04:57:49   source visible 04:57:38   11 sec in time
 *
 * Chapter 6 is the only batch that got clips, and it won by eleven seconds.
 * Everything else lost them permanently, because cutting happened once. A
 * pickup sent without its clip is a worse pickup — the narrator works from text
 * alone — and ninety seconds of waiting is cheaper than that.
 *
 * ── IT BLOCKS ONLY WHEN A CLIP WAS GENUINELY ON OFFER ─────────────────────
 *
 * TWENTY-TWO OF THIRTY-THREE CARDS HAVE NO CHAPTER DATA AT ALL. A gate that
 * cannot tell "still uploading" from "never set up for clips" would make two
 * thirds of the catalogue unsendable, which is far worse than a missing clip.
 * So: no audio_folder_item_id, no gate.
 *
 * And it blocks only on ABSENCE. not_wav, unreadable_header and
 * ambiguous_chapter_match are all real problems, and none of them is fixed by
 * waiting a minute — refusing on those would trap her with no way forward.
 *
 * VISIBILITY IS ASKED OF GRAPH, not of a stored path: the question is whether
 * the API can read the file NOW, which is exactly what the cutter will need.
 */
async function clipSourceMissing(
  token: string,
  audioFolderItemId: string | null,
  chapter: string,
): Promise<boolean> {
  // Clips were never on offer for this book.
  if (!audioFolderItemId) return false;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive/items/${audioFolderItemId}` +
      `/children?$top=400&$select=name,file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  // A LOOKUP THAT FAILED IS NOT AN ABSENT FILE. Refusing the send because Graph
  // was briefly unreachable would block work over a network blip; the sweep
  // retries the clip either way.
  if (!res.ok) return false;

  const children = ((await res.json()).value ?? []) as Array<{ name?: string; file?: unknown }>;
  return !children.some(
    c => c.file && isAudioFile(String(c.name ?? "")) && chapterMatches(String(c.name ?? ""), chapter),
  );
}

function json(body: unknown, status = 200): Response {
  // CORS on EVERY response, not just the happy one. Without it the browser can
  // see that a request failed but not why, and the reason is the useful part —
  // it is how the missing PICKUPS_RESEND_API_KEY reaches the screen as a
  // sentence instead of as "non-2xx status code".
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
