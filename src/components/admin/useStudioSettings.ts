"use client";

import { useEffect, useState } from "react";
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from "@/lib/studio-settings";

/**
 * The studio numbers, for client components that do arithmetic with them.
 *
 * Starts at the defaults rather than at nothing, so a board card renders a
 * figure immediately instead of a gap that fills in. If the stored values
 * differ from the defaults the numbers do settle a moment after load, which is
 * the honest cost of not blocking the first paint on a fetch.
 */
export function useStudioSettings(): StudioSettings {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);

  useEffect(() => {
    let live = true;
    fetch("/api/studio-settings")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (live && data?.settings) setSettings(data.settings);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return settings;
}
