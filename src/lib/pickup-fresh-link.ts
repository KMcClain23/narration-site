import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * A REPLACEMENT LINK for pickups a narrator already has. Not a send.
 *
 * ── THE PROMISE THIS MAKES TRUE ────────────────────────────────────────────
 *
 * The expired page told visitors to "reply to the last one and a fresh link
 * will be sent", and nothing in the system could send one. `issue_pickup_link`
 * is service_role-only and was reachable from exactly one place — the Edge
 * Function, during a send — so the only way to honour that sentence was to send
 * the whole chapter again, which moves pickup state, re-files the manifest and
 * re-cuts clips. Nobody was going to do that to answer "my link stopped
 * working", so the page was promising something that did not exist.
 *
 * ── IT MUST NOT BECOME A SECOND SEND PATH ──────────────────────────────────
 *
 * This issues a token and sends one email. It does not touch `pickups`, does
 * not write a manifest, does not cut a clip, does not fire the returned
 * notification. The only write it causes is inside `issue_pickup_link`: one new
 * `pickup_links` row, and `revoked_at` set on the batch's previous link.
 *
 * Two guards keep it that way, and they are HERE rather than in the UI:
 *
 *   1. A LINK MUST ALREADY EXIST for the batch. Without that check this would
 *      mint a FIRST link for a chapter nobody has been told about, and email a
 *      narrator corrections she has never seen — a send, by another name.
 *   2. THE BATCH MUST HAVE ROWS the token would open. `pickup_batch_by_token`
 *      returns 'sent' and 'returned' only, so a fully resolved batch would get
 *      a working token that renders as "this link has expired" — which is the
 *      exact complaint being answered.
 *
 * ── THE COST OF THE REVOKE, STATED PLAINLY ─────────────────────────────────
 *
 * `issue_pickup_link` revokes the previous link BEFORE returning the new token.
 * That is the behaviour we want: two live doors for one batch means the
 * superseded email keeps working and nobody can say which one a visitor used.
 * But it also means a failure AFTER the mint leaves the narrator with no link
 * at all, which is worse than what she started with.
 *
 * So everything checkable is checked BEFORE the mint — the sender's
 * configuration, her address, the batch, its rows — and the one failure that
 * cannot be checked in advance (Resend refusing the message) is reported as
 * what it is, in a message that says the old link is already gone. It is not
 * flattened into a generic error, because the person reading it has to know to
 * press the button again.
 */

export type FreshLinkOutcome =
  | { sent: true; narrator: string; email: string }
  /** Nothing was minted. The previous link, if any, is untouched. */
  | { sent: false; refused: string }
  /** Minted, then the email failed. The previous link is GONE. */
  | { sent: false; failed: string; previousLinkRevoked: true };

type Batch = {
  card_id: string;
  chapter: string;
  narrator_id: string;
  narrator_name: string;
  has_email: boolean;
  open_count: number;
  returned_count: number;
  last_link_at: string | null;
  link_live: boolean;
};

const esc = (t: string) =>
  (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function chapterLabel(chapter: string): string {
  const c = (chapter ?? "").trim();
  return /^\d/.test(c) ? `chapter ${c}` : c || "a chapter";
}

/* The pickup email's palette, so this is recognisably from the same sender. */
const NAVY = "#06082E";
const PANEL = "#0A0D3A";
const GOLD = "#D4AF37";

/**
 * DELIBERATELY UNLIKE THE PICKUP EMAIL, and the difference has to survive a
 * three-second glance rather than a careful read.
 *
 * If this looks like the original, Ann concludes there are new corrections and
 * goes hunting for them. That is a worse outcome than the broken link: she
 * loses an hour looking for work that does not exist, and then distrusts the
 * next real send.
 *
 * The pickup email opens with a gold "Pickups for Ann" eyebrow over the book
 * title, lists every correction with its timestamp, states a total, and closes
 * on a solid gold button. Against that:
 *
 *   - NO LIST. Not one correction is reproduced. That is the strongest signal
 *     available and it is also the instruction: this email carries a link.
 *   - NO COUNT, anywhere. A number reads as a tally of work however it is
 *     wrapped, and "the same 6" is still a 6 on the screen.
 *   - The heading is a sentence — "Here is a new link" — not the book's title.
 *     The subject of this email is the link; the book is a subtitle.
 *   - "Nothing new has been added" is stated outright rather than implied, and
 *     sits above the button where it cannot be scrolled past.
 *   - The button is an outline, not the solid gold block. It still says "Open
 *     your pickups", because it goes to the identical page and inventing a
 *     different name for it would be its own confusion.
 *   - No logo lockup; a plain sender line at the foot instead.
 */
function bodies(book: string, chapter: string, narrator: string, link: string) {
  const ch = chapterLabel(chapter);
  const preheader = "A replacement link — the same pickups, nothing new.";

  const text = [
    `Hello ${narrator},`,
    "",
    `Your link for ${book}, ${ch} had stopped working, so here is a new one:`,
    "",
    link,
    "",
    "It opens the same pickups you already had. Nothing new has been added, and",
    "there is nothing here you have not already been asked for.",
    "",
    "The previous link no longer works.",
    "",
    "Reply to this email if anything is unclear.",
  ].join("\n");

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>A new link</title>
</head>
<body style="margin:0;padding:0;background-color:${NAVY};">
<span style="display:none !important;font-size:1px;color:${NAVY};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NAVY};">
  <tr>
    <td align="center" style="background-color:${NAVY};padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <tr>
          <td style="background-color:${PANEL};border:1px solid #1A2070;border-radius:12px;padding:24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8b93a7;">Replacement link</p>
            <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;color:#ffffff;font-weight:normal;">Here is a new link, ${esc(narrator)}</h1>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#c4c9d6;">${esc(book)} &middot; ${esc(ch)}</p>

            <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#c4c9d6;">
              Your old link had stopped working. This one opens the same pickups you already had &mdash;
              <strong style="color:#ffffff;">nothing new has been added</strong>, and there is nothing here you have not already been asked for.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0 auto;">
              <tr>
                <td align="center" style="border:1px solid ${GOLD};border-radius:8px;">
                  <a href="${esc(link)}" style="display:inline-block;padding:12px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${GOLD};text-decoration:none;border-radius:8px;">Open your pickups</a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8b93a7;">
              Or paste this into your browser:<br />
              <span style="color:#c4c9d6;word-break:break-all;">${esc(link)}</span>
            </p>

            <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5f6478;">
              The previous link no longer works.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:18px 8px 0 8px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5f6478;">Dean Miller Narration &middot; reply to this email if anything is unclear.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body></html>`;

  return { text, html };
}

/**
 * Mint a replacement token for one existing batch and email only that link.
 *
 * Never throws. Every outcome is a value, because the caller is a route that has
 * to tell a person on a screen what happened.
 */
export async function sendFreshLink(
  cardId: string,
  chapter: string,
  narratorId: string,
): Promise<FreshLinkOutcome> {
  try {
    /* ── EVERYTHING CHECKABLE, BEFORE THE MINT ─────────────────────────────
       Once issue_pickup_link runs the old link is gone. Each check below is in
       this order for that reason alone. */

    const key = process.env.PICKUPS_RESEND_API_KEY;
    const from = process.env.PICKUPS_FROM_ADDRESS;
    if (!key || !from) {
      return { sent: false, refused: "The pickup sender is not configured on this deployment." };
    }

    // GUARD 1: the batch must already have had a link. This is the line between
    // replacing a link and sending pickups, and the UI's version of it is not
    // trusted — a stale page could offer the button for a batch that has none.
    const { data: batchRows, error: bErr } = await supabaseAdmin.rpc("pickup_batches_for_editor");
    if (bErr) return { sent: false, refused: `Could not read the batch: ${bErr.message}` };
    const batch = ((batchRows ?? []) as Batch[]).find(
      b => b.card_id === cardId && b.chapter === chapter && b.narrator_id === narratorId,
    );
    if (!batch) {
      return {
        sent: false,
        refused:
          "No link has ever been sent for that chapter and narrator, so there is none to " +
          "replace. Send the chapter instead.",
      };
    }

    // GUARD 2: a token that opens nothing is worse than no token.
    if (batch.open_count + batch.returned_count === 0) {
      return {
        sent: false,
        refused:
          `Every pickup in ${chapterLabel(chapter)} has been closed, so a new link would open ` +
          "an empty page.",
      };
    }

    if (!batch.has_email) {
      return { sent: false, refused: `${batch.narrator_name} has no email address on file.` };
    }

    // The address itself, read with the service key. It reaches the browser only
    // in the confirmation — whoever pressed the button is entitled to know where
    // the email went, and nowhere else does.
    const { data: narratorRow, error: nErr } = await supabaseAdmin
      .from("narrators")
      .select("display_name, email")
      .eq("id", narratorId)
      .maybeSingle();
    if (nErr) return { sent: false, refused: `Could not read the narrator: ${nErr.message}` };
    const email = (narratorRow?.email ?? "").trim();
    const narrator = narratorRow?.display_name ?? batch.narrator_name;
    if (!email) return { sent: false, refused: `${narrator} has no email address on file.` };

    const { data: cardRow } = await supabaseAdmin
      .from("board_cards")
      .select("title")
      .eq("id", cardId)
      .maybeSingle();
    const book = cardRow?.title ?? "your book";

    /* ── PAST THIS POINT THE OLD LINK IS GONE ──────────────────────────────── */

    const { data: token, error: lErr } = await supabaseAdmin.rpc("issue_pickup_link", {
      p_card_id: cardId,
      p_chapter: chapter,
      p_narrator_id: narratorId,
    });
    // A FAILED MINT REVOKES NOTHING. The update and the insert are one function
    // call, so it either committed or it did not — which is why this is a plain
    // refusal and not the previousLinkRevoked shape.
    if (lErr || !token) {
      return { sent: false, refused: `Could not issue a link: ${lErr?.message ?? "no token"}` };
    }

    const origin = process.env.PICKUPS_SITE_ORIGIN ?? "https://www.dmnarration.com";
    const link = `${origin}/p/${token}`;
    const { text, html } = bodies(book, chapter, narrator, link);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: from,
        // NOT "{book} — chapter {n} pickups", which is the send's subject. Her
        // inbox holds a thread of those; this must not arrive looking like the
        // next one in the series.
        //
        // THE PURPOSE LEADS, the book follows. A mail list truncates around 40
        // characters, and "A new link for your pickups — A Cowbo…" is already
        // unambiguous at that width, where any subject opening with the title
        // would still be indistinguishable from a send.
        subject: `A new link for your pickups — ${book}, ${chapterLabel(chapter)}`,
        text,
        html,
      }),
    });

    if (!res.ok) {
      // The raw token is never logged, here or anywhere — see pickup-link.ts.
      const detail = (await res.text()).slice(0, 200);
      console.error(`fresh pickup link: Resend ${res.status} ${detail}`);
      return {
        sent: false,
        previousLinkRevoked: true,
        failed:
          `The email was refused (Resend ${res.status}). The previous link has already been ` +
          "cancelled, so press this again to issue another one.",
      };
    }

    return { sent: true, narrator, email };
  } catch (e) {
    console.error("fresh pickup link threw:", (e as Error).message);
    return { sent: false, refused: (e as Error).message.slice(0, 200) };
  }
}
