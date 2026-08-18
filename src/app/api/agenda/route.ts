import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { narrationPlan, toISODate } from "@/components/admin/board-card-utils";

// What today asks of you, assembled server-side so the sidebar can show it on
// every page without each page having to fetch or pass anything down.
//
// A client component renders the sidebar (/board is itself a client page, so
// the layout above it cannot be async), which is why this is an endpoint
// rather than a server-side read in AdminLayout.

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["contracted", "prepping", "recording", "editing"];

/** How far ahead a deadline is worth seeing beside today's work. */
const DUE_SOON_DAYS = 7;

export type AgendaItem = { id: string; title: string; hours: number | null; isBlock: boolean };
export type AgendaDue = { id: string; title: string; deadline: string };

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const today = toISODate(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + DUE_SOON_DAYS);
  const horizonISO = toISODate(horizon);

  const [cardsRes, blocksRes] = await Promise.all([
    supabaseAdmin
      .from("board_cards")
      .select("id, title, word_count, narration_format, narrator_share_percent, deadline, recording_dates")
      .in("status", ACTIVE_STATUSES)
      .is("archived_at", null),
    supabaseAdmin.from("time_blocks").select("id, on_date, hours, label").eq("on_date", today),
  ]);

  const cards = cardsRes.data ?? [];

  // Only books with today actually chosen. A book whose hours are merely
  // spread across every weekday was never planned for today, and listing it
  // would turn the agenda into a list of everything, always.
  const items: AgendaItem[] = [];
  for (const c of cards) {
    const dates: string[] = Array.isArray(c.recording_dates) ? c.recording_dates : [];
    if (!dates.includes(today)) continue;
    const plan = narrationPlan(
      c.word_count,
      c.narration_format,
      c.narrator_share_percent,
      c.deadline,
      { dates },
    );
    items.push({ id: c.id, title: c.title, hours: plan?.hoursPerDay ?? null, isBlock: false });
  }

  for (const b of blocksRes.data ?? []) {
    items.push({
      id: b.id,
      title: b.label || "Blocked",
      hours: Number(b.hours) || 0,
      isBlock: true,
    });
  }

  const dueSoon: AgendaDue[] = cards
    .filter(c => c.deadline && c.deadline >= today && c.deadline <= horizonISO)
    .map(c => ({ id: c.id, title: c.title, deadline: c.deadline as string }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return NextResponse.json({ date: today, items, dueSoon });
}
