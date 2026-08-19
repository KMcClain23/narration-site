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

// Editing is deliberately absent. A book past the mic still has work in it,
// but none of it happens in the booth, and an agenda that lists it is telling
// you to record something you have already recorded.
const ACTIVE_STATUSES = ["contracted", "prepping", "recording"];

/** How far ahead a deadline is worth seeing beside today's work. */
const DUE_SOON_DAYS = 7;

export type AgendaItem = { id: string; title: string; hours: number | null; isBlock: boolean };
export type AgendaDue = { id: string; title: string; deadline: string };

/**
 * Both totals run from today, not from Monday or the first.
 *
 * What is already spent is not a decision anyone can still make. The question
 * a sidebar figure answers is how much of the week is left to give away, so
 * days behind today are excluded from it.
 */
function endOfWeek(from: Date): Date {
  const d = new Date(from);
  // Monday-first, matching the calendars: 0 is Monday, 6 is Sunday.
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - dow));
  return d;
}

function endOfMonth(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 0);
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const today = toISODate(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + DUE_SOON_DAYS);
  const horizonISO = toISODate(horizon);

  const now = new Date();
  const weekEnd = toISODate(endOfWeek(now));
  const monthEnd = toISODate(endOfMonth(now));
  // Whichever runs later bounds the one query that feeds all three figures.
  const lastDay = weekEnd > monthEnd ? weekEnd : monthEnd;

  const [cardsRes, blocksRes] = await Promise.all([
    supabaseAdmin
      .from("board_cards")
      .select("id, title, word_count, narration_format, narrator_share_percent, deadline, recording_dates, words_recorded")
      .in("status", ACTIVE_STATUSES)
      .is("archived_at", null),
    supabaseAdmin
      .from("time_blocks")
      .select("id, on_date, hours, label")
      .gte("on_date", today)
      .lte("on_date", lastDay),
  ]);

  const cards = cardsRes.data ?? [];
  const blocks = blocksRes.data ?? [];

  let weekHours = 0;
  let monthHours = 0;

  const addSpan = (date: string, hours: number) => {
    if (date < today) return;
    if (date <= weekEnd) weekHours += hours;
    if (date <= monthEnd) monthHours += hours;
  };

  // Only books with today actually chosen. A book whose hours are merely
  // spread across every weekday was never planned for today, and listing it
  // would turn the agenda into a list of everything, always.
  const items: AgendaItem[] = [];
  for (const c of cards) {
    const dates: string[] = Array.isArray(c.recording_dates) ? c.recording_dates : [];
    if (dates.length === 0) continue;
    const plan = narrationPlan(
      c.word_count,
      c.narration_format,
      c.narrator_share_percent,
      c.deadline,
      { dates },
      new Date(),
      undefined,
      Number(c.words_recorded) || 0,
    );
    const perDay = plan?.hoursPerDay ?? null;

    // The week and month totals are the same per-day figure counted across
    // every day the book occupies inside each span.
    if (perDay != null) for (const date of dates) addSpan(date, perDay);

    if (dates.includes(today)) {
      items.push({ id: c.id, title: c.title, hours: perDay, isBlock: false });
    }
  }

  for (const b of blocks) {
    const hours = Number(b.hours) || 0;
    addSpan(b.on_date, hours);
    if (b.on_date === today) {
      items.push({ id: b.id, title: b.label || "Blocked", hours, isBlock: true });
    }
  }

  const dueSoon: AgendaDue[] = cards
    .filter(c => c.deadline && c.deadline >= today && c.deadline <= horizonISO)
    .map(c => ({ id: c.id, title: c.title, deadline: c.deadline as string }))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return NextResponse.json({ date: today, items, dueSoon, weekHours, monthHours });
}
