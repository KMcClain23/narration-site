// The business's own details, as they appear on outbound documents.
//
// Extracted from ContractPDF, which had them inline. Contracts and invoices
// must not disagree about the trading name or the remit-to email — changing
// it in one place and not the other is the kind of drift nobody notices until
// a client pays the wrong address.

export const BUSINESS = {
  name: "Dean Miller",
  company: "Dean Miller Narration LLC",
  email: "dean@dmnarration.com",
  site: "dmnarration.com",
} as const;

/** Placeholder run of underscores used by the blank contract template. */
export const BLANK_LINE = "________________________";

/** Profile photo, shared by the public header and the admin sidebar. */
export const PROFILE_PHOTO_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile%20Photo%202.jpg";

/** How the narrator is described alongside the name. */
export const ROLE_LABEL = "Audiobook Narrator";
