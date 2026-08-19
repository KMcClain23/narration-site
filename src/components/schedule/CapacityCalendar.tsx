"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";
import { useStudioSettings } from "@/components/admin/useStudioSettings";
import { parseLocalDate, toISODate } from "@/components/admin/board-card-utils";
import {
  buildCalendar,
  fitBook,
  totalFree,
  type CapacityCard,
  type TimeBlock,
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

/**
 * One color per book, so a day reads without being hovered.
 *
 * Complete class strings, not built at runtime: Tailwind's scanner only sees
 * literals, and a class assembled from a variable never gets compiled.
 */
const BOOK_COLORS = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-rose-400",
  "bg-amber-400",
  "bg-teal-400",
  "bg-fuchsia-400",
  "bg-lime-400",
] as const;

/** Book sizes worth asking about, in hours at the mic. */
const SIZES = [5, 10, 20];

function column(day: number): number {
  return (day + 6) % 7;
}

function fmt(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Every day from `a` to `b` inclusive, as ISO strings. */
function range(a: string, b: string): string[] {
  const out: string[] = [];
  const end = parseLocalDate(b);
  for (const d = parseLocalDate(a); d <= end; d.setDate(d.getDate() + 1)) out.push(toISODate(d));
  return out;
}

/**
 * The book's days after dragging one end of its run to `to`.
 *
 * Dragging outward fills in every day crossed, weekends included — a narrator
 * stretching a run onto Saturday means Saturday, not "Saturday if it fits the
 * usual pattern". Dragging inward drops the days beyond the new edge and keeps
 * any gaps that were already in the middle of the run.
 */
function resize(dates: string[], edge: "start" | "end", to: string): string[] {
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (edge === "end") {
    if (to > last) return [...new Set([...sorted, ...range(last, to)])].sort();
    const kept = sorted.filter(d => d <= to);
    // Never leave a book with no days at all; one end has to survive.
    return kept.length ? kept : [first];
  }

  if (to < first) return [...new Set([...range(to, first), ...sorted])].sort();
  const kept = sorted.filter(d => d >= to);
  return kept.length ? kept : [last];
}

export function CapacityCalendar({
  cards,
  initialBlocks,
}: {
  cards: CapacityCard[];
  initialBlocks: TimeBlock[];
}) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const studio = useStudioSettings();
  // Seeded from Settings, still adjustable here for a what-if without going
  // and changing what a full day means everywhere.
  const [capacity, setCapacity] = useState<number | null>(null);
  const dayHours = capacity ?? studio.dailyCapacityHours;
  const [asking, setAsking] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  // Held locally and updated optimiztically: adding a block should redraw the
  // day under the cursor, not wait for a round trip and a page refresh.
  const [blocks, setBlocks] = useState<TimeBlock[]>(initialBlocks);
  const [picked, setPicked] = useState<string | null>(null);
  const [blockHours, setBlockHours] = useState("1");
  const [blockLabel, setBlockLabel] = useState("Pickups");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Dates changed here, before the server has been told.
   *
   * The calendar has to redraw as the run is dragged, not after a round trip:
   * the whole point of stretching a book onto another day is watching the
   * hours per day fall as you do it.
   */
  const [edited, setEdited] = useState<Map<string, string[]>>(new Map());
  // `next` lives on the ref rather than being read back out of state at commit
  // time: pointerup can land before the last hover's render has settled, and a
  // stale read would save the run one day short of where it was dropped.
  const drag = useRef<{ id: string; edge: "start" | "end"; from: string[]; next: string[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const liveCards = useMemo(
    () => cards.map(c => (edited.has(c.id) ? { ...c, recording_dates: edited.get(c.id)! } : c)),
    [cards, edited],
  );

  const datesFor = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of liveCards) map.set(c.id, [...(c.recording_dates ?? [])].sort());
    return map;
  }, [liveCards]);

  const calendar = useMemo(
    () => buildCalendar(liveCards, HORIZON_DAYS, dayHours, today, blocks, studio.wordsPerNarrationHour),
    [liveCards, dayHours, today, blocks, studio.wordsPerNarrationHour],
  );
  const byDate = useMemo(() => new Map(calendar.map(d => [d.date, d])), [calendar]);

  // Assigned once from the card list rather than per day, so a book keeps the
  // same color across every month it appears in.
  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach((c, i) => map.set(c.id, BOOK_COLORS[i % BOOK_COLORS.length]));
    return map;
  }, [cards]);

  const free = totalFree(calendar);
  const fit = asking ? fitBook(asking, calendar, undefined, studio.maxBooksPerDay) : null;
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

  /** Grab one end of a book's run. Which end is decided by the day grabbed. */
  function startResize(cardId: string, onDate: string) {
    const dates = datesFor.get(cardId);
    if (!dates?.length) return;
    const edge: "start" | "end" =
      onDate === dates[0] && onDate !== dates[dates.length - 1]
        ? "start"
        : onDate === dates[dates.length - 1]
          ? "end"
          : // Grabbed in the middle: move whichever end is nearer, so the drag
            // goes the way the hand is already going.
            Math.abs(+parseLocalDate(onDate) - +parseLocalDate(dates[0])) <
              Math.abs(+parseLocalDate(onDate) - +parseLocalDate(dates[dates.length - 1]))
            ? "start"
            : "end";
    drag.current = { id: cardId, edge, from: dates, next: dates };
    setDragging(cardId);
  }

  function dragTo(iso: string) {
    const d = drag.current;
    if (!d) return;
    if (iso < toISODate(today)) return;
    const next = resize(d.from, d.edge, iso);
    d.next = next;
    setEdited(m => new Map(m).set(d.id, next));
  }

  const commitResize = useCallback(async () => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (!d) return;

    const next = d.next;
    if (next.join() === d.from.join()) return;

    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, recording_dates: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Put it back rather than leaving the screen claiming something the
      // database does not agree with.
      setEdited(m => {
        const copy = new Map(m);
        copy.set(d.id, d.from);
        return copy;
      });
      setError("Could not save that change.");
    }
  }, []);

  useEffect(() => {
    const end = () => void commitResize();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [commitResize]);

  async function addBlock() {
    if (!picked) return;
    const hours = Number(blockHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Hours must be more than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/time-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on_date: picked, hours, label: blockLabel.trim() || "Pickups" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not add it.");
        return;
      }
      setBlocks(b => [...b, json.block]);
      setPicked(null);
    } catch {
      setError("Could not add it.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/time-blocks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setBlocks(b => b.filter(x => x.id !== id));
    } finally {
      setBusy(false);
    }
  }

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
            value={dayHours}
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
              over {fit.days.length} day{fit.days.length === 1 ? "" : "s"}
              {/* Said plainly, because it is the part worth arguing with. */}
              {fit.sharedDays > 0
                ? `, sharing ${fit.sharedDays} of them with another book`
                : ", every day to itself"}
            </span>
          ) : (
            <span className={`${adminType.small} ml-1 text-alert-red`}>
              Not in the next {HORIZON_DAYS} days at {dayHours} hrs a day.
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

        {/* select-none so dragging a run does not highlight the date numbers;
            touch-none so the same gesture on a phone does not scroll away. */}
        <div className="grid touch-none select-none grid-cols-7 gap-1">
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
            const books = day?.commitments.length ?? 0;
            // Two things can be wrong with a day, and they are different
            // problems: out of hours, or too many books in it.
            const full = day ? day.free <= 0.005 : false;
            const crowded = books > studio.maxBooksPerDay;

            return (
              <div
                key={iso}
                role="button"
                tabIndex={0}
                onClick={() => {
                  // A drag that ends on a cell must not also open the block
                  // editor for that day.
                  if (drag.current) return;
                  setPicked(p => (p === iso ? null : iso));
                }}
                onPointerEnter={() => dragTo(iso)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") setPicked(p => (p === iso ? null : iso));
                }}
                title={
                  day?.commitments.length
                    ? day.commitments.map(c => `${c.title}: ${c.hours.toFixed(1)} hrs`).join("\n")
                    : undefined
                }
                className={`min-h-[64px] cursor-pointer rounded-md border px-1.5 py-1 ${
                  picked === iso
                    ? "border-accent-amber-bright bg-surface-raised"
                    : proposed
                    ? "border-accent-amber bg-accent-amber/15"
                    : crowded
                      ? "border-alert-red/40 bg-alert-red/5"
                      : full
                        ? "border-alert-red/30 bg-alert-red/5"
                        : committed > 0.005
                          ? "border-surface-border bg-surface"
                          : "border-transparent"
                } ${!day ? "opacity-40" : ""}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-text-muted">{Number(iso.slice(8, 10))}</span>
                  {committed > 0.005 && (
                    <span className={`text-[11px] ${full ? "text-alert-red" : "text-text-dim"}`}>
                      {committed.toFixed(1)}
                      {day?.assumed && <span className="text-text-faint">*</span>}
                    </span>
                  )}
                </div>

                {/* Which book, not just how much. Two fit legibly in a cell;
                    the rest are counted, and the tooltip has them all. */}
                {day?.commitments.slice(0, 2).map(c => {
                  // Only a book with real chosen dates can be dragged. One
                  // whose hours are merely assumed has no run to take hold of.
                  const draggable = !c.isBlock && (datesFor.get(c.id)?.length ?? 0) > 0;
                  return (
                    <span
                      key={c.id}
                      onPointerDown={e => {
                        if (!draggable) return;
                        // The cell's own click opens the block editor; grabbing
                        // a book is a different intent.
                        e.stopPropagation();
                        startResize(c.id, iso);
                      }}
                      title={draggable ? `Drag to change ${c.title}'s recording days` : undefined}
                      className={`mt-0.5 flex items-center gap-1 ${
                        draggable ? "cursor-ew-resize" : ""
                      } ${dragging === c.id ? "opacity-70" : ""}`}
                    >
                      {/* A block is not a book, and reads as a bar rather than a
                          dot so the difference survives a glance. */}
                      <span
                        className={`shrink-0 ${
                          c.isBlock
                            ? "h-1.5 w-1.5 rounded-[1px] bg-text-dim"
                            : `h-1.5 w-1.5 rounded-full ${colorFor.get(c.id) ?? "bg-text-dim"}`
                        }`}
                      />
                      <span
                        className={`truncate text-[11px] leading-tight ${
                          c.isBlock ? "text-text-muted italic" : "text-text-body"
                        }`}
                      >
                        {c.title}
                      </span>
                    </span>
                  );
                })}
                {day && books > 2 && (
                  <span className={`mt-0.5 block text-[11px] ${crowded ? "text-alert-red" : "text-text-faint"}`}>
                    +{books - 2} more
                  </span>
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

        {/* Pickups, retakes, a day that is simply gone. None of it comes from
            a word count, so without this the calendar promised hours that were
            already spoken for. */}
        {picked && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2">
            <span className={adminType.small}>Block time on {fmt(picked)}</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={blockHours}
              onChange={e => setBlockHours(e.target.value)}
              className="w-16 rounded-md border border-surface-border bg-background px-2 py-1 text-[13px] text-text-primary focus:border-accent-amber focus:outline-none"
            />
            <span className={adminType.small}>hrs</span>
            <input
              value={blockLabel}
              onChange={e => setBlockLabel(e.target.value)}
              placeholder="What for"
              className="w-40 rounded-md border border-surface-border bg-background px-2 py-1 text-[13px] text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void addBlock()}
              disabled={busy}
              className="rounded-md bg-accent-amber px-2.5 py-1 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-50"
            >
              {busy ? "…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-[13px] text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
            {error && <span className="text-[13px] text-alert-red">{error}</span>}
          </div>
        )}

        {blocks.length > 0 && (
          <div className="mt-3">
            <p className={`${adminType.label} mb-1`}>Blocked time</p>
            <div className="flex flex-wrap gap-1.5">
              {[...blocks]
                .sort((a, b) => a.on_date.localeCompare(b.on_date))
                .map(b => (
                  <span
                    key={b.id}
                    className="flex items-center gap-1.5 rounded-md border border-surface-border px-2 py-1 text-[12px] text-text-muted"
                  >
                    {fmt(b.on_date)} · {Number(b.hours)} hrs · {b.label}
                    <button
                      type="button"
                      onClick={() => void removeBlock(b.id)}
                      disabled={busy}
                      aria-label={`Remove ${b.label} on ${fmt(b.on_date)}`}
                      className="text-text-dim hover:text-alert-red disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
            </div>
          </div>
        )}

        <p className={`${adminType.small} mt-3`}>
          Click any day to block time on it. Numbers are hours already committed that day. An asterisk means the book has no chosen
          recording days yet, so its hours are spread across weekdays to its deadline. A new book
          is placed on empty days first and never on a day already holding {studio.maxBooksPerDay};
          days in red hold more than that already.
        </p>
      </div>
    </div>
  );
}
