"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetStudioSettingsCache } from "@/components/admin/useStudioSettings";
import { adminType } from "@/lib/design-tokens";
import {
  DEFAULT_STUDIO_SETTINGS,
  describeIssue,
  SETTING_LIMITS,
  type StudioSettings,
  type StudioSettingsRead,
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
    label: "My recording speed",
    unit: "words/hr",
    effect:
      "TIME. How much manuscript you actually get through in one hour at the mic, retakes included. Sets how long each book takes, the hours-per-day on every card, and what the capacity calendar says will fit.",
  },
  {
    key: "wordsPerFinishedHour",
    label: "Words in a finished hour",
    unit: "words/hr",
    effect:
      "MONEY. The industry unit: how many manuscript words become one hour of finished audio. Your PFH rate is paid per one of these. Sets every earnings estimate and invoice line, and says nothing about how long recording takes.",
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
    effect: "Only a color on the board. Nothing is calculated from it.",
  },
];

export function StudioSettingsForm({ initial }: { initial: StudioSettingsRead }) {
  const router = useRouter();
  // An unusable value shows as an EMPTY box carrying the stored text beneath it,
  // not as a number. Filling the box with the old hardcoded constant made the
  // page assert that the app was using a figure it had in fact rejected — a
  // Settings screen displaying a number nothing reads, which is the exact
  // complaint that started this whole line of work.
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initial.settings).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = FIELDS.some(f => {
    const raw = values[f.key].trim();
    const was = initial.settings[f.key];
    if (raw === "") return was != null;
    return Number(raw) !== was;
  });

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
      // The shared store holds the PRE-SAVE numbers until told otherwise.
      // router.refresh() re-renders server components; it does not touch a
      // client-side cache, so without this every settings-derived figure on
      // every other screen would keep quoting the old rate until a hard reload
      // — which is the staleness a shared cache buys in exchange for a single
      // loading window, and the reason the escape hatch exists.
      resetStudioSettingsCache();
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
          const issue = initial.issues[f.key];
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
              {/* The stored value and the reason it is not being used, in the
                  same words Android's Settings screen uses — two clients
                  describing one stored value differently is a smaller version
                  of the problem this stage exists to fix. */}
              {issue && (
                <p className="mt-1 text-[13px] text-alert-red">{describeIssue(issue)}</p>
              )}
              <p className={`${adminType.small} mt-1 max-w-[520px]`}>{f.effect}</p>

              {/* Narrators think in a ratio, not in words per hour. Showing the
                  one the two rates imply turns a number you have to trust into
                  one you can check against how a day actually feels. */}
              {f.key === "wordsPerNarrationHour" &&
                (() => {
                  const speed = Number(values.wordsPerNarrationHour);
                  const finished = Number(values.wordsPerFinishedHour);
                  if (!(speed > 0) || !(finished > 0)) return null;
                  return (
                    <p className="mt-0.5 text-[12px] text-accent-amber-bright/80">
                      {(finished / speed).toFixed(1)} hours at the mic per finished hour.
                    </p>
                  );
                })()}
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

      {/* The two rates are near neighbors numerically and answer completely
          different questions, which is exactly how they get confused. */}
      <p className={`${adminType.small} mt-3 max-w-[560px]`}>
        The first two rates look alike and are not related. Recording speed is a fact about you and
        can be measured. Words in a finished hour is a fact about audiobooks and is roughly fixed at
        9,400 across the industry. A book can take you far longer to record than the finished hours
        it bills for.
      </p>
      <p className={`${adminType.small} mt-2`}>
        These are estimates, not records. Changing one moves projections everywhere, but nothing
        already invoiced or recorded is touched.
      </p>
    </div>
  );
}
