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
  label: "font-medium text-[11px] uppercase tracking-[0.08em] text-text-muted",
  /** Manrope Medium 13px, tabular — dates, counts */
  monoNum: "font-medium text-[13px] tabular-nums text-text-muted",
} as const;

/*
  ── WHY label AND monoNum ARE text-muted AND NOT DIMMER ────────────────────

  Measured contrast of every text token against the three admin surfaces
  (#0f1420 background, #1e2536 surface, #232b3f surface-raised). WCAG AA wants
  4.5:1 for normal text and 3.0:1 for large — 18.66px, or 14px bold. These
  tokens are 11px and 13px, so the 4.5 column is the one that applies:

              background   surface   raised
    primary      15.42       12.82    11.82   ok
    body         11.10        9.23     8.51   ok
    muted         5.98        4.97     4.59   ok  <- the floor
    dim           3.14        2.61     2.41   FAILS on every surface at 11-13px
    faint         3.68        3.06     2.82   FAILS on surface and raised

  label was text-faint and monoNum was text-dim, so both failed AA on the very
  surfaces they are used on — and because they are tokens, /board and every
  other admin page inherited it. Patching the editor page would have fixed one
  screen and left the rest.

  THE MUTING WAS RIGHT; THE FLOOR WAS SET TOO LOW. text-muted is still clearly
  secondary — 4.59:1 is not loud — it is merely readable.

  text-dim and text-faint remain, for NON-INFORMATIONAL use only: hairlines,
  disabled states, decorative rules, a separator dot. If a string carries
  information a person needs, it is text-muted or better. A date, a state, a
  name and a form label are all information.
*/
