// Pure helpers shared between BoardCard (client) and server components that
// need the same date/urgency logic (e.g. the Schedule page's Due Soon rows).
// Deliberately has no "use client" directive — Next.js treats every export
// from a "use client" module as a client-only reference, even pure
// functions, so anything a server component needs must live outside one.

// Parses "YYYY-MM-DD" as a LOCAL date (matching the existing board/page.tsx
// convention) — `new Date("YYYY-MM-DD")` parses as UTC midnight, which can
// silently shift a day in negative-UTC-offset timezones.
/**
 * Parse a date-only column ("2026-08-15") without a timezone conversion.
 *
 * Deliberately not `new Date(s)`, which reads a bare date as UTC midnight and
 * then displays it a day early anywhere west of Greenwich. A `date` column has
 * no timezone: that day is that day everywhere, so it is built field by field
 * and formatted in the same zone it was parsed in. Callers of this must not add
 * an explicit timeZone when formatting — that would reintroduce exactly the
 * shift this avoids. Instants (timestamptz) are the opposite case and go
 * through src/lib/timezone.ts.
 */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysUntil(s: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(s).getTime() - today.getTime()) / 86400000);
}

// Pre-declared complete class strings (not built via template literals) so
// Tailwind's static scanner actually picks them up — arbitrary-value classes
// assembled at runtime from a JS variable never get compiled.
export const URGENCY_PILL = {
  default: "text-text-body bg-text-body/15",
  yellow: "text-accent-amber-bright bg-accent-amber-bright/15",
  red: "text-alert-red bg-alert-red/15",
} as const;

export type Urgency = keyof typeof URGENCY_PILL;

export function completionUrgency(days: number): Urgency {
  if (days <= 7) return "red";
  if (days <= 30) return "yellow";
  return "default";
}

const WORDS_PER_FINISHED_HOUR = 9400;

// Board-card display estimate — same ratio as the Production tab's
// Estimated Earnings block in CardEditModal. board_cards has no per-narrator
// split by default, so narration_format drives a share: solo/unset = 100%,
// duet/dual = 50%, multicast = unknowable and hidden entirely. A per-card
// narratorSharePercent (Stage 7.7) overrides that default for any format
// when set — 1-99, enforced by a DB CHECK constraint. Returns null whenever
// any required input is missing — callers hide the line in that case.
export function estimatedEarnings(
  wordCount: number | null,
  pfhRate: number | null,
  paymentType: string | null,
  narrationFormat: string | null,
  narratorSharePercent: number | null,
): number | null {
  if (paymentType !== "pfh" && paymentType !== "rs_plus") return null;
  if (!wordCount || !pfhRate) return null;
  if (narrationFormat === "multicast") return null;
  const hours = wordCount / WORDS_PER_FINISHED_HOUR;
  const share = narratorSharePercent != null
    ? narratorSharePercent / 100
    : narrationFormat === "duet" || narrationFormat === "dual" ? 0.5 : 1;
  return hours * pfhRate * share;
}

// board_cards.co_narrator is a `text` column, not a native Postgres array —
// it holds a JSON-encoded array string in most rows, but at least one live
// row is a bare non-JSON string. This defensive parse handles both; there is
// no Postgres-level array operator that can be used against this column as
// stored today (confirmed empirically — see Stage 4.2 planning notes).
export type BoardV2Card = {
  id: string;
  title: string;
  author: string;
  co_narrator: string | null;
  cover_url: string | null;
  status: string;
  deadline: string | null;
  first15_due: string | null;
  first_15_complete: boolean;
  word_count: number | null;
  pfh_rate: number | null;
  payment_type: string | null;
  is_confidential: boolean;
  narration_format: string | null;
  narrator_share_percent: number | null;
  created_at: string;
};

export function parseCoNarrators(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(Boolean) : p ? [String(p)] : [];
  } catch {
    return [raw];
  }
}
