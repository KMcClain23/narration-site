"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminType } from "@/lib/design-tokens";
import {
  DEFAULT_STUDIO_SETTINGS,
  SETTING_LIMITS,
  type StudioSettings,
} from "@/lib/studio-settings";

/**
 * The numbers everything else is calculated from.
 *
 * Each one says what it changes, because the consequence is not obvious from
 * the label: words per hour is not a fact about a book, it is a claim about a
 * person, and every delivery date on the site moves when it does.
 */

type Field = {
  key: keyof StudioSettings;
  label: string;
  unit: string;
  effect: string;
};

const FIELDS: Field[] = [
  {
    key: "wordsPerNarrationHour",
    label: "Words per hour at the mic",
    unit: "words",
    effect:
      "How long a book takes. Changes every hours-per-day figure on the board and every answer the capacity calendar gives.",
  },
  {
    key: "wordsPerFinishedHour",
    label: "Words per finished hour",
    unit: "words",
    effect:
      "What a book is worth. This is the billing unit, not a working rate, and it changes every earnings estimate and invoice line.",
  },
  {
    key: "dailyCapacityHours",
    label: "A full day at the mic",
    unit: "hrs",
    effect: "The starting point for the capacity calendar, and what counts as a day being full.",
  },
  {
    key: "maxBooksPerDay",
    label: "Most books in one day",
    unit: "books",
    effect:
      "A hard limit when fitting new work. Empty days are filled first regardless, so this is the ceiling rather than the goal.",
  },
  {
    key: "heavyDayHours",
    label: "A heavy day starts at",
    unit: "hrs",
    effect: "Only a colour on the board. Nothing is calculated from it.",
  },
];

export function StudioSettingsForm({ initial }: { initial: StudioSettings }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = FIELDS.some(f => Number(values[f.key]) !== initial[f.key]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = Object.fromEntries(FIELDS.map(f => [f.key, Number(values[f.key])]));
      const res = await fetch("/api/studio-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not save.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 max-w-[640px]">
      <div className="overflow-hidden rounded-xl border border-surface-border">
        {FIELDS.map(f => {
          const limits = SETTING_LIMITS[f.key];
          const changed = Number(values[f.key]) !== DEFAULT_STUDIO_SETTINGS[f.key];
          return (
            <div key={f.key} className="border-b border-divider px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={adminType.bodyMd}>{f.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={limits.min}
                    max={limits.max}
                    step={limits.step}
                    value={values[f.key]}
                    onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className="w-24 rounded-md border border-surface-border bg-background px-2 py-1 text-right text-[13px] tabular-nums text-text-primary focus:border-accent-amber focus:outline-none"
                  />
                  <span className={`${adminType.small} w-12`}>{f.unit}</span>
                </span>
              </div>
              <p className={`${adminType.small} mt-1 max-w-[520px]`}>{f.effect}</p>
              {/* Only when it differs, so the default case stays quiet. */}
              {changed && (
                <p className="mt-0.5 text-[12px] text-text-faint">
                  Default is {DEFAULT_STUDIO_SETTINGS[f.key]}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="rounded-lg bg-accent-amber px-3 py-2 text-[13px] font-medium text-background hover:bg-accent-amber-bright disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {error && <span className="text-[13px] text-alert-red">{error}</span>}
        {saved && !dirty && <span className={adminType.small}>Saved.</span>}
      </div>

      {/* Said once here rather than implied by five separate fields. */}
      <p className={`${adminType.small} mt-3`}>
        These are estimates, not records. Changing one moves projections everywhere, but nothing
        already invoiced or recorded is touched.
      </p>
    </div>
  );
}
