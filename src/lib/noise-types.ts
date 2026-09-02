/**
 * What sort of noise a noise pickup is.
 *
 * ── ONE LIST, AND LABELS DERIVED FROM IT ───────────────────────────────────
 *
 * The values are the database constraint's values, and the on-screen label is
 * computed from the value rather than held in a second array beside it. That is
 * deliberate: a values list and a labels list that must agree, living in two
 * places, is the failure this codebase keeps finding — four slug functions, two
 * status maps, a Deno twin for every path helper.
 *
 * It also means the EMAIL needs no copy of anything. The Edge Function is Deno
 * and cannot import this file, but it does not have to: "mouth_click" with the
 * underscore replaced is already the words. No twin, no parity test, nothing to
 * keep in step.
 *
 * ── WHY THESE SIX ──────────────────────────────────────────────────────────
 *
 * Dean's four, plus the two audiobook editors reach for next. They are not
 * decoration: they tell Ann which thing to change. A plosive and a mouth click
 * are her mouth, sibilance is usually a de-esser rather than a re-record, and a
 * bump or a hum is her room. "Noise" alone tells her to guess.
 */
export const NOISE_TYPES = [
  "hum",
  "bump",
  "plosive",
  "mouth_click",
  "sibilance",
  "other",
] as const;

export type NoiseType = (typeof NOISE_TYPES)[number];

/** "mouth_click" -> "Mouth click". The value IS the label, once unpunctuated. */
export function noiseLabel(v: string | null | undefined): string {
  if (!v) return "";
  const words = v.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Is this a value the constraint will accept? */
export function isNoiseType(v: string | null | undefined): v is NoiseType {
  return !!v && (NOISE_TYPES as readonly string[]).includes(v);
}
