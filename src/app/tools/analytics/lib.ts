// Pure calculation helpers for the career-metrics dashboard. Deliberately no
// "use client" — this file is imported by the server-component page as well
// as passed data structures (not functions) into client chart components.

import { estimatedEarnings } from "@/components/admin/board-card-utils";

export type AnalyticsCard = {
  status: string | null;
  released_at: string | null;
  word_count: number | null;
  payment_type: string | null;
  pfh_rate: number | null;
  narration_format: string | null;
  narrator_share_percent: number | null;
  tags: string[] | null;
  author: string | null;
};

export type AuthorRow = { id: string; name: string; photo_url: string | null };

export type Quarter = { label: string; start: Date; end: Date };

export type ChartDatum = { label: string; value: number };

export type Collaborator = { name: string; photo_url: string | null; count: number };

// Board_cards has no per-narrator split by default — narration_format drives
// a default share (solo/unset = 100%, duet/dual = 50%, multicast = 0/hidden),
// same convention as the Production tab's Estimated Earnings (Stage 7.7).
function shareFor(card: AnalyticsCard): number {
  if (card.narration_format === "multicast") return 0;
  if (card.narrator_share_percent != null) return card.narrator_share_percent / 100;
  if (card.narration_format === "duet" || card.narration_format === "dual") return 0.5;
  return 1;
}

/**
 * `wordsPerFinishedHour` is a parameter rather than a constant so this file stays
 * pure — it is imported by the server page and by client chart components alike, and
 * a fetch here would break both. The server page reads it once and passes it in.
 */
export function computeCareerTotals(cards: AnalyticsCard[], wordsPerFinishedHour: number) {
  const released = cards.filter(c => c.status === "released");
  const booksReleased = released.length;
  const hoursNarrated = released.reduce((sum, c) => {
    if (!c.word_count) return sum;
    return sum + (c.word_count / wordsPerFinishedHour) * shareFor(c);
  }, 0);
  return { booksReleased, hoursNarrated };
}

function quarterOf(date: Date): { year: number; q: number } {
  return { year: date.getFullYear(), q: Math.floor(date.getMonth() / 3) + 1 };
}

function quarterBounds(year: number, q: number): { start: Date; end: Date } {
  const start = new Date(year, (q - 1) * 3, 1);
  const end = new Date(year, q * 3, 1); // exclusive upper bound
  return { start, end };
}

// Trailing 4 completed quarters + current, oldest → current, e.g.
// ["Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026"].
export function getTrailing5Quarters(now = new Date()): Quarter[] {
  const { year, q } = quarterOf(now);
  const quarters: Quarter[] = [];
  for (let i = 4; i >= 0; i--) {
    let yy = year;
    let qq = q - i;
    while (qq <= 0) {
      qq += 4;
      yy -= 1;
    }
    const { start, end } = quarterBounds(yy, qq);
    quarters.push({ label: `Q${qq} ${yy}`, start, end });
  }
  return quarters;
}

export function computeReleasePace(cards: AnalyticsCard[], quarters: Quarter[]): ChartDatum[] {
  return quarters.map(qtr => {
    const value = cards.filter(c => {
      if (c.status !== "released" || !c.released_at) return false;
      const d = new Date(c.released_at);
      return d >= qtr.start && d < qtr.end;
    }).length;
    return { label: qtr.label, value };
  });
}

// "Calculable earnings" per spec: payment_type in pfh/rs_plus AND word_count
// AND pfh_rate all set. Multicast is additionally excluded here — its share
// is unknowable by existing convention (estimatedEarnings returns null),
// so counting it would silently drag the average toward zero.
function isEarningsEligible(c: AnalyticsCard): boolean {
  return (
    (c.payment_type === "pfh" || c.payment_type === "rs_plus") &&
    !!c.word_count &&
    !!c.pfh_rate &&
    c.narration_format !== "multicast"
  );
}

function cardEarnings(c: AnalyticsCard, wordsPerFinishedHour: number): number {
  return estimatedEarnings(
    c.word_count, c.pfh_rate, c.payment_type, c.narration_format, c.narrator_share_percent,
    wordsPerFinishedHour,
  ) ?? 0;
}

export function computeEarnings(cards: AnalyticsCard[], quarters: Quarter[], wordsPerFinishedHour: number) {
  const eligible = cards.filter(isEarningsEligible);
  const totalEarnings = eligible.reduce((sum, c) => sum + cardEarnings(c, wordsPerFinishedHour), 0);
  const avgPerBook = eligible.length > 0 ? totalEarnings / eligible.length : null;

  const released = eligible.filter(c => c.status === "released" && c.released_at);
  const quarterly: ChartDatum[] = quarters.map(qtr => {
    const value = released
      .filter(c => {
        const d = new Date(c.released_at as string);
        return d >= qtr.start && d < qtr.end;
      })
      .reduce((sum, c) => sum + cardEarnings(c, wordsPerFinishedHour), 0);
    return { label: qtr.label, value };
  });

  const thisQuarterTotal = quarterly[quarterly.length - 1]?.value ?? 0;

  return { avgPerBook, thisQuarterTotal, quarterly };
}

export function computeGenreBreakdown(cards: AnalyticsCard[]): ChartDatum[] {
  const released = cards.filter(c => c.status === "released");
  const counts: Record<string, number> = {};
  for (const c of released) {
    for (const tag of c.tags ?? []) {
      const key = tag.trim();
      if (!key) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

// Matches the same case-insensitive/trim string convention used to link
// board_cards.author to an authors row elsewhere (see
// contacts/authors/[slug]/page.tsx). Counts all cards regardless of status —
// a collaboration relationship is real whether the book has shipped or not.
// Author strings with no matching authors row are skipped entirely, since
// the section is about relationships that require a real authors row.
export function computeFrequentCollaborators(cards: AnalyticsCard[], authors: AuthorRow[]): Collaborator[] {
  const authorByKey = new Map<string, AuthorRow>();
  for (const a of authors) {
    authorByKey.set(a.name.trim().toLowerCase(), a);
  }

  const counts = new Map<string, number>();
  for (const c of cards) {
    const key = c.author?.trim().toLowerCase();
    if (!key || !authorByKey.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: Collaborator[] = [];
  for (const [key, count] of counts) {
    if (count < 2) continue;
    const a = authorByKey.get(key)!;
    result.push({ name: a.name, photo_url: a.photo_url, count });
  }
  return result.sort((a, b) => b.count - a.count);
}
