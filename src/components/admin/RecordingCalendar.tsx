"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate, toISODate } from "./board-card-utils";

/**
 * Pick the actual days this book gets recorded on.
 *
 * A weekly pattern could say "Tuesdays" but not that one of those Tuesdays is
 * a conference. Real dates can, and every date added or removed re-divides the
 * remaining hours immediately, which is the whole point: the question is not
 * how long the book takes but whether the next one fits around it.
 *
 * Weekends are selectable. Nothing here decides which days are working days.
 */

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first column for a JS day number, where 0 is Sunday. */
function column(day: number): number {
  return (day + 6) % 7;
}

function monthLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function RecordingCalendar({
  value,
  onChange,
  deadline,
  hours,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  deadline: string | null;
  /** Total hours to spread, so the effect of each click can be shown live. */
  hours: number;
}) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);
  const todayISO = toISODate(today);

  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  const selected = useMemo(() => new Set(value), [value]);

  // Only days still ahead can carry work, so only those are counted — the same
  // rule narrationPlan applies, kept identical so the two never disagree.
  const ahead = value.filter(d => d >= todayISO && (!deadline || d <= deadline));
  const perDay = ahead.length > 0 ? hours / ahead.length : null;

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = column(first.getDay());
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(cursor.y, cursor.m, i + 1))),
  ];

  const toggle = (iso: string) => {
    onChange(selected.has(iso) ? value.filter(d => d !== iso) : [...value, iso].sort());
  };

  /**
   * Drag across days to add or remove a run of them.
   *
   * The mode is decided by the day the drag starts on: begin on an empty day
   * and the drag adds, begin on a chosen one and it clears. That makes one
   * gesture both "book this week" and "I am away that week", which is how the
   * question actually arrives.
   */
  const dragMode = useRef<"add" | "remove" | null>(null);

  const apply = useCallback(
    (iso: string) => {
      const mode = dragMode.current;
      if (!mode) return;
      const has = selected.has(iso);
      if (mode === "add" && !has) onChange([...value, iso].sort());
      else if (mode === "remove" && has) onChange(value.filter(d => d !== iso));
    },
    [onChange, selected, value],
  );

  // Released anywhere, not just over the grid: a drag that ends off the
  // calendar must not leave the next hover still painting days.
  useEffect(() => {
    const end = () => {
      dragMode.current = null;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const step = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  /** Every weekday from today to the deadline, as a starting point worth editing. */
  const fillWeekdays = () => {
    if (!deadline) return;
    const end = parseLocalDate(deadline);
    const out: string[] = [];
    for (const d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) out.push(toISODate(d));
    }
    onChange(out);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="rounded-md p-1 text-text-muted hover:text-text-primary"
        >
          <ChevronLeft size={16} />
        </button>
        <span className={adminType.bodyMd}>{monthLabel(cursor.y, cursor.m)}</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="rounded-md p-1 text-text-muted hover:text-text-primary"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* select-none so dragging paints days instead of highlighting numbers;
          touch-none so the same gesture on a phone does not scroll the page. */}
      <div className="grid touch-none select-none grid-cols-7 gap-1">
        {DOW.map(d => (
          <span key={d} className="pb-1 text-center text-[11px] text-text-faint">
            {d}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (!iso) return <span key={`pad-${i}`} />;
          const past = iso < todayISO;
          const beyond = Boolean(deadline) && iso > deadline!;
          const on = selected.has(iso);
          const isDeadline = iso === deadline;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggle(iso)}
              onPointerDown={() => {
                if (past) return;
                dragMode.current = selected.has(iso) ? "remove" : "add";
              }}
              // Enter rather than move: one event per day crossed, so a fast
              // drag cannot skip a cell or fire fifty times inside one.
              onPointerEnter={() => {
                if (!past) apply(iso);
              }}
              disabled={past}
              aria-pressed={on}
              title={isDeadline ? "Deadline" : beyond ? "After the deadline" : undefined}
              className={`relative rounded-md py-1.5 text-[13px] transition-colors ${
                on
                  ? "bg-accent-amber text-background font-medium"
                  : past
                    ? "text-text-faint/50 cursor-not-allowed"
                    : beyond
                      ? "text-text-faint hover:text-text-muted"
                      : "text-text-body hover:bg-surface-raised"
              }`}
            >
              {Number(iso.slice(8, 10))}
              {/* The deadline marked on the grid rather than described above it,
                  so the days that count are obvious while clicking. */}
              {isDeadline && (
                <span
                  className={`absolute inset-x-1 bottom-0.5 h-[2px] rounded-full ${on ? "bg-background/70" : "bg-alert-red"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={fillWeekdays}
          disabled={!deadline}
          className="text-[13px] text-text-muted hover:text-text-primary disabled:opacity-40"
        >
          Weekdays to deadline
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[13px] text-text-muted hover:text-text-primary"
        >
          Clear
        </button>
      </div>

      <p className={`${adminType.small} mt-2`}>
        {ahead.length === 0 ? (
          value.length > 0 ? (
            <span className="text-alert-red">Every day chosen has already passed.</span>
          ) : (
            "No days chosen yet, so the estimate above counts weekdays."
          )
        ) : (
          <>
            <span className="text-text-body">
              {ahead.length} day{ahead.length === 1 ? "" : "s"} ahead
            </span>
            {perDay != null && (
              <>
                {" · "}
                <span className="text-accent-amber-bright">{perDay.toFixed(1)} hrs each</span>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
