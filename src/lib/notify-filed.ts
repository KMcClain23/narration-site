import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Tell the editor that a narrator's audio has been FILED.
 *
 * ── THE GAP THIS CLOSES IS NARROW, AND WORTH NAMING PRECISELY ──────────────
 *
 * P4 already emails her when Ann presses confirm. What produces nothing today is
 * Ann uploading files and never confirming — attaching deliberately marks
 * nothing, so she can send the audio, close the tab, and Marizete finds out only
 * by opening the folder.
 *
 * ── FIRES ON filed_at, NOT ON UPLOAD ───────────────────────────────────────
 *
 * Until the sweep moves a file out of `Pickups/_incoming/`, it sits under a uuid
 * name in a quarantine folder. Telling her audio is ready when she cannot yet
 * find it is worse than telling her nothing — the same reason the in-app count
 * separates "filed" from "still filing".
 *
 * ── ONE EMAIL PER BATCH PER SWEEP RUN ──────────────────────────────────────
 *
 * A narrator uploading five files in one session gets one email naming five. The
 * sweep groups its filed rows by link_id and calls this once per group.
 *
 * NEVER THROWS, and never a zero-file email.
 */

export type FiledOutcome =
  | { sent: number }
  | { skipped: string }
  | { failed: string };

type FiledSummary = {
  card_id: string;
  book_title: string;
  chapter: string;
  narrator_name: string;
  folder: string | null;
  filed_count: number;
  returned_count: number;
  sent_count: number;
};

export async function notifyEditorsOfFiling(
  linkId: string,
  filedThisRun: number,
): Promise<FiledOutcome> {
  try {
    // A zero-file email is never sent. If the sweep filed nothing for this batch
    // there is nothing to tell her, and "0 files are now in…" is noise that
    // teaches her to ignore the ones that matter.
    if (filedThisRun <= 0) return { skipped: "nothing filed for this batch" };

    const { data: rows, error: sErr } = await supabaseAdmin.rpc("filed_batch_summary", {
      p_link_id: linkId,
    });
    if (sErr) return { failed: `summary: ${sErr.message}` };
    const s = ((rows ?? []) as FiledSummary[])[0];
    if (!s) return { skipped: "no batch for that link" };

    const { data: recipientRows, error: rErr } = await supabaseAdmin.rpc(
      "editor_notification_recipients",
    );
    if (rErr) return { failed: `recipients: ${rErr.message}` };
    const to = ((recipientRows ?? []) as { email: string }[]).map(r => r.email).filter(Boolean);
    if (to.length === 0) {
      console.warn("filed notification: no editor has an address on file");
      return { skipped: "no editor with an address" };
    }

    const key = process.env.PICKUPS_RESEND_API_KEY;
    const from = process.env.PICKUPS_FROM_ADDRESS;
    if (!key || !from) return { skipped: "sender not configured" };

    const origin = process.env.PICKUPS_SITE_ORIGIN ?? "https://www.dmnarration.com";
    const link = `${origin}/editor/card/${s.card_id}`;
    const n = filedThisRun;
    const where = s.folder ?? `Pickups/${s.book_title}/${s.narrator_name}`;

    /*
      SAY SOMETHING THE CONFIRM EMAIL DOES NOT.

      If she has already confirmed, this adds the location — the audio is now
      somewhere she can open. If she has NOT, this is the only signal that
      anything happened at all, and it has to say plainly that the pickups are
      still marked sent: the files arrived, the narrator never pressed confirm,
      and those are different facts.
    */
    const unconfirmed = s.returned_count === 0 && s.sent_count > 0;
    const status = unconfirmed
      ? `${s.narrator_name} has not marked the pickups re-recorded — they are still showing as sent — but the audio has arrived anyway.`
      : `${s.returned_count} pickup${s.returned_count === 1 ? " is" : "s are"} marked re-recorded and waiting for you to check.`;

    const text = [
      `${n} audio file${n === 1 ? "" : "s"} from ${s.narrator_name} ${n === 1 ? "is" : "are"} now filed.`,
      "",
      `Book:    ${s.book_title}`,
      `Chapter: ${s.chapter}`,
      `Folder:  ${where}`,
      "",
      status,
      "",
      "Open the book:",
      link,
    ].join("\n");

    const esc = (t: string) =>
      (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = [
      `<p><strong>${esc(String(n))} audio file${n === 1 ? "" : "s"}</strong> from ${esc(s.narrator_name)} ${n === 1 ? "is" : "are"} now filed.</p>`,
      `<p><strong>${esc(s.book_title)}</strong> — chapter ${esc(s.chapter)}<br>`,
      `<span style="color:#666">${esc(where)}</span></p>`,
      `<p>${esc(status)}</p>`,
      `<p><a href="${esc(link)}">Open the book</a></p>`,
    ].join("");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        reply_to: from,
        subject:
          `${s.book_title} — ${n} audio file${n === 1 ? "" : "s"} filed for chapter ${s.chapter}`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(`filed notification failed: Resend ${res.status} ${detail}`);
      return { failed: `Resend ${res.status}` };
    }
    return { sent: to.length };
  } catch (e) {
    console.error("filed notification threw:", (e as Error).message);
    return { failed: (e as Error).message.slice(0, 200) };
  }
}
