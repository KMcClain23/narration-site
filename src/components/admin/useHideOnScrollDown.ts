"use client";

import { useEffect, useRef, useState } from "react";

const SCROLL_THRESHOLD = 10;

// Twitter-pattern hide-on-scroll-down/show-on-scroll-up, driven by
// window.scrollY (AdminShell's <main> never actually gets internal overflow
// — see the comment there — so window is the real scroll container).
// Shared by BottomTabBar and BoardFAB so they move in sync without needing
// to literally share state — same signal, same thresholds, same tick.
export function useHideOnScrollDown(): boolean {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      // Never hide right at the top — a small downward jitter from y=0
      // shouldn't hide before the user has actually scrolled.
      setHidden(delta > 0 && y > 64);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
