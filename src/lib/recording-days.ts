"use client";

import { useSyncExternalStore } from "react";

/**
 * Which days of the week actually get recorded in.
 *
 * A working week is a personal thing: some books get weekends, some weeks have
 * a standing Wednesday off, and "hours per weekday" is the wrong answer for
 * anyone who does not record Monday to Friday. Held here rather than on each
 * card because it describes the narrator, not the book.
 *
 * Stored in localStorage rather than the database so it needs no migration and
 * applies the moment it changes. The cost is that it is per browser, which is
 * the right trade for a display preference and the wrong one for anything that
 * money depends on.
 */

/** 0 = Sunday, matching Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABEL: Record<Weekday, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

/** Monday to Friday, until told otherwise. */
export const DEFAULT_RECORDING_DAYS: Weekday[] = [1, 2, 3, 4, 5];

const KEY = "dmn_recording_days";
const EVENT = "dmn-recording-days";

function parse(raw: string | null): Weekday[] {
  if (!raw) return DEFAULT_RECORDING_DAYS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RECORDING_DAYS;
    const days = parsed.filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6);
    // An empty set would divide the work over no days at all. Refusing it here
    // means the picker can let you clear everything without producing Infinity.
    return days.length ? [...new Set(days)].sort() : DEFAULT_RECORDING_DAYS;
  } catch {
    return DEFAULT_RECORDING_DAYS;
  }
}

// useSyncExternalStore needs a stable snapshot: returning a fresh array each
// call would loop forever. The parsed value is cached and only rebuilt when the
// stored string actually changes.
let cachedRaw: string | null = null;
let cachedDays: Weekday[] = DEFAULT_RECORDING_DAYS;

function getSnapshot(): Weekday[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDays = parse(raw);
  }
  return cachedDays;
}

/** The server has no localStorage, so it renders the default and hydrates to it. */
function getServerSnapshot(): Weekday[] {
  return DEFAULT_RECORDING_DAYS;
}

function subscribe(onChange: () => void): () => void {
  // "storage" only fires in other tabs, so same-tab writes announce themselves.
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useRecordingDays(): Weekday[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setRecordingDays(days: Weekday[]): void {
  const clean = [...new Set(days)].sort();
  window.localStorage.setItem(KEY, JSON.stringify(clean.length ? clean : DEFAULT_RECORDING_DAYS));
  window.dispatchEvent(new Event(EVENT));
}
