import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * A nudge about pickups already sent. It issues nothing and revokes nothing.
 *
 * ── WHY IT CANNOT CONTAIN THE LINK ─────────────────────────────────────────
 *
 * Dean's choice was to re-use the link she already has rather than mint a new
 * one, because `issue_pickup_link` REVOKES the previous token and has already
 * killed a live link sitting in someone's inbox.
 *
 * But `pickup_links` stores only `token_hash` — the raw token is never
 * persisted, deliberately, because it is a bearer credential with no second
 * factor. So there is no way to put her existing link into a second email. That
 * is the design working, not a gap in it.
 *
 * So this reminder POINTS AT THE EARLIER EMAIL rather than carrying a link:
 * what is outstanding, which chapter, and when the original went. If she cannot
 * find it, "Send a fresh link" is one button away and is the deliberate,
 * revoking choice — which is exactly the distinction Dean asked for.
 *
 * ── AND IT CHANGES NOTHING ─────────────────────────────────────────────────
 *
 * No pickup moves, no token is minted, no manifest is filed. It is safe to
 * press twice; the only cost of a second one is that she gets two emails.
 */

export type ReminderOutcome =
  | { sent: true; narrator: string; email: string; outstanding: number }
  | { sent: false; refused: string };

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
  (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function chapterLabel(chapter: string): string {
  const c = (chapter ?? "").trim();
  return /^\d/.test(c) ? `chapter ${c}` : c || "a chapter";
}

const NAVY = "#06082E";
const PANEL = "#0A0D3A";

/**
 * Quieter than either of the other two emails, on purpose.
 *
 * The pickup send is the work arriving and the replacement link is a fix for
 * something broken. This is neither — it is a tap on the shoulder, and it says
 * so: no button, no list, no gold. A reminder that looks as urgent as the
 * original teaches people to ignore both.
 */
function bodies(book: string, chapter: string, narrator: string, n: number, sentOn: string) {
  const ch = chapterLabel(chapter);
  const count = `${n} pickup${n === 1 ? "" : "s"}`;
  const when = sentOn ? ` I sent them on ${sentOn}.` : "";

  const text = [
    `Hello ${narrator},`,
    "",
    `Just a reminder that ${count} for ${book}, ${ch} ${n === 1 ? "is" : "are"} still outstanding.${when}`,
    "",
    "The link in that email still works — open it there when you have a moment.",
    "Nothing has changed and nothing new has been added.",
    "",
    "If you cannot find the email, reply to this one and I will send the link again.",
  ].join("\n");

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>A reminder</title>
</head>
<body style="margin:0;padding:0;background-color:${NAVY};">
<span style="display:none !important;font-size:1px;color:${NAVY};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">A reminder — nothing new, and the link you have still works.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${NAVY};">
  <tr><td align="center" style="background-color:${NAVY};padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td style="background-color:${PANEL};border:1px solid #1A2070;border-radius:12px;padding:24px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8b93a7;">Reminder</p>
        <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;color:#ffffff;font-weight:normal;">${esc(String(n))} still outstanding, ${esc(narrator)}</h1>
        <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#c4c9d6;">${esc(book)} &middot; ${esc(ch)}</p>
        <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#c4c9d6;">
          ${sentOn ? `I sent these on ${esc(sentOn)}. ` : ""}The link in that email still works &mdash; open it there when you have a moment.
          <strong style="color:#ffffff;">Nothing has changed and nothing new has been added.</strong>
        </p>
        <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#8b93a7;">
          If you cannot find the email, reply to this one and I will send the link again.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:18px 8px 0 8px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5f6478;">Dean Miller Narration</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { text, html };
}

export async function sendPickupReminder(
  cardId: string,
  chapter: string,
  narratorId: string,
): Promise<ReminderOutcome> {
  try {
    const key = process.env.PICKUPS_RESEND_API_KEY;
    const from = process.env.PICKUPS_FROM_ADDRESS;
    if (!key || !from) {
      return { sent: false, refused: "The pickup sender is not configured on this deployment." };
    }

    const { data: rows, error } = await supabaseAdmin.rpc("pickup_batches_for_editor");
    if (error) return { sent: false, refused: `Could not read the batch: ${error.message}` };
    const batch = ((rows ?? []) as Batch[]).find(
      b => b.card_id === cardId && b.chapter === chapter && b.narrator_id === narratorId,
    );
    if (!batch) {
      return {
        sent: false,
        refused: "Nothing has been sent for that chapter and narrator, so there is nothing to remind her about.",
      };
    }

    /*
      A REMINDER IS ABOUT WORK STILL OUT WITH HER.

      `returned` rows are back and waiting on the EDITOR, so a chapter whose
      pickups have all come back is not something to chase — nudging her about
      work she has already done is how a reminder becomes noise.
    */
    if (batch.open_count === 0) {
      return {
        sent: false,
        refused:
          batch.returned_count > 0
            ? `Everything in ${chapterLabel(chapter)} has come back — it is waiting on you, not on her.`
            : `Nothing in ${chapterLabel(chapter)} is outstanding.`,
      };
    }

    /*
      NO LIVE LINK MEANS NOTHING TO REMIND HER *TO*.

      The reminder points at a link she already holds. If that link has expired
      or been revoked, this email would send her to a page saying the link has
      expired — which is worse than not writing at all. "Send a fresh link" is
      the deliberate, revoking alternative and is named here rather than done
      silently.
    */
    if (!batch.link_live) {
      return {
        sent: false,
        refused:
          "Her link has expired or been replaced, so a reminder would point at nothing. " +
          "Use “Send a fresh link” instead — that issues a new one.",
      };
    }

    if (!batch.has_email) {
      return { sent: false, refused: `${batch.narrator_name} has no email address on file.` };
    }

    const { data: nar } = await supabaseAdmin
      .from("narrators").select("display_name, email").eq("id", narratorId).maybeSingle();
    const email = (nar?.email ?? "").trim();
    const narrator = nar?.display_name ?? batch.narrator_name;
    if (!email) return { sent: false, refused: `${narrator} has no email address on file.` };

    const { data: card } = await supabaseAdmin
      .from("board_cards").select("title").eq("id", cardId).maybeSingle();
    const book = card?.title ?? "your book";

    const sentOn = batch.last_link_at
      ? new Date(batch.last_link_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
      : "";

    const { text, html } = bodies(book, chapter, narrator, batch.open_count, sentOn);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: from,
        // Distinct from both the send and the replacement, so three emails in a
        // thread do not read as three sets of work.
        subject: `Reminder: ${batch.open_count} pickup${batch.open_count === 1 ? "" : "s"} still open — ${book}, ${chapterLabel(chapter)}`,
        text,
        html,
      }),
    });

    if (!res.ok) {
      console.error(`pickup reminder: Resend ${res.status} ${(await res.text()).slice(0, 200)}`);
      // NOTHING WAS CHANGED, so this is simply a failed send — unlike the fresh
      // link, there is no revoked token to warn about.
      return { sent: false, refused: `The email was refused (Resend ${res.status}). Nothing changed; try again.` };
    }

    return { sent: true, narrator, email, outstanding: batch.open_count };
  } catch (e) {
    console.error("pickup reminder threw:", (e as Error).message);
    return { sent: false, refused: (e as Error).message.slice(0, 200) };
  }
}
