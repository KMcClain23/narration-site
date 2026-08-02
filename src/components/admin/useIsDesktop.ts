"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// SSR has no window — the server (and the client's first hydration pass)
// always reports "not desktop", matching. This is what drives true
// conditional rendering (Sidebar vs. bottom tab bar) rather than a CSS
// hidden/visible toggle — the desktop Sidebar fetches data
// (unread-inquiries count) that shouldn't run at all on mobile, and the
// mobile redesign's own spec calls for the sidebar to not render, not just
// be visually hidden. The accepted tradeoff: desktop briefly renders without
// a Sidebar until React reconciles the real snapshot post-hydration.
function getServerSnapshot() {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
