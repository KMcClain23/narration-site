// Cron: POST /api/send-status-emails — called twice daily by Vercel Cron
// (0 14,22 * * * UTC = 9 am and 5 pm EST)
// Batches all unprocessed status changes and sends one summary email per
// book to the author if author_email is set on the card.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "Dean Miller Narration <updates@dmnarration.com>";

const STATUS_LABEL: Record<string, string> = {
  audition:   "Audition",
  contracted: "Contracted",
  recording:  "Recording",
  editing:    "Editing",
  released:   "Released",
};

function fmtStatus(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export async function POST() {
  // Fetch all unemailed changes with their card data
  const { data: rows, error } = await supabaseAdmin
    .from("status_change_log")
    .select(`
      id, card_id, old_status, new_status, created_at,
      board_cards ( title, author_email, author_token )
    `)
    .eq("emailed", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("send-status-emails: query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ sent: 0, message: "No pending changes." });
  }

  // Group by card_id
  const byCard = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = byCard.get(row.card_id) ?? [];
    existing.push(row);
    byCard.set(row.card_id, existing);
  }

  let sent = 0;
  const sentIds: string[] = [];
  const failedIds: string[] = [];

  for (const [, changes] of byCard) {
    const rawCard = changes[0].board_cards;
    const card = (Array.isArray(rawCard) ? rawCard[0] : rawCard) as {
      title: string;
      author_email: string | null;
      author_token: string | null;
    } | null;

    // Skip cards with no author email — log entries still get collected
    // so we mark them emailed to avoid reprocessing on the next run.
    if (!card?.author_email) {
      sentIds.push(...changes.map(c => c.id));
      continue;
    }

    const { title, author_email, author_token } = card;
    const progressUrl = author_token
      ? `https://www.dmnarration.com/board/${author_token}`
      : null;

    const changeLines = changes
      .map(c =>
        `  • ${fmtStatus(c.old_status)} → ${fmtStatus(c.new_status)} (${fmtDate(c.created_at)})`
      )
      .join("\n");

    const body = [
      `Here's the latest production update for ${title}:`,
      "",
      changeLines,
      "",
      progressUrl
        ? `View your progress page: ${progressUrl}`
        : "Contact Dean if you have any questions.",
      "",
      "— Dean Miller Narration",
    ].join("\n");

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to:   author_email,
        subject: `Production update for ${title}`,
        text:    body,
      });
      sent++;
      sentIds.push(...changes.map(c => c.id));
    } catch (e) {
      console.error(`send-status-emails: failed to email ${author_email}:`, e);
      failedIds.push(...changes.map(c => c.id));
    }
  }

  // Mark sent records as emailed
  if (sentIds.length) {
    await supabaseAdmin
      .from("status_change_log")
      .update({ emailed: true })
      .in("id", sentIds);
  }

  return NextResponse.json({
    sent,
    skipped: sentIds.length - sent,
    failed: failedIds.length,
    total: rows.length,
  });
}
