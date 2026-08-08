"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * The localStorage key that marks this browser as the site owner's.
 *
 * Exported so the toggle on the analytics page and the filter here can never
 * disagree about what it is called.
 */
export const VA_OPTOUT_KEY = "va-optout";

/** Paths only the owner ever visits, so their views are never real traffic. */
const OWNER_ONLY = ["/admin", "/tools"];

/**
 * Vercel Web Analytics with the site owner's own visits filtered out.
 *
 * A site with modest traffic is mostly its owner: checking a page after a
 * deploy, clicking through the admin, reloading the analytics page to see
 * whether the analytics work. Those are indistinguishable from real visitors in
 * the numbers, and at a couple of dozen views a week they are most of them.
 *
 * Two filters, because they cover different things:
 *
 *   - Admin and tools paths are dropped unconditionally. Nobody else can reach
 *     them, so a view there is never a visitor and needs no opt-in to exclude.
 *   - A browser carrying the opt-out flag is dropped entirely, which is what
 *     covers the owner reading their own public pages. It is per-browser and
 *     per-device by nature — localStorage is — so it has to be set on each one.
 *     The toggle lives on the analytics page.
 *
 * This is a client component only because beforeSend is a function, and a
 * server component cannot pass one across the boundary.
 */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        try {
          const path = new URL(event.url).pathname;
          if (OWNER_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) return null;
          if (window.localStorage.getItem(VA_OPTOUT_KEY) === "1") return null;
        } catch {
          // A malformed URL or storage blocked by the browser must not stop the
          // event — failing open keeps real traffic counted.
        }
        return event;
      }}
    />
  );
}
