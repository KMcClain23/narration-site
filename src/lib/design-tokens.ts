// Admin design system — typography tokens (Stage 1 of the admin redesign).
// Color tokens live as real Tailwind utilities via the @theme block in
// globals.css (bg-surface, text-text-primary, etc.); compound typography
// (size + weight + tracking) is easier to keep correct as class bundles here
// than to encode through Tailwind's theme variables.
//
// Usage: <h1 className={adminType.titleLg}>Page title</h1>

export const adminType = {
  /** Manrope Bold 18px — card/section titles */
  title: "font-bold text-[18px] leading-tight text-text-primary",
  /** Manrope Bold 24px — page titles */
  titleLg: "font-bold text-2xl leading-tight text-text-primary",
  /** Manrope Regular 14px — primary body text */
  body: "font-normal text-sm text-text-body",
  /** Manrope Medium 14px — emphasized body text */
  bodyMd: "font-medium text-sm text-text-body",
  /** Manrope Regular 13px — secondary text */
  small: "font-normal text-[13px] text-text-muted",
  /** Manrope Medium 11px, uppercase, tracked — section labels, dividers */
  label: "font-medium text-[11px] uppercase tracking-[0.08em] text-text-faint",
  /** Manrope Medium 13px, tabular — dates, counts */
  monoNum: "font-medium text-[13px] tabular-nums text-text-dim",
} as const;
