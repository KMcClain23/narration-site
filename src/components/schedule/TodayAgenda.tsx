"use client";

import { useMemo } from "react";
import { adminType } from "@/lib/design-tokens";
import { narrationPlan, parseLocalDate, toISODate } from "@/components/admin/board-card-utils";
import type { CapacityCard, TimeBlock } from "@/lib/capacity";

/**
 * What today actually asks of you.
 *
 * The calendar below answers a planning question across four months. This
 * answers the only one that matters before opening the booth: what am I
 * recording today, for how long, and what is about to come due. Deliberately
 * no capacity arithmetic — the point is the list, not the budget.
 */

const DEADLINE_HORIZON_DAYS = 7;

function fmtLong(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function TodayAgenda({
  cards,
  blocks,
}: {
  cards: CapacityCard[];
  blocks: TimeBlock[];
}) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const todayISO = toISODate(today);

  // Only books with days actually chosen. A book whose hours are merely
  // assumed across every weekday is not something you planned to record today,
  // and listing it would make the agenda a list of everything, always.
  const recording = useMemo(
    () =>
      cards
        .filter(c => (c.recording_dates ?? []).includes(todayISO))
        .map(c => {
          const plan = narrationPlan(
            c.word_count,
            c.narration_format,
            c.narrator_share_percent,
            c.deadline,
            { dates: c.recording_dates },
          );
          return { id: c.id, title: c.title, hours: plan?.hoursPerDay ?? null };
        }),
    [cards, todayISO],
  );

  const todayBlocks = blocks.filter(b => b.on_date === todayISO);

  const hours =
    recording.reduce((s, r) => s + (r.hours ?? 0), 0) +
    todayBlocks.reduce((s, b) => s + (Number(b.hours) || 0), 0);

  const soon = useMemo(() => {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + DEADLINE_HORIZON_DAYS);
    const limitISO = toISODate(limit);
    return cards
      .filter(c => c.deadline && c.deadline >= todayISO && c.deadline <= limitISO)
      .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  }, [cards, today, todayISO]);

  const nothing = recording.length === 0 && todayBlocks.length === 0;

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <p className={adminType.label}>Today</p>
      <p className={`${adminType.bodyMd} mt-0.5`}>{fmtLong(today)}</p>

      <div className="mt-3 border-t border-divider pt-3">
        {nothing ? (
          <p className={adminType.small}>Nothing scheduled at the mic.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {recording.map(r => (
                <div key={r.id} className="flex items-baseline justify-between gap-2">
                  <span className={`${adminType.body} truncate`}>{r.title}</span>
                  {r.hours != null && (
                    <span className={`${adminType.monoNum} shrink-0`}>{r.hours.toFixed(1)} hrs</span>
                  )}
                </div>
              ))}
              {todayBlocks.map(b => (
                <div key={b.id} className="flex items-baseline justify-between gap-2">
                  <span className={`${adminType.small} truncate italic`}>{b.label}</span>
                  <span className={`${adminType.monoNum} shrink-0`}>
                    {(Number(b.hours) || 0).toFixed(1)} hrs
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-baseline justify-between border-t border-divider pt-2">
              <span className={adminType.small}>At the mic</span>
              <span className={`${adminType.monoNum} text-accent-amber-bright`}>
                {hours.toFixed(1)} hrs
              </span>
            </div>
          </>
        )}
      </div>

      {/* Not booth time, but the thing most likely to change what today should
          have been. A deadline four days out is worth seeing beside it. */}
      {soon.length > 0 && (
        <div className="mt-3 border-t border-divider pt-3">
          <p className={adminType.label}>Due within {DEADLINE_HORIZON_DAYS} days</p>
          <div className="mt-1.5 space-y-1">
            {soon.map(c => (
              <div key={c.id} className="flex items-baseline justify-between gap-2">
                <span className={`${adminType.small} truncate`}>{c.title}</span>
                <span className={`${adminType.monoNum} shrink-0 ${c.deadline === todayISO ? "text-alert-red" : ""}`}>
                  {parseLocalDate(c.deadline!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
