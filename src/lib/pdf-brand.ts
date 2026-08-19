/**
 * The brand, as it survives being printed.
 *
 * Shared by InvoicePDF and ContractPDF so the two documents cannot drift —
 * a client who has signed a contract should recognize the invoice as coming
 * from the same business, which is only true while both read from one palette.
 *
 * The site's colors are inverted here on purpose. On screen the brand is a
 * dark navy ground with gold on top; on paper that would be a full-bleed ink
 * wash, so the document runs light and spends the navy and gold on structure
 * instead — rules, headings, and the one number that matters.
 */
export const PDF_BRAND = {
  /** #0f1420, the site background, used as near-black text and headings. */
  ink: "#141b2b",
  /** The site's accent gold. Rules, small caps, and the amount due. */
  gold: "#c9a55a",
  /** A deeper gold that stays legible at small sizes on white. */
  goldDeep: "#9a7830",
  body: "#2c3242",
  muted: "#6a7183",
  faint: "#9aa0ad",
  rule: "#d8dbe2",
  ruleFaint: "#eceef2",
  /** Very pale navy for the panels, rather than a neutral grey. */
  wash: "#f6f7f9",
} as const;
