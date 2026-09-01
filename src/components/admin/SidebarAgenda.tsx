"use client";

import Link from "next/link";
import { adminType } from "@/lib/design-tokens";
import { parseLocalDate } from "./board-card-utils";
import type { Agenda } from "./useAgenda";

/**
 * Today at the mic, in the sidebar, on every page.
 *
 * It lived on the schedule page, which is the one place you already know what
 * today holds. The value is on the other pages: knowing there are four hours
 * booked before agreeing to something on the payments screen.
 *
 * Kept deliberately short. This is a reminder, not the schedule.
 */

const MAX_ITEMS = 3;
const MAX_DUE = 2;

export function SidebarAgenda({ agenda }: { agenda: Agenda | null }) {
  // Nothing at all until it has loaded: a panel that says "nothing scheduled"
  // and then changes its mind is worse than one that arrives a moment late.
  if (!agenda) return null;

  const total = agenda.items.reduce((s, i) => s + (i.hours ?? 0), 0);
  // An em dash, not "0.0 hrs". A day whose hours cannot be worked out is not a
  // day with no work in it.
  const hoursLabel = (h: number | null) => (h == null ? "—" : `${h.toFixed(1)} hrs`);
  const shown = agenda.items.slice(0, MAX_ITEMS);
  const hidden = agenda.items.length - shown.length;

  return (
    <div className="border-t border-surface-border px-3 py-3">
      <div className="flex items-baseline justify-between">
        <span className={adminType.label}>Today</span>
        <span className="text-[11px] text-text-faint">
          {parseLocalDate(agenda.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>

      {agenda.items.length === 0 ? (
        <p className="mt-1 text-[12px] text-text-muted">Nothing at the mic.</p>
      ) : (
        <>
          <div className="mt-1.5 space-y-1">
            {shown.map(i => (
              <div key={i.id} className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-[12px] ${i.isBlock ? "italic text-text-muted" : "text-text-body"}`}
                >
                  {i.title}
                </span>
                {i.hours != null && (
                  <span className="shrink-0 text-[12px] tabular-nums text-text-dim">
                    {i.hours.toFixed(1)}
                  </span>
                )}
              </div>
            ))}
            {hidden > 0 && <p className="text-[11px] text-text-faint">+{hidden} more</p>}
          </div>

          <div className="mt-1.5 flex items-baseline justify-between border-t border-divider pt-1.5">
            <span className="text-[11px] text-text-muted">At the mic</span>
            <span className="text-[12px] font-medium tabular-nums text-accent-amber-bright">
              {total.toFixed(1)} hrs
            </span>
          </div>
        </>
      )}

      {/* Both run from today rather than from Monday or the first: hours
          already spent are not a decision still to be made, and the figure is
          here to answer what is left to give away. */}
      <div className="mt-1.5 space-y-0.5 border-t border-divider pt-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-text-muted">Rest of week</span>
          <span className="text-[12px] tabular-nums text-text-body">{hoursLabel(agenda.weekHours)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-text-muted">Rest of month</span>
          <span className="text-[12px] tabular-nums text-text-body">{hoursLabel(agenda.monthHours)}</span>
        </div>
        {/* The rest of the sidebar is unaffected: what is on today, the
            deadlines and the due-soon list are facts about the schedule and
            owe nothing to a rate. Only the hour figures are gone, and they say
            so rather than reading as a quiet zero. */}
        {agenda.ratesUnavailable && (
          <p className="pt-1 text-[11px] text-text-dim">
            Hours need the words-per-hour setting, which could not be read.
          </p>
        )}
      </div>

      {/*
        PICKUPS SIT BESIDE THE DAY, NOT INSIDE IT.

        Everything above is scheduled work on a date. A pickup has none — only a
        sent_at — so it is not "due today" and adding it to a due-today total
        would make "Nothing at the mic" read as a contradiction rather than as a
        second true fact. Both can be true, and today both are.

        NEVER A BARE COUNT. "3 pickups" without a title says something is owed
        without saying on what, which is not actionable from a sidebar. One book
        is named; several become a book count, because three titles do not fit
        this width and a truncated title names the wrong book.

        Nothing at all when there are none — not "0 pickups". The panel already
        says what today holds; a second empty statement beside it is noise.
      */}
      {(agenda.pickups?.count ?? 0) > 0 && (
        <div className="mt-2 border-t border-divider pt-2">
          <Link href="/pickups" className="group block">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-accent-amber-bright group-hover:underline">
                {agenda.pickups!.count} pickup{agenda.pickups!.count === 1 ? "" : "s"} to re-record
              </span>
            </div>
            <p className="truncate text-[11px] text-text-muted">
              {agenda.pickups!.books.length === 1
                ? agenda.pickups!.books[0]
                : `${agenda.pickups!.books.length} books`}
            </p>
          </Link>
        </div>
      )}

      {agenda.dueSoon.length > 0 && (
        <div className="mt-2 border-t border-divider pt-2">
          <span className={adminType.label}>Due this week</span>
          <div className="mt-1 space-y-0.5">
            {agenda.dueSoon.slice(0, MAX_DUE).map(d => (
              <div key={d.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-text-muted">{d.title}</span>
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${
                    d.deadline === agenda.date ? "text-alert-red" : "text-text-dim"
                  }`}
                >
                  {parseLocalDate(d.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
            {agenda.dueSoon.length > MAX_DUE && (
              <p className="text-[11px] text-text-faint">+{agenda.dueSoon.length - MAX_DUE} more</p>
            )}
          </div>
        </div>
      )}

      {/* The panel is a summary; the schedule is where anything gets changed. */}
      <Link
        href="/schedule"
        className="mt-2 block text-[11px] text-text-muted hover:text-accent-amber-bright"
      >
        Open schedule
      </Link>
    </div>
  );
}
