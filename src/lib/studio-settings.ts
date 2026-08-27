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
 *
 * Every field is nullable, and that is the point of this module.
 *
 * W1 moved the finished-hour divisor out of five hardcodes and into this table,
 * which was supposed to remove the risk of the app billing at a number nobody
 * had chosen. It relocated it instead: the value now agrees with the FALLBACK by
 * coincidence rather than with five hardcodes by coincidence. Four of the five
 * defaults equal the stored value exactly, so a failed read is invisible on the
 * surfaces where it matters most — including settle-payment, which settles money.
 *
 * The fields are nullable INDIVIDUALLY rather than the container being nullable,
 * so a bad narration rate blanks the time figures and leaves money alone. That
 * is what Android does, and Stage 7 exists to stop the two clients differing.
 *
 * A rate that could not be read is not a rate. `null` is how that is said.
 */

export type StudioSettings = {
  /** Manuscript words got through in an hour at the mic. Drives every time figure. */
  wordsPerNarrationHour: number | null;
  /** Words that make one hour of finished audio. Drives every money figure. */
  wordsPerFinishedHour: number | null;
  /** A full working day at the mic. */
  dailyCapacityHours: number | null;
  /** Books at the mic in one day, at most. */
  maxBooksPerDay: number | null;
  /** Hours a day past which a book is eating the week rather than fitting in it. */
  heavyDayHours: number | null;
};

export type StudioSettingField = keyof StudioSettings;

/**
 * Why a field is null, so a surface can say more than "unavailable".
 *
 * Mirrors Android's `SettingIssue` case for case. The raw value is carried
 * because a value that could not be used is still evidence — Settings shows what
 * was stored beside the statement that it is not being used, and a typo'd
 * 500000 silently becoming 9,200 is precisely the disease this stage is about.
 */
export type SettingIssue =
  | { kind: "missing" }
  | { kind: "unreadable"; raw: string }
  | { kind: "outOfRange"; raw: string; allowed: string };

/**
 * What a read produced: the usable values, why any are missing, and whether the
 * read happened at all.
 *
 * `failure` is not the same as every field being null. "The database said this
 * key does not exist" and "the database could not be reached" are different
 * facts, and until now both arrived as a full set of defaults.
 */
export type StudioSettingsRead = {
  settings: StudioSettings;
  issues: Partial<Record<StudioSettingField, SettingIssue>>;
  /** Non-null when the read itself failed. Every field is null when it is set. */
  failure: string | null;
};

/**
 * The values a genuinely unconfigured install would use.
 *
 * Deliberately NOT typed as `StudioSettings`, and deliberately not reachable
 * from the load path: it is legitimate only for an install where the keys have
 * never been written, which cannot occur while all seven exist in site_settings.
 * It survives as documentation of the original constants and as the seed values
 * for the settings form.
 *
 * If you are about to spread this into a value returned by a loader, that is the
 * bug this stage removed.
 */
export const DEFAULT_STUDIO_SETTINGS: Record<StudioSettingField, number> = {
  wordsPerNarrationHour: 9200,
  wordsPerFinishedHour: 9400,
  dailyCapacityHours: 6,
  maxBooksPerDay: 2,
  heavyDayHours: 4,
};

/** site_settings keys, kept beside the type so the two cannot drift apart. */
export const SETTING_KEYS: Record<StudioSettingField, string> = {
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
export const SETTING_LIMITS: Record<StudioSettingField, { min: number; max: number; step: number }> = {
  wordsPerNarrationHour: { min: 1000, max: 30000, step: 100 },
  wordsPerFinishedHour: { min: 1000, max: 30000, step: 100 },
  dailyCapacityHours: { min: 1, max: 16, step: 0.5 },
  maxBooksPerDay: { min: 1, max: 5, step: 1 },
  heavyDayHours: { min: 1, max: 16, step: 0.5 },
};

/**
 * "1000–30000", for saying what a rejected value was measured against.
 *
 * Bare digits, no thousands separators, because Android's Settings screen prints
 * it that way and the two clients must produce the SAME sentence about the same
 * stored value. The first cut used `toLocaleString()` and rendered
 * "1,000–30,000" — a difference nobody would call a bug and exactly the kind of
 * drift between two implementations that this stage exists to stop.
 */
export function allowedRange(field: StudioSettingField): string {
  const { min, max } = SETTING_LIMITS[field];
  return `${min}–${max}`;
}

/**
 * A stored string back to a usable number, or null and the reason why.
 *
 * It used to return `DEFAULT_STUDIO_SETTINGS[field]` for all three failures, so
 * an absent key, a typo and a number outside the bounds were indistinguishable
 * from a deliberate setting — and indistinguishable from each other.
 */
export function parseSetting(
  field: StudioSettingField,
  raw: string | null | undefined,
): { value: number | null; issue?: SettingIssue } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { value: null, issue: { kind: "missing" } };
  }
  const text = String(raw).trim();
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { value: null, issue: { kind: "unreadable", raw: text } };
  }
  const { min, max } = SETTING_LIMITS[field];
  if (n < min || n > max) {
    return { value: null, issue: { kind: "outOfRange", raw: text, allowed: allowedRange(field) } };
  }
  return { value: n };
}

/**
 * Build a settings read from whatever rows exist. Nothing is defaulted.
 *
 * A key with no row comes back null with a `missing` issue rather than as the
 * original hardcoded constant wearing the appearance of a stored choice.
 */
export function settingsFromRows(rows: { key: string; value: string }[]): StudioSettingsRead {
  const byKey = new Map(rows.map(r => [r.key, r.value]));
  const settings = {} as StudioSettings;
  const issues: Partial<Record<StudioSettingField, SettingIssue>> = {};
  for (const field of Object.keys(SETTING_KEYS) as StudioSettingField[]) {
    const { value, issue } = parseSetting(field, byKey.get(SETTING_KEYS[field]));
    settings[field] = value;
    if (issue) issues[field] = issue;
  }
  return { settings, issues, failure: null };
}

/** Every field null, with one reason, for a read that did not happen. */
export function studioSettingsUnread(failure: string): StudioSettingsRead {
  const settings = {} as StudioSettings;
  for (const field of Object.keys(SETTING_KEYS) as StudioSettingField[]) {
    settings[field] = null;
  }
  return { settings, issues: {}, failure };
}

/**
 * How a surface says why a figure is missing.
 *
 * Wording matched to Android's Settings screen, which already says this, because
 * two clients describing the same stored value differently is a smaller version
 * of the same problem this stage is fixing.
 */
export function describeIssue(issue: SettingIssue): string {
  switch (issue.kind) {
    case "missing":
      return "Not set in site_settings.";
    case "unreadable":
      return `Stored value "${issue.raw}" is not a number.`;
    case "outOfRange":
      return `Stored value "${issue.raw}" is outside ${issue.allowed} and is not being used.`;
  }
}
