// Pure bucketing/sorting/filtering logic shared by DesktopBoardColumns and
// MobileBoardList — deliberately has no "use client" directive, matching the
// convention in board-card-utils.ts (this file lives in a component
// directory but is imported by "use client" components, not a page).

import { parseLocalDate, daysUntil, type BoardV2Card } from "@/components/admin/board-card-utils";

export type PipelineBucket = "thisWeek" | "thisMonth" | "later";
export const PIPELINE_BUCKETS: { id: PipelineBucket; label: string }[] = [
  { id: "thisWeek", label: "This Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "later", label: "Later" },
];

export const PRODUCTION_SUBGROUPS = [
  { id: "prepping", label: "Prepping" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
] as const;

export type DateFilter = "week" | "month" | null;

export function pipelineBucketFor(card: BoardV2Card): PipelineBucket {
  if (!card.deadline) return "later";
  const days = daysUntil(card.deadline);
  if (days <= 7) return "thisWeek";
  if (days <= 30) return "thisMonth";
  return "later";
}

// Ascending completion date (no-date sorts last); ties → newest created_at first.
export function compareCards(a: BoardV2Card, b: BoardV2Card): number {
  const aTime = a.deadline ? parseLocalDate(a.deadline).getTime() : Infinity;
  const bTime = b.deadline ? parseLocalDate(b.deadline).getTime() : Infinity;
  if (aTime !== bTime) return aTime - bTime;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

// "Due this week/month" chips answer "what needs MY attention" — once a book
// moves to editing, the remaining deadline is the editor's responsibility,
// not the narrator's, so editing-stage cards never match these chips (they
// still render normally in their subgroup, just won't highlight as due-soon).
const ATTENTION_STATUSES = new Set(["contracted", "prepping", "recording"]);

export function passesDateFilter(card: BoardV2Card, filter: DateFilter): boolean {
  if (!filter) return true;
  if (!card.deadline || !ATTENTION_STATUSES.has(card.status)) return false;
  const days = daysUntil(card.deadline);
  return filter === "week" ? days <= 7 : days <= 30;
}

export function bucketPipeline(cards: BoardV2Card[]): Record<PipelineBucket, BoardV2Card[]> {
  const buckets: Record<PipelineBucket, BoardV2Card[]> = { thisWeek: [], thisMonth: [], later: [] };
  for (const c of cards) buckets[pipelineBucketFor(c)].push(c);
  (Object.keys(buckets) as PipelineBucket[]).forEach(k => buckets[k].sort(compareCards));
  return buckets;
}

export function bucketProduction(cards: BoardV2Card[]): Record<string, BoardV2Card[]> {
  const buckets: Record<string, BoardV2Card[]> = { prepping: [], recording: [], editing: [] };
  for (const c of cards) buckets[c.status]?.push(c);
  Object.keys(buckets).forEach(k => buckets[k].sort(compareCards));
  return buckets;
}
