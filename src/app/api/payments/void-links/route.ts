import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { closePaymentLinks, type PaymentLinkRow } from "@/lib/close-payment-links";

export const dynamic = "force-dynamic";

/**
 * Retire the payment links on an invoice whose amount has changed.
 *
 * A Stripe link and a PayPal invoice both fix their amount at creation. Change
 * what the invoice bills afterwards and the link keeps charging the old figure
 * — silently, and to whoever still holds the URL. Voiding is the only honest
 * response: the old link stops working and a new one can be raised.
 *
 * Unlike settling, this also clears the stored ids, because the point is to
 * allow a replacement. Closing alone would leave the payment pointing at a dead
 * link and refusing to mint another.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const paymentId: string | undefined = body?.payment_id;
  if (!paymentId) {
    return NextResponse.json({ error: "A payment id is required." }, { status: 400 });
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select(
      "id, method, stripe_payment_link, stripe_payment_link_id, paypal_payment_link, " +
        "paypal_invoice_id, payment_links_closed_at",
    )
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
  }

  const row = payment as unknown as PaymentLinkRow & { paypal_payment_link: string | null };

  if (!row.stripe_payment_link_id && !row.paypal_invoice_id) {
    return NextResponse.json({ voided: [], alreadyPaid: null });
  }

  // closePaymentLinks asks each provider whether its link was used before
  // shutting it. If one says yes, the money is already in — voiding would
  // destroy the only record of how it arrived, and the invoice needs settling
  // rather than re-issuing.
  const closure = await closePaymentLinks({ ...row, payment_links_closed_at: null });

  if (closure.paidVia) {
    return NextResponse.json(
      {
        error: `That invoice was already paid by ${closure.paidVia}. Nothing was voided — record the payment instead of re-issuing it.`,
        alreadyPaid: closure.paidVia,
      },
      { status: 409 },
    );
  }

  await supabaseAdmin
    .from("payments")
    .update({
      stripe_payment_link: "",
      stripe_payment_link_id: "",
      paypal_payment_link: "",
      paypal_invoice_id: "",
      // Cleared with the ids: there is nothing left to have closed, and leaving
      // it set would stop a replacement link ever being retired in its turn.
      payment_links_closed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  return NextResponse.json({ voided: closure.closed, problems: closure.problems, alreadyPaid: null });
}
