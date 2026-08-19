"use client";

import { useState } from "react";
import { adminType } from "@/lib/design-tokens";

export function AcceptingProjectsToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "accepting_projects", value: String(next) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEnabled(!next); // revert
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-between gap-6 rounded-lg border border-surface-border bg-surface p-5">
      <div>
        <p className={adminType.title}>Accepting new projects</p>
        <p className={`${adminType.small} mt-1`}>Shown as available on the public site</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle project availability"
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none disabled:opacity-60 ${
          enabled ? "border-capacity-light bg-capacity-light" : "border-surface-border bg-surface-raised"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>

      <span
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
          enabled ? "bg-capacity-light/15 text-capacity-light" : "bg-surface-raised text-text-muted"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-capacity-light" : "bg-text-dim"}`} />
        {enabled ? "Available" : "Not accepting"}
      </span>
    </div>
  );
}
