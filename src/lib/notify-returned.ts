import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Tell the editor that a narrator has sent a chapter back.
 *
 * ONE EMAIL PER BATCH. Ann confirms a whole chapter at once, so five pickups
 * returning produce one email naming five — not five emails. The batch boundary
 * already exists: it is a successful `mark_returned_by_token`, so this is called
 * from there rather than reconstructing a batch from rows afterwards.
 *
 * THE RECIPIENT IS DERIVED FROM THE ROLE. Every `profiles` row with role
 * `editor`, joined to `auth.users` for the address. A literal address would mean
 * a second editor silently gets nothing and a departed one keeps receiving.
 *
 * NEVER THROWS. The caller has already moved the pickups to `returned` and that
 * must stand; a notification problem is logged and reported, not raised.
 */

export type NotifyOutcome =
  | { sent: number; recipients: string[] }
  | { skipped: string }
  | { failed: string };

type Summary = {
  card_id: string;
  book_title: string;
  chapter: string;
  narrator_name: string;
  returned_count: number;
  upload_count: number;
};

/** A note left with the return, if anyone left one. */
type Note = { body: string; author_name: string; author_kind: string };

function chapterLabel(chapter: string): string {
  const c = (chapter ?? "").trim();
  return /^\d/.test(c) ? `chapter ${c}` : c || "a chapter";
}

function bodies(s: Summary, origin: string, notes: Note[]) {
  const link = `${origin}/editor/card/${s.card_id}`;
  const n = s.returned_count;
  /*
    SAY WHAT IS TRUE OF THE AUDIO RIGHT NOW, which is "arriving", not "ready".
    
    At this moment the files are in `Pickups/_incoming/` under uuid names; the
    sweep has not moved them yet. Implying they are listenable would send her to
    a folder where nothing is findable. A SECOND email follows once they are
    actually filed, and that one carries the location — see notify-filed.ts.
  */
  const audio =
    s.upload_count > 0
      ? `${s.upload_count} audio file${s.upload_count === 1 ? "" : "s"} uploaded — being filed now, ` +
        "you will get a second email when they are in the book's folder"
      : "no audio uploaded — they may have sent it another way";

  /*
    THE NOTE GOES IN THE EMAIL, and this is the moment it earns its place.

    Dean marking a chapter re-recorded with "I edited the spliced file and saved
    over it — ready to master" is the difference between her opening the page to
    find out what happened and already knowing. Putting it only on the page
    would mean the useful sentence arrives after the decision it should have
    informed.
  */
  const noteLines = notes.length
    ? ["", ...notes.map(nt => `${nt.author_name}: ${nt.body}`)]
    : [];

  const text = [
    `${s.narrator_name} has re-recorded ${n} pickup${n === 1 ? "" : "s"}.`,
    "",
    `Book:     ${s.book_title}`,
    `Chapter:  ${s.chapter}`,
    `Narrator: ${s.narrator_name}`,
    `Pickups:  ${n}`,
    `Audio:    ${audio}`,
    "",
    "Listen and close them here:",
    link,
  ].join("\n");

  const esc = (t: string) =>
    (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = [
    `<p><strong>${esc(s.narrator_name)}</strong> has re-recorded ${n} pickup${n === 1 ? "" : "s"}.</p>`,
    `<p><strong>${esc(s.book_title)}</strong> — ${esc(chapterLabel(s.chapter))}<br>`,
    `${n} pickup${n === 1 ? "" : "s"} · ${esc(audio)}</p>`,
    // Visually distinct from the correction text above it: a note about the fix
    // must never be mistakable for the line to re-record.
    ...notes.map(nt =>
      `<p style="margin:12px 0;padding:10px 12px;border-left:3px solid #D4AF37;background:#f7f4ea">` +
      `<strong>${esc(nt.author_name)}</strong> <span style="color:#666">(${esc(nt.author_kind)})</span><br>` +
      `${esc(nt.body)}</p>`,
    ),
    `<p><a href="${esc(link)}">Listen and close them</a></p>`,
  ].join("");

  return { text, html, link };
}

export async function notifyEditorsOfReturn(token: string): Promise<NotifyOutcome> {
  try {
    const { data: summaryRows, error: sErr } = await supabaseAdmin.rpc("returned_batch_summary", {
      p_token: token,
    });
    if (sErr) return { failed: `summary: ${sErr.message}` };
    const summary = ((summaryRows ?? []) as Summary[])[0];
    if (!summary) return { skipped: "no batch found for that token" };

    const { data: recipientRows, error: rErr } = await supabaseAdmin.rpc(
      "editor_notification_recipients",
    );
    if (rErr) return { failed: `recipients: ${rErr.message}` };
    const recipients = ((recipientRows ?? []) as { email: string }[])
      .map(r => r.email)
      .filter(Boolean);

    // A LOGGED SKIP, not a crash — and not a silent success either. "Nobody to
    // tell" is a real state of the system and has to be visible as itself.
    if (recipients.length === 0) {
      console.warn("returned-pickups notification: no editor has an address on file");
      return { skipped: "no editor with an address" };
    }

    const key = process.env.PICKUPS_RESEND_API_KEY;
    const from = process.env.PICKUPS_FROM_ADDRESS;
    if (!key || !from) {
      console.warn("returned-pickups notification: PICKUPS_RESEND_* not configured");
      return { skipped: "sender not configured" };
    }

    const origin = process.env.PICKUPS_SITE_ORIGIN ?? "https://www.dmnarration.com";

    // Notes for THIS batch. A failure to read them must not stop the email —
    // the notification is the delivery and the note is an enhancement, the same
    // asymmetry as everywhere else in this flow.
    let notes: Note[] = [];
    const { data: noteRows, error: nErr } = await supabaseAdmin.rpc("notes_by_token", {
      p_token: token,
    });
    if (nErr) console.warn(`returned-pickups notification: notes unavailable — ${nErr.message}`);
    else notes = ((noteRows ?? []) as Note[]).slice(-3);

    const { text, html } = bodies(summary, origin, notes);

    // ONE call, every editor on it — the batch produces one email.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: from,
        subject:
          `${summary.book_title} — ${summary.narrator_name} returned ` +
          `${summary.returned_count} pickup${summary.returned_count === 1 ? "" : "s"}`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(`returned-pickups notification failed: Resend ${res.status} ${detail}`);
      return { failed: `Resend ${res.status}` };
    }
    return { sent: recipients.length, recipients };
  } catch (e) {
    console.error("returned-pickups notification threw:", (e as Error).message);
    return { failed: (e as Error).message.slice(0, 200) };
  }
}

/**
 * The same email, fired from the ADMIN's "Re-recorded" instead of a token.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The notification above only ever ran from the narrator's confirm. Dean
 * marking a pickup re-recorded from /pickups told nobody at all — so a note
 * saying "I edited the spliced file myself, there is no take to look for" would
 * wait on a page Marizete might not open that day, which is exactly the
 * situation the note was added to fix.
 *
 * Same recipients, same body, same never-throws contract. The only difference
 * is that the batch is found from a pickup, because a token is the one thing
 * the admin path does not have.
 */
export async function notifyEditorsOfAdminReturn(pickupId: string): Promise<NotifyOutcome> {
  try {
    const { data: rows, error } = await supabaseAdmin.rpc("returned_batch_by_pickup", {
      p_pickup_id: pickupId,
    });
    if (error) return { failed: `summary: ${error.message}` };
    const summary = ((rows ?? []) as (Summary & { link_id: string | null })[])[0];
    if (!summary) return { skipped: "no batch found for that pickup" };

    const { data: recipientRows, error: rErr } = await supabaseAdmin.rpc(
      "editor_notification_recipients",
    );
    if (rErr) return { failed: `recipients: ${rErr.message}` };
    const recipients = ((recipientRows ?? []) as { email: string }[])
      .map(r => r.email)
      .filter(Boolean);
    if (recipients.length === 0) {
      console.warn("returned-pickups notification: no editor has an address on file");
      return { skipped: "no editor with an address" };
    }

    const key = process.env.PICKUPS_RESEND_API_KEY;
    const from = process.env.PICKUPS_FROM_ADDRESS;
    if (!key || !from) return { skipped: "sender not configured" };

    let notes: Note[] = [];
    if (summary.link_id) {
      const { data: noteRows, error: nErr } = await supabaseAdmin.rpc("notes_by_link", {
        p_link_id: summary.link_id,
      });
      if (nErr) console.warn(`returned-pickups notification: notes unavailable — ${nErr.message}`);
      else notes = ((noteRows ?? []) as Note[]).slice(-3);
    }

    const origin = process.env.PICKUPS_SITE_ORIGIN ?? "https://www.dmnarration.com";
    const { text, html } = bodies(summary, origin, notes);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: recipients,
        reply_to: from,
        subject:
          `${summary.book_title} — ${summary.narrator_name} returned ` +
          `${summary.returned_count} pickup${summary.returned_count === 1 ? "" : "s"}`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(`returned-pickups notification failed: Resend ${res.status} ${detail}`);
      return { failed: `Resend ${res.status}` };
    }
    return { sent: recipients.length, recipients };
  } catch (e) {
    console.error("returned-pickups notification threw:", (e as Error).message);
    return { failed: (e as Error).message.slice(0, 200) };
  }
}
