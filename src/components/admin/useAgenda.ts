"use client";

import { useEffect, useState } from "react";
import type { AgendaDue, AgendaItem } from "@/app/api/agenda/route";

export type Agenda = {
  date: string;
  items: AgendaItem[];
  dueSoon: AgendaDue[];
  /**
   * Booked hours from today to Sunday, and from today to month end.
   *
   * Null when the narration rate could not be read, because without it no book
   * contributes any hours and the sum would be a blocks-only total wearing the
   * label of a full one.
   */
  weekHours: number | null;
  monthHours: number | null;
  /** True when the rate is unavailable, so the sidebar can say why the hours are gone. */
  ratesUnavailable?: boolean;
};

/**
 * Today's work, for the sidebar.
 *
 * Same shape as useUnreadInquiries and fetched the same way: the sidebar is a
 * client component on every admin page, so the data has to arrive over the
 * wire rather than down a prop from a layout that cannot be async.
 *
 * `pathname` is a refetch key rather than an input. Recording days get changed
 * on the schedule page and blocks get added there; without it the agenda would
 * keep showing what was true when the tab was opened.
 */
export function useAgenda(pathname: string): Agenda | null {
  const [agenda, setAgenda] = useState<Agenda | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/agenda")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (live && data) setAgenda(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);

  return agenda;
}
