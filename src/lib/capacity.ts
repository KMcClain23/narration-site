import { narrationPlan, toISODate, type RecordingSchedule } from "@/components/admin/board-card-utils";

/**
 * What the booth is already committed to, and what is left.
 *
 * Every book already knows how many hours it needs and which days it will use.
 * Laid side by side those answer the question a narrator actually has to
 * answer before saying yes to anything: not "am I busy" but "where exactly
 * does another ten hours go, and is it finished before they need it".
 *
 * Hours are spread evenly across a book's remaining recording days. That is
 * how the per-day figure on each card is already calculated, so the two agree;
 * it is a plan rather than a prediction, and a heavy day moves work rather
 * than making it vanish.
 */

/** A working day at the mic. Long enough to be real, short enough to survive. */
export const DEFAULT_DAILY_CAPACITY = 6;

/** Days a new book could be scheduled on, when no day is already committed. */
const DEFAULT_AVAILABLE_DAYS = [1, 2, 3, 4, 5];

export type CapacityCard = {
  id: string;
  title: string;
  word_count: number | null;
  narration_format: string | null;
  narrator_share_percent: number | null;
  deadline: string | null;
  recording_dates: string[] | null;
};

export type DayLoad = {
  date: string;
  /** Hours already spoken for, by book. */
  commitments: { id: string; title: string; hours: number }[];
  committed: number;
  /** capacity − committed, never below zero. */
  free: number;
  /** No dates were chosen for at least one book landing here, so this is inferred. */
  assumed: boolean;
};

function eachDay(from: Date, days: number): string[] {
  const out: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < days; i++) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * The days a book will actually occupy.
 *
 * Chosen dates when it has them. Otherwise the weekdays between now and its
 * deadline, which is what the board card already assumes — a book nobody has
 * scheduled is still going to take the time it takes, and leaving it out of
 * the calendar would show capacity that does not exist.
 */
function daysFor(card: CapacityCard, horizon: string[], today: Date): { days: string[]; assumed: boolean } {
  const todayISO = toISODate(today);
  const chosen = (card.recording_dates ?? []).filter(
    d => d >= todayISO && (!card.deadline || d <= card.deadline),
  );
  if (chosen.length) return { days: chosen, assumed: false };

  if (!card.deadline) return { days: [], assumed: false };
  const days = horizon.filter(
    d => d >= todayISO && d <= card.deadline! && DEFAULT_AVAILABLE_DAYS.includes(new Date(d + "T00:00:00").getDay()),
  );
  return { days, assumed: days.length > 0 };
}

export function buildCalendar(
  cards: CapacityCard[],
  horizonDays: number,
  dailyCapacity: number = DEFAULT_DAILY_CAPACITY,
  today: Date = new Date(),
): DayLoad[] {
  const horizon = eachDay(today, horizonDays);
  const byDate = new Map<string, DayLoad>(
    horizon.map(date => [date, { date, commitments: [], committed: 0, free: dailyCapacity, assumed: false }]),
  );

  for (const card of cards) {
    const plan = narrationPlan(
      card.word_count,
      card.narration_format,
      card.narrator_share_percent,
      card.deadline,
      { dates: card.recording_dates } as RecordingSchedule,
      today,
    );
    if (!plan) continue;

    const { days, assumed } = daysFor(card, horizon, today);
    if (!days.length) continue;

    const perDay = plan.hours / days.length;
    for (const date of days) {
      const day = byDate.get(date);
      if (!day) continue;
      day.commitments.push({ id: card.id, title: card.title, hours: perDay });
      day.committed += perDay;
      day.assumed = day.assumed || assumed;
    }
  }

  for (const day of byDate.values()) {
    day.free = Math.max(0, dailyCapacity - day.committed);
  }
  return [...byDate.values()];
}

export type Fit = {
  /** The days the new book would use, in order. */
  days: { date: string; hours: number }[];
  /** The last of them: when the work would actually be finished. */
  finishBy: string;
  /** Free hours still left across the horizon after fitting it. */
  spareAfter: number;
};

/**
 * Where a book of `hours` would go, taken earliest-first.
 *
 * Greedy on purpose. A narrator wants to know the soonest it can be done, not
 * the most elegant arrangement, and filling from today gives the earliest
 * honest finish date. Days already carrying work stay available up to capacity,
 * because a day at the mic is a day at the mic.
 */
export function fitBook(
  hours: number,
  calendar: DayLoad[],
  availableDays: number[] = DEFAULT_AVAILABLE_DAYS,
): Fit | null {
  if (hours <= 0) return null;

  let remaining = hours;
  const days: { date: string; hours: number }[] = [];

  for (const day of calendar) {
    if (remaining <= 0.005) break;
    const dow = new Date(day.date + "T00:00:00").getDay();
    // A day that already has work on it is a day being recorded, whatever the
    // usual pattern says.
    const usable = availableDays.includes(dow) || day.committed > 0.005;
    if (!usable || day.free <= 0.005) continue;

    const take = Math.min(day.free, remaining);
    days.push({ date: day.date, hours: take });
    remaining -= take;
  }

  if (remaining > 0.005) return null;

  const used = new Map(days.map(d => [d.date, d.hours]));
  const spareAfter = calendar.reduce((sum, d) => sum + Math.max(0, d.free - (used.get(d.date) ?? 0)), 0);
  return { days, finishBy: days[days.length - 1].date, spareAfter };
}

/** Total free hours across the horizon, which is the headline number. */
export function totalFree(calendar: DayLoad[], availableDays: number[] = DEFAULT_AVAILABLE_DAYS): number {
  return calendar.reduce((sum, d) => {
    const dow = new Date(d.date + "T00:00:00").getDay();
    return availableDays.includes(dow) || d.committed > 0.005 ? sum + d.free : sum;
  }, 0);
}
