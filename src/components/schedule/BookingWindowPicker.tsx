"use client";

import { useMemo, useState } from "react";
import { adminType } from "@/lib/design-tokens";
import { formatBookingWindow } from "@/lib/format-booking-window";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Slot = { month: number; year: number; label: string; isCurrentYear: boolean };

// Deterministic rolling window: current month first, 11 more forward. Each
// slot's year follows directly from its position — no gap-analysis needed,
// unlike the old admin/stats picker (which had to guess years for an
// arbitrary Jan–Dec selection).
function rollingSlots(): Slot[] {
  const now = new Date();
  const curYear = now.getFullYear();
  const slots: Slot[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    slots.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: MONTH_ABBR[d.getMonth()],
      isCurrentYear: d.getFullYear() === curYear,
    });
  }
  return slots;
}

export function BookingWindowPicker({ initial }: { initial: number[] }) {
  const [selected, setSelected] = useState<number[]>(initial);
  const [savedSelected, setSavedSelected] = useState<number[]>(initial);
  const [saving, setSaving] = useState(false);
  const slots = useMemo(rollingSlots, []);

  const isDirty = selected.length !== savedSelected.length || selected.some(m => !savedSelected.includes(m));

  const toggle = (month: number) => {
    setSelected(prev => (prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "available_months", value: selected }),
      });
      if (!res.ok) throw new Error();
      setSavedSelected(selected);
    } finally {
      setSaving(false);
    }
  };

  const preview = formatBookingWindow(selected);

  return (
    <div className="flex-1 rounded-lg border border-surface-border bg-surface p-5">
      <p className={adminType.title}>Booking Availability</p>
      <p className={`${adminType.small} mt-1`}>Select the months shown on the public site as your booking window</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {slots.map(({ month, year, label, isCurrentYear }) => {
          const isSelected = selected.includes(month);
          return (
            <button
              key={`${year}-${month}`}
              type="button"
              onClick={() => toggle(month)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isSelected
                  ? "bg-accent-amber text-background"
                  : "bg-surface-raised text-text-muted hover:text-text-body"
              }`}
            >
              {label}
              {!isCurrentYear && (
                <span className={`ml-0.5 text-[10px] ${isSelected ? "opacity-70" : "opacity-60"}`}>
                  &apos;{String(year).slice(2)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className={`${adminType.small} mt-4`}>
        {selected.length ? `Currently booking ${preview}` : "No months selected"}
      </p>

      <button
        onClick={save}
        disabled={saving || !isDirty}
        className="mt-4 rounded-full bg-accent-amber px-4 py-2 text-xs font-bold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
