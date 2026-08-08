"use client";

import { useEffect, useState } from "react";
import { adminType } from "@/lib/design-tokens";
import { VA_OPTOUT_KEY } from "@/app/components/SiteAnalytics";

/**
 * Excludes this browser's visits from Web Analytics.
 *
 * The flag is read by SiteAnalytics' beforeSend on every page view, so the only
 * job here is setting it — but it is set in localStorage, which means it is per
 * browser and per device and there is no way to apply it from the server. That
 * makes a visible control the honest way to expose it: the alternative is a
 * console incantation, and a setting nobody can see the state of is a setting
 * nobody trusts.
 *
 * Rendered unset until mounted, because localStorage does not exist during the
 * server render and a toggle that flickers from "off" to "on" reads as a bug.
 */
export function OwnTrafficToggle() {
  const [excluded, setExcluded] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setExcluded(window.localStorage.getItem(VA_OPTOUT_KEY) === "1");
    } catch {
      setExcluded(false);
    }
  }, []);

  const toggle = () => {
    try {
      const next = !excluded;
      if (next) window.localStorage.setItem(VA_OPTOUT_KEY, "1");
      else window.localStorage.removeItem(VA_OPTOUT_KEY);
      setExcluded(next);
    } catch {
      // Storage blocked — leave the control showing its real state.
    }
  };

  if (excluded === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={excluded}
      className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-colors ${
        excluded
          ? "bg-accent-amber text-background border-accent-amber"
          : "text-text-muted border-surface-border hover:bg-surface-raised"
      }`}
      title={
        excluded
          ? "This browser's visits are not counted. Click to start counting them again."
          : "Stop counting visits from this browser in Vercel Web Analytics."
      }
    >
      {excluded ? "✓ This browser excluded" : "Exclude this browser"}
    </button>
  );
}

export function OwnTrafficNote() {
  return (
    <p className={`${adminType.small} mt-3`}>
      Admin and tools pages are never counted. Use the toggle to also leave out your own visits to the
      public site from this browser — it is stored per browser, so set it on each device you use.
      Existing figures are not affected; Vercel has no way to remove views it has already recorded.
    </p>
  );
}
