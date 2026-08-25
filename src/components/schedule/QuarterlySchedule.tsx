"use client";

import { useMemo, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { QuarterPickerSheet } from "./QuarterPickerSheet";
import {
  BAR_SEGMENTS,
  MONTH_FULL,
  STATUS_STYLES,
  monthsOfQuarter,
  quarterBounds,
  quarterFromIndex,
  quarterIndex,
  quarterLabel,
  quarterOfMonth,
  statusKeyFor,
  summariseMonth,
  type ScheduleGridCard,
} from "@/lib/schedule-capacity";

const PILL_STYLES: Record<string, string> = {
  open: "border-text-dim/40 text-text-muted",
  light: "border-capacity-light/50 text-capacity-light",
  busy: "border-accent-amber-bright/50 text-accent-amber-bright",
  full: "border-alert-red/50 text-alert-red",
};

function MonthCard({ cards, year, monthIndex }: { cards: ScheduleGridCard[]; year: number; monthIndex: number }) {
  const month = summariseMonth(cards, year, monthIndex);
  const statusKey = statusKeyFor(month.count);
  const style = STATUS_STYLES[statusKey];
  const filled = Math.min(month.count, BAR_SEGMENTS);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[18px] font-bold uppercase tracking-wide text-text-primary">
          {MONTH_FULL[monthIndex]} {year}
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${PILL_STYLES[statusKey]}`}
        >
          {style.label}
        </span>
      </div>

      {/* Dots rather than desktop's continuous bar: at this width the segments
          read as a count, which is the thing being communicated. */}
      <div className="mt-3 flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: BAR_SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < filled ? style.barClass : "bg-surface-border"}`}
          />
        ))}
      </div>
      <p className="sr-only">
        {month.count} {month.count === 1 ? "book" : "books"} due — {style.label}
      </p>

      {month.titles.length === 0 ? (
        <p className={`${adminType.small} mt-3`}>Nothing due</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {month.titles.map(title => (
            // No truncation: the card grows instead. A phone has the vertical
            // room a four-across desktop grid does not, and half a title is
            // not much use for deciding whether a month is spoken for.
            <li key={title} className="flex gap-2 text-[13px] text-text-body">
              <span aria-hidden className="text-text-dim">&bull;</span>
              <span className="min-w-0 flex-1">{title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuarterlySchedule({ cards }: { cards: ScheduleGridCard[] }) {
  // Read once per mount rather than per render: a Date built during render is
  // a new value every time and would make every memo below useless.
  const today = useMemo(() => new Date(), []);
  const currentIndex = quarterIndex(quarterOfMonth(today.getFullYear(), today.getMonth()));
  const { min, max } = useMemo(() => quarterBounds(cards, today), [cards, today]);

  const [index, setIndex] = useState(currentIndex);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const quarter = quarterFromIndex(index);
  const canGoBack = index > min;
  const canGoForward = index < max;

  // Every route to a different quarter — arrows, swipe, picker — goes through
  // here, so the slide direction is decided in one place and a tap and a swipe
  // produce the same motion without either knowing about the other.
  const goTo = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === index) return;
    setDirection(clamped > index ? "right" : "left");
    setIndex(clamped);
  };

  const swipeBind = useDrag(
    ({ last, movement: [mx, my] }) => {
      if (!last) return;
      // Same horizontal-dominance convention as the Book Edit modal's tab
      // swipe, so the two gestures feel like one idea.
      if (Math.abs(mx) < 60 || Math.abs(mx) < Math.abs(my) * 1.5) return;
      goTo(index + (mx < 0 ? 1 : -1));
    },
    { axis: "x", filterTaps: true }
  );

  const slideClass =
    direction === "right" ? "tab-slide-right" : direction === "left" ? "tab-slide-left" : "";

  const months = monthsOfQuarter(quarter);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={!canGoBack}
          aria-label="Previous quarter"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-border text-text-muted transition-colors disabled:opacity-30 enabled:hover:text-text-primary"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-lg px-3 py-1.5 text-[15px] font-bold text-text-primary transition-colors hover:bg-surface-raised"
        >
          {quarterLabel(quarter)}
        </button>

        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={!canGoForward}
          aria-label="Next quarter"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-border text-text-muted transition-colors disabled:opacity-30 enabled:hover:text-text-primary"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* touchAction pan-y so the horizontal gesture never costs the page its
          vertical scroll. Keyed by quarter so the slide replays on each
          change; the three cards hold no state, so remounting costs nothing. */}
      <div {...swipeBind()} style={{ touchAction: "pan-y" }} className="mt-4 select-none overflow-hidden">
        <div key={index} className={`space-y-3 ${slideClass}`}>
          {months.map(monthIndex => (
            <MonthCard key={monthIndex} cards={cards} year={quarter.year} monthIndex={monthIndex} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {(Object.keys(STATUS_STYLES) as (keyof typeof STATUS_STYLES)[]).map(key => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[key].barClass}`} />
            <span className={adminType.small}>{STATUS_STYLES[key].label}</span>
          </div>
        ))}
      </div>

      <QuarterPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        min={min}
        max={max}
        activeIndex={index}
        onPick={goTo}
      />
    </div>
  );
}
