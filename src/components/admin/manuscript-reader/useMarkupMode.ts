"use client";

import { useSyncExternalStore } from "react";

/**
 * Which markup view a particular book opens in, remembered per book.
 *
 * Pages is a deliberate choice for a specific manuscript, not a global
 * preference: most books are marked up in Text, and the one whose PDF extracts
 * as gibberish is marked up on the page. Without this, that book reopens in the
 * useless view every single time and the choice has to be made again on every
 * visit.
 *
 * Stored per manuscript in localStorage rather than on the row: it describes
 * how someone is working right now, not a fact about the book, and it should
 * not need a write to the database to change.
 *
 * useSyncExternalStore rather than an effect, so the server and the first
 * client render agree and nothing has to be corrected after mount.
 */

export type MarkupMode = "text" | "pages";

const key = (manuscriptId: string) => `dmn_markup_mode_${manuscriptId}`;
const EVENT = "dmn-markup-mode";

// Cached so the snapshot is stable between renders; returning a fresh value
// each call makes useSyncExternalStore loop.
let cachedRaw: string | null = null;
let cachedMode: MarkupMode | null = null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useMarkupMode(manuscriptId: string, fallback: MarkupMode): MarkupMode {
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      const raw = window.localStorage.getItem(key(manuscriptId));
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedMode = raw === "pages" || raw === "text" ? raw : null;
      }
      return cachedMode;
    },
    // The server has no localStorage, so it renders the fallback and the
    // client's first paint matches it.
    () => null,
  );
  return stored ?? fallback;
}

export function setMarkupMode(manuscriptId: string, mode: MarkupMode): void {
  window.localStorage.setItem(key(manuscriptId), mode);
  window.dispatchEvent(new Event(EVENT));
}
