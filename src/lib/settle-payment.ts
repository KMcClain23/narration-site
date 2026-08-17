import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paymentNarratorShare, type MoneyCard, type PaymentRow } from "@/lib/payments";
import { closePaymentLinks, type PaymentLinkRow } from "@/lib/close-payment-links";

/**
 * Record that a provider collected an invoice, and shut the other ways to pay.
 *
 * Shared by both webhooks so Stripe and PayPal settle a payment identically —
 * two copies of this would drift, and the one that drifted would be the one
 * that quietly recorded the wrong figure.
 */

const CARD_SELECT =
  "id, title, author, status, word_count, pfh_rate, payment_type, narration_format, " +
  "narrator_share_percent, co_narrator, production_type, production_company, released_at, deadline";

const PAYMENT_SELECT =
  "id, card_id, kind, period, label, amount_expected, due_on, invoiced_on, invoice_number, " +
  "amount_received, amount_gross, received_on, method, notes, sort_order, stripe_payment_link, " +
  "stripe_payment_link_id, paypal_payment_link, paypal_invoice_id, payment_links_closed_at, " +
  "payouts:payment_payouts(id, payment_id, payee_name, kind, amount, rate_pfh, paid_on, notes)";

export type SettleResult = { settled: boolean; reason: string };

/** Find the payment a provider's identifier belongs to. */
export async function findPaymentBy(
  column: "stripe_payment_link_id" | "paypal_invoice_id",
  value: string,
): Promise<string | null> {
  if (!value) return null;
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq(column, value)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function settleFromProvider(paymentId: string, method: string): Promise<SettleResult> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", paymentId)
    .single();

  if (!payment) return { settled: false, reason: "payment no longer exists" };

  const row = payment as unknown as PaymentRow & { card_id: string; method: string };

  // A provider can deliver the same event more than once, and PayPal will
  // resend one it thinks was not acknowledged. Settling twice would overwrite a
  // figure that may since have been corrected by hand.
  if (Number(row.amount_received) > 0) {
    return { settled: false, reason: "already recorded as received" };
  }

  const { data: card } = await supabaseAdmin
    .from("board_cards")
    .select(CARD_SELECT)
    .eq("id", row.card_id)
    .single();

  if (!card) return { settled: false, reason: "project no longer exists" };

  const { data: siblings } = await supabaseAdmin
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("card_id", row.card_id);

  const rows = (siblings ?? []) as unknown as PaymentRow[];
  // This payment, not the project. A card holding a deposit row and a delivery
  // row must not credit both when one of them is paid.
  const due = paymentNarratorShare(row, card as unknown as MoneyCard, rows);

  if (due == null) return { settled: false, reason: "no amount could be determined" };

  await supabaseAdmin
    .from("payments")
    .update({
      amount_received: Math.round(due * 100) / 100,
      received_on: new Date().toISOString().split("T")[0],
      // Only fills a blank: a method entered by hand is first-hand and outranks
      // one inferred from whichever provider happened to fire.
      ...(row.method?.trim() ? {} : { method }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  // The invoice is settled, so every remaining way to pay it is retired —
  // including, harmlessly, the one just used.
  await closePaymentLinks({
    ...(payment as unknown as PaymentLinkRow),
    method: row.method ?? "",
  });

  return { settled: true, reason: `recorded ${due.toFixed(2)} via ${method}` };
}
