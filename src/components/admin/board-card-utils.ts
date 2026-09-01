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

/**
 * The fraction of a manuscript this narrator actually reads.
 *
 * Null means genuinely unknown rather than "all of it": multicast has no
 * default split, so guessing 100% would double every figure derived from it.
 */
export function narratorShareOf(
  narrationFormat: string | null,
  narratorSharePercent: number | null,
): number | null {
  if (narratorSharePercent != null) return narratorSharePercent / 100;
  if (narrationFormat === "multicast") return null;
  return narrationFormat === "duet" || narrationFormat === "dual" ? 0.5 : 1;
}

/** Monday to Friday, used when no recording days have been chosen. */
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/**
 * Statuses where the narrating is still ahead of you.
 *
 * Everything after Recording is post: editing, released, and recast all mean
 * the mic work is finished or is not yours any more. Booth figures for those
 * are not merely useless, they are alarming — a book in Editing showed "no
 * recording days left" in red, which reads as a missed deadline rather than a
 * job done.
 */
const AT_MIC_STATUSES = new Set(["contracted", "prepping", "recording"]);

export function stillAtMic(status: string | null | undefined): boolean {
  return AT_MIC_STATUSES.has((status ?? "").trim());
}

/**
 * Days between `from` and `to` inclusive that fall on a recording day.
 *
 * `days` holds Date.getDay() numbers, 0 for Sunday. Which days those are is a
 * preference, not a fact about the week: a narrator who records Saturdays has
 * more room than one who does not, and that changes the answer.
 */
export function recordingDaysBetween(from: Date, to: Date, days: number[] = DEFAULT_DAYS): number {
  const wanted = new Set(days.length ? days : DEFAULT_DAYS);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let count = 0;
  for (const d = start; d <= end; d.setDate(d.getDate() + 1)) {
    if (wanted.has(d.getDay())) count++;
  }
  return count;
}

/**
 * When the recording actually happens.
 *
 * Dates win when there are any: a pattern says "Tuesdays", which cannot know
 * that one of those Tuesdays is a holiday. The pattern remains as the answer
 * for a book nobody has scheduled yet.
 */
export type RecordingSchedule = {
  dates?: string[] | null;
  pattern?: number[];
};

/** "YYYY-MM-DD" for a local date, which is how these are stored and compared. */
export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type NarrationPlan = {
  /**
   * Hours still to record.
   *
   * Remaining, not total: once recording has started, what is left is the only
   * figure that answers anything — how much of the week this needs, whether
   * another book fits, whether the deadline holds.
   */
  hours: number;
  /** The whole job, ignoring progress. For showing what remaining is a share of. */
  totalHours: number;
  /** 0 to 1. Zero when nothing has been recorded or nothing is known. */
  fractionDone: number;
  /** Recording days left including today. Null when the card has no deadline. */
  daysLeft: number | null;
  /** hours ÷ daysLeft. Null with no deadline, or when no day is left. */
  hoursPerDay: number | null;
  /** The deadline has passed, or no recording day is left before it. */
  overdue: boolean;
};

export type NarrationInput = {
  wordCount: number | null;
  narrationFormat: string | null;
  narratorSharePercent: number | null;
  deadline: string | null;
  /**
   * Required, and required on purpose.
   *
   * This was a trailing optional argument with a sensible-looking default, and
   * three separate surfaces forgot to pass it — the card modal, the sidebar
   * agenda, and the capacity calendar before it. Each one then answered at the
   * built-in rate while everything else used the rate from Settings, and every
   * one of them looked entirely reasonable in isolation. A missing rate is now
   * a build error rather than a number that is quietly wrong by a factor of
   * two.
   *
   * Manuscript words got through in an hour at the mic — not the same idea as
   * `wordsPerFinishedHour`, despite the similar number. That one converts a
   * manuscript into hours of finished audio, which is a billing unit. This one is a
   * working rate: how much of the book actually gets read in an hour of recording.
   * One answers what the job pays, the other how long it takes. Both now come from
   * Settings rather than from constants in this file.
   */
  /**
   * Null when the rate could not be read at all — a failed settings fetch, a
   * missing key, a stored value outside the bounds. A rate that could not be
   * read is not a rate, so the plan is not computable and this returns null
   * exactly as it does for a missing word count.
   */
  wordsPerHour: number | null;
  /** Words of this narrator's share already recorded. */
  wordsRecorded?: number;
  schedule?: RecordingSchedule;
  today?: Date;
};

/**
 * How long a book takes to narrate, and what that means per working day.
 *
 * Deliberately not gated on payment type the way estimatedEarnings is: a flat
 * fee book occupies exactly as much of the week as a per-finished-hour one.
 * Today counts as available, since it is a day you can still record in.
 */
export function narrationPlan(input: NarrationInput): NarrationPlan | null {
  const {
    wordCount,
    narrationFormat,
    narratorSharePercent,
    deadline,
    wordsPerHour,
    wordsRecorded = 0,
    schedule = {},
    today = new Date(),
  } = input;

  if (!wordCount || wordCount <= 0) return null;
  const share = narratorShareOf(narrationFormat, narratorSharePercent);
  if (share == null) return null;

  // No fallback. The comment on wordsPerHour above has always said a missing rate
  // should be a build error rather than a number quietly wrong by a factor of two;
  // this line said otherwise and won, silently answering at 9,200 whenever a caller
  // passed nothing usable. A rate that is not known means the plan is not known.
  if (wordsPerHour == null || wordsPerHour <= 0) return null;
  const rate = wordsPerHour;
  const shareWords = wordCount * share;
  // Clamped at both ends: a recorded figure larger than the share would
  // otherwise produce negative hours left, which reads as time owed back.
  const done = Math.min(Math.max(wordsRecorded, 0), shareWords);
  const totalHours = shareWords / rate;
  const fractionDone = shareWords > 0 ? done / shareWords : 0;
  const hours = (shareWords - done) / rate;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayISO = toISODate(midnight);
  const chosen = schedule.dates ?? [];

  // Dates that have not happened yet. A day already recorded is not a day the
  // remaining work can be spread over, whether or not it was used.
  if (chosen.length) {
    const ahead = chosen.filter(d => d >= todayISO && (!deadline || d <= deadline));
    if (ahead.length === 0) return { hours, totalHours, fractionDone, daysLeft: 0, hoursPerDay: null, overdue: true };
    return { hours, totalHours, fractionDone, daysLeft: ahead.length, hoursPerDay: hours / ahead.length, overdue: false };
  }

  if (!deadline) return { hours, totalHours, fractionDone, daysLeft: null, hoursPerDay: null, overdue: false };

  const due = parseLocalDate(deadline);
  if (due < midnight) return { hours, totalHours, fractionDone, daysLeft: 0, hoursPerDay: null, overdue: true };

  const daysLeft = recordingDaysBetween(midnight, due, schedule.pattern ?? DEFAULT_DAYS);
  // A deadline can fall inside a stretch with no recording day in it at all —
  // a Sunday deadline for someone who records weekdays only. Dividing by zero
  // there would read as Infinity hours a day.
  if (daysLeft === 0) return { hours, totalHours, fractionDone, daysLeft: 0, hoursPerDay: null, overdue: true };

  return { hours, totalHours, fractionDone, daysLeft, hoursPerDay: hours / daysLeft, overdue: false };
}

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
  /**
   * Required, and required on purpose — the same reasoning as
   * `NarrationInput.wordsPerHour` above, which this deliberately mirrors.
   *
   * This function used to hold its own finished-hour constant, so no
   * caller could pass a rate even if it wanted to, and Settings displayed a
   * finished-hour value that nothing in the app read. An optional parameter with a
   * default here would recreate exactly that: the compiler is the only thing that
   * reliably catches a forgotten rate, and this file's own history — a stale 9,300
   * billing at a different rate than the rest of the app — is what that costs.
   */
  /** Null when it could not be read. No earnings figure, rather than a guessed one. */
  wordsPerFinishedHour: number | null,
): number | null {
  if (paymentType !== "pfh" && paymentType !== "rs_plus") return null;
  if (!wordCount || !pfhRate) return null;
  // Same rule as narrationPlan: no rate, no figure. Reached when the settings
  // read failed, the key is missing, or the stored value is outside the bounds.
  if (wordsPerFinishedHour == null || wordsPerFinishedHour <= 0) return null;
  // Multicast has no knowable DEFAULT split, which is why it bails — but an
  // explicit per-card share is precisely the answer to that question, so it
  // is honored when set. Previously this returned null before ever reading
  // narratorSharePercent, contradicting the contract described above.
  const share = narratorShareOf(narrationFormat, narratorSharePercent);
  if (share == null) return null;
  const hours = wordCount / wordsPerFinishedHour;
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
  /** Chosen recording days, "YYYY-MM-DD". Empty means none picked yet. */
  recording_dates: string[] | null;
  /** Words of this narrator's share already recorded. */
  words_recorded: number | null;
  /**
   * Somebody outside is doing the post.
   *
   * WHO SAID SO MATTERS. Null `edited_externally_by` means Dean marked it — "a
   * production company is editing this". A uuid means an editor did, which is
   * the weaker claim "I am not editing this". They have the same effect on her
   * list and are not the same statement, so the board says which.
   */
  edited_externally: boolean | null;
  edited_externally_by: string | null;
  edited_externally_by_name?: string | null;
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
