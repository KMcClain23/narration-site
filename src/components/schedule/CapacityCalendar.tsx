"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate, toISODate } from "@/components/admin/board-card-utils";
import {
  buildCalendar,
  fitBook,
  totalFree,
  DEFAULT_DAILY_CAPACITY,
  type CapacityCard,
} from "@/lib/capacity";

/**
 * Where the work already is, and where another book would go.
 *
 * The board says what each project needs. This is the same information asked
 * the other way round: given everything already promised, what is actually
 * free, and is a ten-hour book finished before someone needs it. Answering
 * that by looking at four cards and doing arithmetic is how a narrator ends up
 * saying yes to a month that was already full.
 */

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HORIZON_DAYS = 120;

/** Book sizes worth asking about, in hours at the mic. */
const SIZES = [5, 10, 20];

function column(day: number): number {
  return (day + 6) % 7;
}

function fmt(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CapacityCalendar({ cards }: { cards: CapacityCard[] }) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const [capacity, setCapacity] = useState(DEFAULT_DAILY_CAPACITY);
  const [asking, setAsking] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  const calendar = useMemo(
    () => buildCalendar(cards, HORIZON_DAYS, capacity, today),
    [cards, capacity, today],
  );
  const byDate = useMemo(() => new Map(calendar.map(d => [d.date, d])), [calendar]);

  const free = totalFree(calendar);
  const fit = asking ? fitBook(asking, calendar) : null;
  const fitDays = useMemo(() => new Map((fit?.days ?? []).map(d => [d.date, d.hours])), [fit]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(column(first.getDay())).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(cursor.y, cursor.m, i + 1))),
  ];

  const step = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="rounded-xl border border-surface-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
        <span className={adminType.monoNum}>
          <span className="text-accent-amber-bright">{free.toFixed(0)} hrs</span> free over the next{" "}
          {HORIZON_DAYS} days
        </span>
        <label className="flex items-center gap-2">
          <span className={adminType.small}>A full day is</span>
          <input
            type="number"
            min={1}
            max={12}
            step={0.5}
            value={capacity}
            onChange={e => setCapacity(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded-md border border-surface-border bg-background px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
          />
          <span className={adminType.small}>hrs</span>
        </label>
      </div>

      {/* The actual question, asked in one click. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-border px-4 py-3">
        <span className={adminType.small}>Could I take on</span>
        {SIZES.map(h => (
          <button
            key={h}
            type="button"
            onClick={() => setAsking(asking === h ? null : h)}
            className={`rounded-md border px-2.5 py-1 text-[13px] transition-colors ${
              asking === h
                ? "border-accent-amber bg-accent-amber/15 text-accent-amber-bright"
                : "border-surface-border text-text-muted hover:text-text-primary"
            }`}
          >
            {h} hrs
          </button>
        ))}
        {asking != null &&
          (fit ? (
            <span className={`${adminType.small} ml-1`}>
              <span className="text-text-body">
                Yes, finished by {fmt(fit.finishBy)}
              </span>{" "}
              over {fit.days.length} day{fit.days.length === 1 ? "" : "s"}, leaving{" "}
              {fit.spareAfter.toFixed(0)} hrs spare
            </span>
          ) : (
            <span className={`${adminType.small} ml-1 text-alert-red`}>
              Not in the next {HORIZON_DAYS} days at {capacity} hrs a day.
            </span>
          ))}
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-md p-1 text-text-muted hover:text-text-primary">
            <ChevronLeft size={16} />
          </button>
          <span className={adminType.bodyMd}>
            {new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className="rounded-md p-1 text-text-muted hover:text-text-primary">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DOW.map(d => (
            <span key={d} className="pb-1 text-center text-[11px] text-text-faint">
              {d}
            </span>
          ))}

          {cells.map((iso, i) => {
            if (!iso) return <span key={`pad-${i}`} />;
            const day = byDate.get(iso);
            const proposed = fitDays.get(iso);
            const committed = day?.committed ?? 0;
            const full = day ? day.free <= 0.005 : false;

            return (
              <div
                key={iso}
                title={
                  day?.commitments.length
                    ? day.commitments.map(c => `${c.title}: ${c.hours.toFixed(1)} hrs`).join("\n")
                    : undefined
                }
                className={`min-h-[52px] rounded-md border px-1.5 py-1 ${
                  proposed
                    ? "border-accent-amber bg-accent-amber/15"
                    : full
                      ? "border-alert-red/30 bg-alert-red/5"
                      : committed > 0.005
                        ? "border-surface-border bg-surface"
                        : "border-transparent"
                } ${!day ? "opacity-40" : ""}`}
              >
                <span className="text-[12px] text-text-muted">{Number(iso.slice(8, 10))}</span>

                {committed > 0.005 && (
                  <p className={`text-[12px] leading-tight ${full ? "text-alert-red" : "text-text-body"}`}>
                    {committed.toFixed(1)}
                    {day?.assumed && <span className="text-text-faint">*</span>}
                  </p>
                )}
                {/* The proposed book, shown on the days it would actually use
                    rather than as a total somewhere else. */}
                {proposed && (
                  <p className="text-[12px] font-medium leading-tight text-accent-amber-bright">
                    +{proposed.toFixed(1)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className={`${adminType.small} mt-3`}>
          Numbers are hours already committed that day. An asterisk means the book has no chosen
          recording days yet, so its hours are spread across weekdays to its deadline.
        </p>
      </div>
    </div>
  );
}
