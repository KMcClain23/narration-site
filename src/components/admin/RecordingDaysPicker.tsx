"use client";

import {
  DAY_LABEL,
  setRecordingDays,
  useRecordingDays,
  type Weekday,
} from "@/lib/recording-days";

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Pick the days of the week that get recorded in.
 *
 * The choice is shared by every card rather than set per book, because it
 * describes the week rather than the project. Changing it here re-divides every
 * board card's hours immediately.
 */
export function RecordingDaysPicker() {
  const days = useRecordingDays();

  const toggle = (d: Weekday) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    // Clearing the last day falls back to the default rather than dividing the
    // work over no days at all.
    setRecordingDays(next);
  };

  return (
    <div className="flex flex-wrap gap-1">
      {ORDER.map(d => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            aria-pressed={on}
            className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
              on
                ? "border-accent-amber bg-accent-amber/15 text-accent-amber-bright"
                : "border-surface-border text-text-muted hover:text-text-primary"
            }`}
          >
            {DAY_LABEL[d]}
          </button>
        );
      })}
    </div>
  );
}
