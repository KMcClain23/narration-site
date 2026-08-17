import "server-only";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paypalConfigured, paypalFetch } from "@/lib/paypal";

/**
 * Shut down the payment links on a settled invoice.
 *
 * A client offered three ways to pay uses one of them, and the other two stay
 * live and payable afterwards. That is a real risk rather than untidiness: a
 * PayPal invoice sitting UNPAID in someone's inbox is an invitation to pay a
 * bill they have already settled, and a Stripe link works for anyone who has
 * the URL, forever.
 *
 * Closing them also answers *how* they paid without any webhook: each provider
 * is asked whether its own link was used before it is shut, and exactly one
 * saying yes identifies the method. Nothing says yes when the money came by
 * Venmo or check, which is the honest answer — those leave no trace here.
 */

export type PaymentLinkRow = {
  id: string;
  method: string;
  stripe_payment_link_id: string | null;
  stripe_payment_link: string | null;
  paypal_invoice_id: string | null;
  payment_links_closed_at: string | null;
};

export type LinkClosure = {
  /** Human-readable list of what was shut, for the caller to report. */
  closed: string[];
  /** "Card" or "PayPal" when a provider confirms its link was used. */
  paidVia: string | null;
  /** Failures are collected, never thrown — settling must not depend on them. */
  problems: string[];
};

async function closeStripe(row: PaymentLinkRow, out: LinkClosure): Promise<void> {
  const id = row.stripe_payment_link_id;
  if (!id || !process.env.STRIPE_SECRET_KEY) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Ask before shutting: a deactivated link still lists its sessions, but
  // checking first keeps the answer true even if the update fails.
  try {
    const sessions = await stripe.checkout.sessions.list({ payment_link: id, limit: 5 });
    if (sessions.data.some(s => s.payment_status === "paid")) out.paidVia = "Card";
  } catch {
    out.problems.push("Could not check whether the card link was used.");
  }

  try {
    await stripe.paymentLinks.update(id, { active: false });
    out.closed.push("Stripe card link deactivated");
  } catch {
    out.problems.push("Could not deactivate the Stripe link.");
  }
}

async function closePayPal(row: PaymentLinkRow, out: LinkClosure): Promise<void> {
  const id = row.paypal_invoice_id;
  if (!id || !paypalConfigured()) return;

  try {
    const read = await paypalFetch(`/v2/invoicing/invoices/${id}`, { method: "GET" });
    const status = (read.body as { status?: string } | null)?.status;

    if (status === "PAID" || status === "MARKED_AS_PAID") {
      out.paidVia = "PayPal";
      return; // Nothing to cancel — a paid invoice is already closed.
    }
    if (status === "CANCELLED") return;

    // Both flags false for the same reason they are on send: PayPal must not
    // email the client on this app's behalf.
    const cancelled = await paypalFetch(`/v2/invoicing/invoices/${id}/cancel`, {
      method: "POST",
      json: { send_to_invoicer: false, send_to_recipient: false },
    });
    if (cancelled.ok) out.closed.push("PayPal invoice cancelled");
    else out.problems.push("Could not cancel the PayPal invoice.");
  } catch {
    out.problems.push("Could not reach PayPal to cancel the invoice.");
  }
}

/**
 * Closes both providers and records that it happened.
 *
 * Every failure is collected rather than thrown: this runs as a side effect of
 * marking a payment received, and a provider being unreachable must never stop
 * the money being recorded.
 */
export async function closePaymentLinks(row: PaymentLinkRow): Promise<LinkClosure> {
  const out: LinkClosure = { closed: [], paidVia: null, problems: [] };

  if (row.payment_links_closed_at) return out;
  if (!row.stripe_payment_link_id && !row.paypal_invoice_id) return out;

  await Promise.all([closeStripe(row, out), closePayPal(row, out)]);

  // Stamped even on partial failure, so a provider that is simply gone can't
  // make every future save retry it. The problems are reported to the caller.
  const patch: Record<string, unknown> = { payment_links_closed_at: new Date().toISOString() };
  // Only fills a blank — a method typed by hand is a first-hand account and
  // outranks anything inferred here.
  if (out.paidVia && !row.method.trim()) patch.method = out.paidVia;

  await supabaseAdmin.from("payments").update(patch).eq("id", row.id);
  return out;
}
