/**
 * One timezone for the whole site: Pacific.
 *
 * Nothing here should ever render in UTC. The server runs in UTC, so any
 * `toLocaleDateString` or `Intl.DateTimeFormat` without an explicit timeZone
 * silently formats in UTC — which is how a demo played at 6:27pm was listed as
 * 1:27am the next day, and how an evening's traffic was counted against
 * tomorrow. Every call that formats a real instant goes through here.
 *
 * Fixed rather than the viewer's own locale on purpose. This is one person's
 * business: a release date, an appearance, a booking window and an inquiry
 * timestamp all mean "Dean's time", and should read the same whether the page
 * is opened at home or in another timezone.
 *
 * Two things are deliberately *not* covered. A `date` column — a deadline, a
 * first-15 date — carries no timezone at all; "2026-08-15" is that day
 * everywhere, and converting it would introduce the very shift this exists to
 * prevent. And durations or counts are not dates.
 */
export const SITE_TIMEZONE = "America/Los_Angeles";

const base = { timeZone: SITE_TIMEZONE } as const;

/** "Aug 8, 6:27 PM" */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", {
    ...base,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Aug 8" */
export function formatDayLabel(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { ...base, month: "short", day: "numeric" });
}

/** "Aug 8, 2026" */
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    ...base,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "July 2026" */
export function formatMonthYear(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { ...base, month: "long", year: "numeric" });
}

/** "Sat, October 24, 2026" */
export function formatLongDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    ...base,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "6:27 PM" */
export function formatTimeOfDay(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-US", {
    ...base,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The Pacific calendar date a timestamp falls on, as YYYY-MM-DD.
 *
 * Bucketing on `iso.slice(0, 10)` takes the UTC date, which puts anything after
 * 4pm Pacific (5pm in winter) on the following day. en-CA is used because it
 * formats as YYYY-MM-DD, which sorts correctly as a string.
 */
export function pacificDateKey(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", base);
}

/** Today, in Pacific, as YYYY-MM-DD. */
export function pacificToday(): string {
  return pacificDateKey(new Date());
}

/**
 * A date-only value ("2026-07-17") as the instant of noon Pacific that day.
 *
 * Storing midnight puts the timestamp an hour from the previous day in any
 * negative-offset zone, which is how a July release date could print as June.
 * Noon is far enough from either boundary that no formatting can move it.
 */
export function dateOnlyToPacificNoon(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  // Pacific is UTC-7 in daylight time and UTC-8 in standard time; 20:00Z is
  // noon or 1pm Pacific, comfortably mid-afternoon either way.
  return `${ymd}T20:00:00.000Z`;
}
