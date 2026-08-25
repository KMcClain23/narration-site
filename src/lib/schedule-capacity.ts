// Shared vocabulary for the Schedule page's two views of the same data.
//
// Desktop shows a rolling twelve months as a grid; mobile shows one calendar
// quarter at a time. They must agree on what "Busy" means and on which books
// land in which month, so the thresholds and the month-key match live here
// rather than being written twice and drifting the first time one is tweaked.

export const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const STATUS_STYLES = {
  open: { label: "Open", textClass: "text-text-muted", barClass: "bg-text-dim/50" },
  light: { label: "Light", textClass: "text-capacity-light", barClass: "bg-capacity-light" },
  busy: { label: "Busy", textClass: "text-accent-amber-bright", barClass: "bg-accent-amber-bright" },
  full: { label: "Full", textClass: "text-alert-red", barClass: "bg-alert-red" },
} as const;

export type CapacityStatusKey = keyof typeof STATUS_STYLES;

// Thresholds are purely visual (per design decision) — never gate any action.
export function statusKeyFor(count: number): CapacityStatusKey {
  if (count === 0) return "open";
  if (count === 1) return "light";
  if (count <= 3) return "busy";
  return "full";
}

export const BAR_SEGMENTS = 5;

export type ScheduleGridCard = { id: string; title: string; deadline: string };

/** "YYYY-MM" for a month, the prefix a deadline is matched against. */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export type MonthSummary = {
  key: string;
  year: number;
  monthIndex: number;
  count: number;
  titles: string[];
};

/**
 * What is due in one month.
 *
 * Matched by string prefix rather than by parsing the date, because a deadline
 * is stored as "YYYY-MM-DD" and parsing it would reintroduce the timezone
 * question this codebase has already answered wrongly three times. A prefix
 * comparison has no timezone.
 */
export function summariseMonth(cards: ScheduleGridCard[], year: number, monthIndex: number): MonthSummary {
  const key = monthKey(year, monthIndex);
  const monthCards = cards.filter(c => c.deadline.startsWith(key));
  return { key, year, monthIndex, count: monthCards.length, titles: monthCards.map(c => c.title) };
}

// ─── quarters ───────────────────────────────────────────────────────────────

export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4 };

/**
 * Quarters as a single integer, so "next", "previous" and "is this one past
 * the end" are arithmetic instead of a year-and-quarter carry that has to be
 * got right in four separate places.
 */
export function quarterIndex(q: Quarter): number {
  return q.year * 4 + (q.quarter - 1);
}

export function quarterFromIndex(index: number): Quarter {
  return { year: Math.floor(index / 4), quarter: ((index % 4) + 1) as 1 | 2 | 3 | 4 };
}

export function quarterOfMonth(year: number, monthIndex: number): Quarter {
  return { year, quarter: (Math.floor(monthIndex / 3) + 1) as 1 | 2 | 3 | 4 };
}

/** Same prefix-not-parse reasoning as summariseMonth. */
export function quarterIndexOfDeadline(deadline: string): number {
  const year = Number(deadline.slice(0, 4));
  const monthIndex = Number(deadline.slice(5, 7)) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return NaN;
  return quarterIndex(quarterOfMonth(year, monthIndex));
}

export function quarterLabel(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

/** The three month indices a quarter covers, in order. */
export function monthsOfQuarter(q: Quarter): number[] {
  const first = (q.quarter - 1) * 3;
  return [first, first + 1, first + 2];
}

/**
 * How far the quarter view may be navigated.
 *
 * Forward is the later of "far enough to be useful" and "far enough to reach
 * the last thing on the books". Backward normally stops at the current
 * quarter: Schedule is a planning page, only active work is loaded, and past
 * quarters would render as three empty cards — an affordance that leads
 * nowhere is worse than no affordance. The exception is real: an overdue book
 * is still active and still has a deadline behind us, and Due Soon has a whole
 * section for exactly that, so the bound stretches back far enough to show it.
 */
export function quarterBounds(cards: ScheduleGridCard[], today: Date): { min: number; max: number } {
  const current = quarterIndex(quarterOfMonth(today.getFullYear(), today.getMonth()));
  const FORWARD_QUARTERS = 7;

  const deadlineIndices = cards
    .map(c => quarterIndexOfDeadline(c.deadline))
    .filter(n => Number.isFinite(n));

  return {
    min: Math.min(current, ...deadlineIndices),
    max: Math.max(current + FORWARD_QUARTERS, ...deadlineIndices),
  };
}
