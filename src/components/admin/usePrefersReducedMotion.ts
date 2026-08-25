"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Whether the viewer has asked for reduced motion.
 *
 * globals.css already neutralises the *visual* side of this globally — a
 * `transition-duration: 0.001ms !important` on everything, which beats inline
 * styles too — so nothing that is purely a CSS transition needs to ask.
 *
 * This exists for the JavaScript half, which that rule cannot reach: a sheet
 * that animates out and then unmounts has to wait for the animation before
 * calling onClose, and under reduced motion there is no animation to wait for.
 * Keeping the timer anyway would leave the sheet sitting there for 200ms after
 * a tap, which reads as the button not having worked.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
