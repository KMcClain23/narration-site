/**
 * The numbers the whole app does arithmetic with.
 *
 * Every one of these was a constant in a source file: a personal recording
 * rate, a working day's length, a rule about how many books belong in one day.
 * They describe a particular narrator rather than the software, so leaving
 * them in code meant the only way to correct one was a deploy — and one of
 * them, the finished-hour divisor, was written down twice and had already
 * drifted once.
 *
 * Stored in site_settings, the key/value table the booking window already
 * uses, so there is no migration and no new shape to maintain.
 */

export type StudioSettings = {
  /** Manuscript words got through in an hour at the mic. Drives every time figure. */
  wordsPerNarrationHour: number;
  /** Words that make one hour of finished audio. Drives every money figure. */
  wordsPerFinishedHour: number;
  /** A full working day at the mic. */
  dailyCapacityHours: number;
  /** Books at the mic in one day, at most. */
  maxBooksPerDay: number;
  /** Hours a day past which a book is eating the week rather than fitting in it. */
  heavyDayHours: number;
};

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  wordsPerNarrationHour: 9200,
  wordsPerFinishedHour: 9400,
  dailyCapacityHours: 6,
  maxBooksPerDay: 2,
  heavyDayHours: 4,
};

/** site_settings keys, kept beside the type so the two cannot drift apart. */
export const SETTING_KEYS: Record<keyof StudioSettings, string> = {
  wordsPerNarrationHour: "studio_words_per_narration_hour",
  wordsPerFinishedHour: "studio_words_per_finished_hour",
  dailyCapacityHours: "studio_daily_capacity_hours",
  maxBooksPerDay: "studio_max_books_per_day",
  heavyDayHours: "studio_heavy_day_hours",
};

/**
 * Bounds, so a typo cannot quietly break every figure on the site.
 *
 * A words-per-hour of 0 would divide by zero; one of 5 would say a novel takes
 * two years. These are deliberately wide — they exist to catch a slipped
 * keystroke, not to have an opinion about how fast anyone reads.
 */
export const SETTING_LIMITS: Record<keyof StudioSettings, { min: number; max: number; step: number }> = {
  wordsPerNarrationHour: { min: 1000, max: 30000, step: 100 },
  wordsPerFinishedHour: { min: 1000, max: 30000, step: 100 },
  dailyCapacityHours: { min: 1, max: 16, step: 0.5 },
  maxBooksPerDay: { min: 1, max: 5, step: 1 },
  heavyDayHours: { min: 1, max: 16, step: 0.5 },
};

/** A stored string back to a usable number, falling back rather than throwing. */
export function parseSetting(
  field: keyof StudioSettings,
  raw: string | null | undefined,
): number {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return DEFAULT_STUDIO_SETTINGS[field];
  const { min, max } = SETTING_LIMITS[field];
  if (n < min || n > max) return DEFAULT_STUDIO_SETTINGS[field];
  return n;
}

/** Build a full settings object from whatever rows exist, defaults for the rest. */
export function settingsFromRows(rows: { key: string; value: string }[]): StudioSettings {
  const byKey = new Map(rows.map(r => [r.key, r.value]));
  const out = { ...DEFAULT_STUDIO_SETTINGS };
  for (const field of Object.keys(SETTING_KEYS) as (keyof StudioSettings)[]) {
    out[field] = parseSetting(field, byKey.get(SETTING_KEYS[field]));
  }
  return out;
}
