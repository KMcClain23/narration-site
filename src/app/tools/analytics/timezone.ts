/**
 * Every date and time on the analytics page, in Pacific.
 *
 * These are server components, so the default locale formatting ran in the
 * *server's* timezone, and Vercel runs functions in UTC. A demo played at
 * 11:27pm Pacific was being listed as "Aug 8, 6:27 AM" the next day, and the
 * daily buckets were split on UTC midnight rather than Pacific midnight — so
 * an evening's traffic was being counted against tomorrow.
 *
 * Pacific rather than the viewer's own timezone because this is one person's
 * dashboard about their own working day, and it should read the same whether
 * they open it at home or somewhere else.
 */
export const SITE_TIMEZONE = "America/Los_Angeles";

/** "Aug 8, 6:27 PM" in Pacific. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: SITE_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Aug 8" in Pacific. */
export function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: SITE_TIMEZONE,
    month: "short",
    day: "numeric",
  });
}

/**
 * The Pacific calendar date a timestamp falls on, as YYYY-MM-DD.
 *
 * Bucketing on `iso.slice(0, 10)` takes the UTC date, which puts anything
 * after 4pm Pacific (5pm in winter) on the following day's bar. en-CA is used
 * because it formats as YYYY-MM-DD, which sorts correctly as a string.
 */
export function pacificDateKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-CA", { timeZone: SITE_TIMEZONE });
}
