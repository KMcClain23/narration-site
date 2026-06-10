"use client";

import { useState } from "react";
import { formatBookingWindow } from "@/lib/format-booking-window";

const MONTHS = [
  { n: 1, label: "Jan" }, { n: 2, label: "Feb" }, { n: 3, label: "Mar" },
  { n: 4, label: "Apr" }, { n: 5, label: "May" }, { n: 6, label: "Jun" },
  { n: 7, label: "Jul" }, { n: 8, label: "Aug" }, { n: 9, label: "Sep" },
  { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];

function getWindowInfo(months: number[]): { startMonth: number; startYear: number } | null {
  if (!months.length) return null;
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const sorted = [...months].sort((a, b) => a - b);

  if (sorted.length === 1) {
    const m = sorted[0];
    return { startMonth: m, startYear: m >= curMonth ? curYear : curYear + 1 };
  }

  let maxGap = 0;
  let breakAfter = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    const gap = (sorted[(i + 1) % sorted.length] - sorted[i] + 12) % 12;
    if (gap > maxGap) { maxGap = gap; breakAfter = i; }
  }

  const startMonth = sorted[(breakAfter + 1) % sorted.length];
  const startYear = startMonth >= curMonth ? curYear : curYear + 1;
  return { startMonth, startYear };
}

function resolveYear(month: number, info: { startMonth: number; startYear: number } | null): number {
  const fallback = new Date().getFullYear();
  if (!info) return fallback;
  return month >= info.startMonth ? info.startYear : info.startYear + 1;
}

export default function BookingAvailability({ initial }: { initial: number[] }) {
  const [selected, setSelected] = useState<number[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (m: number) => {
    setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "available_months", value: selected }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const preview = formatBookingWindow(selected);
  const info = getWindowInfo(selected);

  return (
    <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5 mt-4">
      <p className="font-semibold text-white text-sm mb-1">Booking Availability</p>
      <p className="text-xs text-white/45 mb-4">Select the months shown on the public site as your booking window.</p>

      {/* Month picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {MONTHS.map(({ n, label }) => {
          const isSelected = selected.includes(n);
          const year = isSelected ? resolveYear(n, info) : null;
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isSelected
                  ? "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40"
                  : "bg-white/5 text-white/40 border-white/10 hover:border-white/25 hover:text-white/60"
              }`}
            >
              {label}
              {year !== null && (
                <span className="ml-0.5 text-[9px] opacity-60">&apos;{String(year).slice(2)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Preview */}
      <p className="text-xs text-white/40 mb-4">
        Preview:{" "}
        <span className="text-white/70 font-medium">
          {selected.length ? `Currently booking ${preview}` : "No months selected"}
        </span>
      </p>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="text-xs font-semibold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/25 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
