import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { narrationPlan, toISODate } from "@/components/admin/board-card-utils";
import { getStudioSettings } from "@/lib/studio-settings-server";

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
 * Pickups Dean owes a narrator's booth, summarised.
 *
 * ── NOT PART OF THE DATE-BASED AGENDA, AND THAT IS THE POINT ───────────────
 *
 * Everything else here is scheduled work: sessions on a date, deadlines, hours
 * left this week. A pickup has no date — only a `sent_at` — so it cannot be
 * "due today" and must not be added to a due-today total. Doing that would make
 * "nothing due today" false in a way no figure on the panel could explain.
 *
 * It travels as its own field so that "Nothing at the mic" and "3 pickups to
 * re-record" can both be true at once, which today they are.
 *
 * `books` rather than a bare count: a number with no title is not actionable
 * from a sidebar — it says something is owed without saying on what.
 */
export type AgendaPickups = { count: number; books: string[] };

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

  const [settingsRes, cardsRes, blocksRes, pickupsRes] = await Promise.all([
    getStudioSettings(),
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
    /*
      SENT ONLY, AND ASSIGNED TO HIM. Both halves are load-bearing.

      `draft` is the editor still writing it — not handed over, so announcing it
      promises work that does not exist yet. `returned` he has already
      re-recorded and it is waiting on her. `resolved` and `dismissed` are
      closed. Only `sent` is a line he still owes a booth.

      The narrator row comes from owner_narrator_id() rather than a name or a
      literal, because that is the same rule card_cast uses to decide whose book
      it is, and two rules for "which narrator is Dean" is one rule too many.
    */
    (async (): Promise<{ title: string }[]> => {
      const { data: ownerId } = await supabaseAdmin.rpc("owner_narrator_id");
      // NO OWNER MEANS NO CLAIM, not "none outstanding". Returning an empty list
      // here would render as "nothing to re-record", which is a statement about
      // his workload made on the strength of a lookup that failed. The panel
      // renders nothing at all instead, which is the honest shape of "unknown"
      // for a summary that has no room to explain itself.
      if (!ownerId) return [];
      const { data } = await supabaseAdmin
        .from("pickups")
        .select("id, board_cards!inner(title, archived_at)")
        .eq("status", "sent")
        .eq("assigned_narrator_id", ownerId)
        .is("board_cards.archived_at", null);
      return ((data ?? []) as unknown as { board_cards: { title: string } | null }[])
        .map(r => ({ title: r.board_cards?.title ?? "" }))
        .filter(r => r.title !== "");
    })(),
  ]);

  const cards = cardsRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  // Read rather than defaulted. Left implicit, this endpoint answered at the
  // built-in rate while the board and calendar used the one in Settings, so
  // the sidebar quietly halved every figure once that rate was changed.
  const studio = settingsRes;

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
    const plan = narrationPlan({
      wordCount: c.word_count,
      narrationFormat: c.narration_format,
      narratorSharePercent: c.narrator_share_percent,
      deadline: c.deadline,
      schedule: { dates },
      wordsPerHour: studio.settings.wordsPerNarrationHour,
      wordsRecorded: Number(c.words_recorded) || 0,
    });
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

  // The payload carries the availability and the client renders the gap.
  //
  // Failing the whole request would take down a sidebar that is mostly
  // rate-independent: the deadlines, the due-soon list and which books are on
  // today are all facts about the schedule and owe nothing to a rate. Only the
  // hour figures do, and `narrationPlan` already answers null for them, so they
  // travel as null rather than as a number computed from a guess.
  const ratesUnavailable = studio.settings.wordsPerNarrationHour == null;

  // Distinct titles, in the order they come back. One book is named outright;
  // several become a count, because three titles do not fit a sidebar line and
  // truncating one to fit would name a book wrongly.
  const pickupBooks = [...new Set(pickupsRes.map(r => r.title))];

  return NextResponse.json({
    date: today,
    items,
    dueSoon,
    // Null rather than a blocks-only sum. Without a rate no book contributes,
    // so these would still add up — to a smaller number, with nothing to say it
    // was partial. A total that quietly omits most of its input is the harder
    // version of the bug this stage is about, because it looks answered.
    weekHours: ratesUnavailable ? null : weekHours,
    monthHours: ratesUnavailable ? null : monthHours,
    ratesUnavailable,
    // Beside the date-based figures, never inside them.
    pickups: { count: pickupsRes.length, books: pickupBooks } satisfies AgendaPickups,
  });
}
