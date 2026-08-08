"use client";

import { useEffect } from "react";

/**
 * Scrolls to the fragment in the URL once that element actually exists.
 *
 * Arriving at /#contact from another page landed at the top of the homepage.
 * The browser resolves a fragment as soon as the document is ready, and the
 * homepage renders its content inside a Suspense boundary — so at that moment
 * the only thing in the DOM is the fallback div. There is no #contact to find,
 * the browser gives up, and nothing re-attempts when the real content streams
 * in a moment later.
 *
 * The header had a workaround for this, but it only fired when the visitor was
 * already on the homepage. Every other route into a fragment — the welcome
 * page's "Contact & booking", a bookmark, a link in an email, a search result —
 * still landed at the top.
 *
 * Retried on a timer rather than by animation frame.
 *
 * requestAnimationFrame does not tick while a page is not being composited —
 * a background tab, a restored session, anything the browser has decided not
 * to paint — so a frame-based retry can simply never run. A timer runs
 * regardless, and 50ms is short enough that the scroll lands before the
 * visitor registers the page as settled.
 */
const RETRY_MS = 50;
const MAX_ATTEMPTS = 30; // ~1.5s, then stop looking

export function HashScroll() {
  useEffect(() => {
    let timer: number | undefined;

    const scrollToHash = () => {
      window.clearTimeout(timer);
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;

      let attempts = 0;
      const tick = () => {
        const el = document.getElementById(hash);
        if (el) {
          // "auto" rather than smooth: this is a page arrival, and animating a
          // scroll the visitor did not initiate reads as the page moving on
          // its own. Offset comes from each section's scroll-mt.
          el.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }
        if (attempts++ < MAX_ATTEMPTS) timer = window.setTimeout(tick, RETRY_MS);
      };
      tick();
    };

    scrollToHash();
    // Same-document fragment changes still need handling, since the target may
    // be below a section that has not rendered yet either.
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

  return null;
}
