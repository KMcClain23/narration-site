"use client";

import { useState } from "react";

export default function AvailabilityToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving]   = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/site-settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key: "accepting_projects", value: String(next) }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setEnabled(!next); // revert
    }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5 flex items-center justify-between gap-6">
      <div>
        <p className="font-semibold text-white text-sm">Accepting new projects</p>
        <p className="text-xs text-white/45 mt-1">
          {enabled
            ? "Shown as available on the public site"
            : "Public site shows you are not accepting new projects"}
        </p>
      </div>

      {/* Toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle project availability"
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none disabled:opacity-60 ${
          enabled ? "border-emerald-500 bg-emerald-500" : "border-white/20 bg-white/10"
        }`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`} />
      </button>

      {/* Live status pill */}
      <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
        enabled
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400"
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-red-400"}`} />
        {enabled ? "Available" : "Unavailable"}
      </span>
    </div>
  );
}
