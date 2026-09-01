"use client";

import Link from "next/link";
import { useMemo } from "react";
import { activityTone, describeActivity, type ActivityEvent } from "@/lib/activity-wording";

/**
 * The feed, grouped by day, plainly worded.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 *
 * Not a table of kinds and uuids. Dean reads this to find out what has happened
 * on his books, so every row is a sentence and the identifiers stay out of
 * sight. The kind is carried only by a small coloured dot, and even that is
 * decoration — nothing here requires knowing the vocabulary of the log.
 *
 * ── THE BOOK TITLE APPEARS WHERE IT IS NEWS ────────────────────────────────
 *
 * On the unfiltered feed each row names its book, because consecutive rows are
 * usually about different ones. Filtered to a single book the title is in the
 * heading and repeating it on all three hundred rows would be noise.
 */

const TONE: Record<string, string> = {
  milestone: "bg-[#D4AF37]",
  pickup: "bg-sky-400/70",
  progress: "bg-emerald-400/70",
  neutral: "bg-white/30",
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ActivityClient({
  events,
  books,
  selected,
}: {
  events: ActivityEvent[];
  books: { card_id: string; book_title: string; events: number }[];
  selected: string | null;
}) {
  const days = useMemo(() => {
    const out: { label: string; rows: ActivityEvent[] }[] = [];
    for (const e of events) {
      const label = dayLabel(e.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(e);
      else out.push({ label, rows: [e] });
    }
    return out;
  }, [events]);

  const selectedBook = books.find(b => b.card_id === selected);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-bold text-text-body">
          {selectedBook ? selectedBook.book_title : "Activity"}
        </h1>
        <p className="text-sm text-text-dim">
          {selectedBook
            ? "Everything that has happened to this book, newest first."
            : "Everything that has happened, newest first."}
        </p>
      </div>

      {/* ── the book filter ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/activity"
          className={
            "rounded-full border px-3 py-1 text-xs transition-colors " +
            (selected === null
              ? "border-accent-amber bg-accent-amber/15 font-semibold text-accent-amber"
              : "border-divider text-text-dim hover:text-text-body")
          }
        >
          All books
        </Link>
        {books.map(b => (
          <Link
            key={b.card_id}
            href={`/activity?book=${b.card_id}`}
            className={
              "rounded-full border px-3 py-1 text-xs transition-colors " +
              (selected === b.card_id
                ? "border-accent-amber bg-accent-amber/15 font-semibold text-accent-amber"
                : "border-divider text-text-dim hover:text-text-body")
            }
          >
            {b.book_title}
            <span className="ml-1.5 tabular-nums opacity-50">{b.events}</span>
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="rounded-xl border border-divider px-4 py-6 text-center text-sm text-text-dim">
          {/* "Nothing yet" and "nothing for this book" are different facts. */}
          {selected
            ? "Nothing has happened to this book yet."
            : "Nothing has been recorded yet. The log starts from the first claim, chapter or pickup after it was switched on."}
        </p>
      ) : (
        days.map(day => (
          <section key={day.label} className="space-y-2">
            <h2 className="sticky top-0 z-10 bg-[#06082E]/90 py-1 text-xs font-semibold uppercase tracking-[1px] text-text-dim backdrop-blur">
              {day.label}
            </h2>
            <ul className="space-y-1.5">
              {day.rows.map(e => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl border border-divider px-3 py-2.5"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[activityTone(e.kind)]}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-body">{describeActivity(e)}</p>
                    {!selected && (
                      <Link
                        href={`/activity?book=${e.card_id}`}
                        className="text-xs text-text-dim transition-colors hover:text-accent-amber"
                      >
                        {e.book_title}
                      </Link>
                    )}
                  </div>
                  <time
                    dateTime={e.at}
                    className="shrink-0 pt-0.5 text-xs tabular-nums text-text-dim"
                  >
                    {timeLabel(e.at)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {events.length >= 300 && (
        // Said rather than silently truncated: a feed that stops at 300 with no
        // note reads as "that is everything", which it is not.
        <p className="text-center text-xs text-text-dim">
          Showing the most recent 300 entries.
        </p>
      )}
    </div>
  );
}
