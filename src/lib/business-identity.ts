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

/**
 * How clients can pay, as listed on an invoice.
 *
 * Free methods are listed first deliberately: card processing costs roughly
 * 2.9% + 30¢, and an author who sees a card link first will use it every time.
 * A blank entry is omitted from the invoice rather than printed empty — a
 * payment instruction that is half-filled in is worse than one that is absent.
 */
export const PAYMENT_METHODS = {
  /** Venmo handle, including the @. */
  venmo: "",
} as const;

/**
 * What Stripe keeps, so the payer can be charged it rather than the narrator
 * absorbing it. 2.9% + 30¢ is the standard US card rate.
 *
 * Grossed up, not added: adding 2.9% to the total leaves you short, because
 * Stripe then takes its cut of the larger number too. Solving for the amount
 * that nets the invoice total is the only version that actually breaks even.
 */
export const CARD_FEE = { percent: 0.029, fixed: 0.3 } as const;

export function grossUpForCard(amountDue: number): { total: number; fee: number } {
  if (amountDue <= 0) return { total: 0, fee: 0 };
  const total = Math.ceil(((amountDue + CARD_FEE.fixed) / (1 - CARD_FEE.percent)) * 100) / 100;
  return { total, fee: Math.round((total - amountDue) * 100) / 100 };
}

/** Placeholder run of underscores used by the blank contract template. */
export const BLANK_LINE = "________________________";

/** Profile photo, shared by the public header and the admin sidebar. */
export const PROFILE_PHOTO_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile%20Photo%202.jpg";

/** How the narrator is described alongside the name. */
export const ROLE_LABEL = "Audiobook Narrator";
