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
export const PAYMENT_METHODS: { venmo: string; paypal: string } = {
  /** Venmo handle, including the @. */
  venmo: "@DMNarration",
  /**
   * PayPal.Me URL, or the business account's email. A URL renders as a real
   * link on the invoice; an email renders as text to send to.
   *
   * Not free, unlike Venmo: a business account receiving goods-and-services
   * payments is charged, so this sits below Venmo in the list for the same
   * reason the card link does.
   */
  paypal: "",
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

/**
 * PayPal's goods-and-services rate. A business account cannot receive
 * friends-and-family payments, so every invoice paid this way is charged.
 */
export const PAYPAL_FEE = { percent: 0.0349, fixed: 0.49 } as const;

export function grossUp(
  amountDue: number,
  rate: { percent: number; fixed: number },
): { total: number; fee: number } {
  if (amountDue <= 0) return { total: 0, fee: 0 };
  const total = Math.ceil(((amountDue + rate.fixed) / (1 - rate.percent)) * 100) / 100;
  return { total, fee: Math.round((total - amountDue) * 100) / 100 };
}

export function grossUpForCard(amountDue: number): { total: number; fee: number } {
  return grossUp(amountDue, CARD_FEE);
}

/**
 * One payable option, uniform across the PDF and the email.
 *
 * `amount` is what that method charges the payer, which is not always the
 * invoice total — the card route carries the processing fee on top.
 */
export type PayOption = {
  label: string;
  url: string;
  amount: number;
  note?: string;
  /** The provider's own colour, so a payer recognises the button before reading it. */
  bg: string;
  fg: string;
};

/**
 * Provider colours. Venmo and PayPal wear their own so they are recognised at a
 * glance; the card button wears the brand gold, since "card" is not a brand and
 * the fallback should look like it came from this business.
 */
const PAY_COLORS = {
  venmo: { bg: "#008CFF", fg: "#ffffff" },
  paypal: { bg: "#003087", fg: "#ffffff" },
  card: { bg: "#c9a55a", fg: "#141b2b" },
} as const;

/**
 * Venmo, with the amount and memo already filled in.
 *
 * The web link doubles as an app link: on a phone Venmo intercepts its own
 * domain, so this opens the app with the payment part-composed rather than
 * dropping the payer on a profile page to type the figure themselves.
 */
export function venmoPayUrl(handle: string, amount: number, memo: string): string {
  const user = handle.replace(/^@/, "").trim();
  if (!user) return "";
  const q = new URLSearchParams({ txn: "pay", amount: amount.toFixed(2), note: memo });
  return `https://venmo.com/${encodeURIComponent(user)}?${q.toString()}`;
}

/**
 * PayPal.Me with the amount appended, or a plain mailto when only the business
 * email is known — PayPal has no amount-prefilled link for a bare address.
 */
export function paypalPayUrl(paypal: string, amount: number): string {
  const v = paypal.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return `${v.replace(/\/+$/, "")}/${amount.toFixed(2)}`;
  if (/^[\w.+-]+@[\w.-]+$/.test(v)) return "";
  return `https://paypal.me/${encodeURIComponent(v.replace(/^@/, ""))}/${amount.toFixed(2)}`;
}

/**
 * Every way this invoice can be paid, cheapest first.
 *
 * Order is the whole point: a payer takes the first option they recognise, and
 * only the last one costs the narrator anything.
 */
export function payOptions(
  amountDue: number,
  memo: string,
  links: { card?: string; paypal?: string } = {},
): PayOption[] {
  const out: PayOption[] = [];
  const avoidNote = PAYMENT_METHODS.venmo ? " — Venmo avoids it" : "";

  const venmo = venmoPayUrl(PAYMENT_METHODS.venmo, amountDue, memo);
  if (venmo) out.push({ label: "Pay with Venmo", url: venmo, amount: amountDue, ...PAY_COLORS.venmo });

  // Grossed up like the card, for the same reason: PayPal charges a business
  // account on every invoice it receives, so billing the plain amount here
  // would quietly hand the fee back to the narrator.
  const pp = grossUp(amountDue, PAYPAL_FEE);
  // A raised invoice link beats the PayPal.Me handle whenever one exists: it
  // carries a fixed amount the payer cannot edit down, where a .Me link only
  // suggests one.
  const paypalUrl =
    links.paypal && /^https:\/\//.test(links.paypal)
      ? links.paypal
      : paypalPayUrl(PAYMENT_METHODS.paypal, pp.total);
  if (paypalUrl) {
    out.push({
      label: "Pay with PayPal",
      url: paypalUrl,
      amount: pp.total,
      ...PAY_COLORS.paypal,
      note: `Includes a $${pp.fee.toFixed(2)} processing fee${avoidNote}.`,
    });
  }

  if (links.card && /^https:\/\//.test(links.card)) {
    const { total, fee } = grossUpForCard(amountDue);
    out.push({
      label: "Pay by card or Apple Pay",
      url: links.card,
      amount: total,
      ...PAY_COLORS.card,
      note: `Includes a $${fee.toFixed(2)} processing fee${avoidNote}.`,
    });
  }

  return out;
}

/** Placeholder run of underscores used by the blank contract template. */
export const BLANK_LINE = "________________________";

/**
 * The logo mark, as an absolute URL.
 *
 * Absolute rather than "/logo-mark.png" because both consumers are off-site:
 * the PDF is rendered in a browser with no page context, and an email client
 * fetches images from the open internet. A relative path resolves to neither.
 */
export const LOGO_URL = `${
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://dmnarration.com"
}/logo-mark.png`;

/** Profile photo, shared by the public header and the admin sidebar. */
export const PROFILE_PHOTO_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile%20Photo%202.jpg";

/** How the narrator is described alongside the name. */
export const ROLE_LABEL = "Audiobook Narrator";
