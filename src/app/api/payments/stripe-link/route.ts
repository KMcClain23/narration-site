import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";
import { grossUpForCard } from "@/lib/business-identity";

export const dynamic = "force-dynamic";

/**
 * Raise a Stripe Payment Link for one invoice.
 *
 * The stored link is returned unchanged if there already is one. Minting a
 * second link for the same money would leave two live URLs an author could pay
 * against, with no way afterwards to tell which was used — and no way to stop
 * the other being paid too.
 *
 * The charge is grossed up so the processing fee lands on the payer rather
 * than the narrator. Adding 2.9% would still leave a shortfall, because Stripe
 * takes its percentage of the larger figure as well.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const paymentId: string | undefined = body?.payment_id;
  const amountDue = Number(body?.amount_due);
  const title: string = String(body?.title ?? "Audiobook narration").slice(0, 200);
  const invoiceNumber: string = String(body?.invoice_number ?? "").slice(0, 60);

  if (!paymentId || !Number.isFinite(amountDue) || amountDue <= 0) {
    return NextResponse.json({ error: "A payment id and a positive amount are required." }, { status: 400 });
  }

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("payments")
    .select("id, stripe_payment_link")
    .eq("id", paymentId)
    .single();

  if (readErr || !existing) {
    return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
  }

  const { total, fee } = grossUpForCard(amountDue);

  if (existing.stripe_payment_link) {
    return NextResponse.json({ url: existing.stripe_payment_link, total, fee, reused: true });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: Math.round(total * 100),
      product_data: {
        name: invoiceNumber ? `${title} — invoice ${invoiceNumber}` : title,
      },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      // Enough to reconcile a payout back to an invoice without opening the app.
      metadata: { payment_id: paymentId, invoice_number: invoiceNumber, fee_added: String(fee) },

      // The payer is an author, not a shopper. Say what the extra is before
      // they reach the card field, so the total on screen matches the invoice
      // they were sent plus a fee they were told about.
      custom_text: {
        submit: {
          message:
            fee > 0
              ? `Includes a $${fee.toFixed(2)} card processing fee. Paying by Venmo instead avoids it.`
              : "Thank you.",
        },
      },

      // A real receipt they can file, not just a card statement line.
      invoice_creation: { enabled: true },

      // Tells them the invoice is settled, rather than dropping them on a bare
      // "payment received" page that leaves them wondering whether to follow up.
      after_completion: {
        type: "hosted_confirmation",
        hosted_confirmation: {
          custom_message: invoiceNumber
            ? `Thank you — invoice ${invoiceNumber} is paid in full. A receipt is on its way to your email.`
            : "Thank you — your payment is complete. A receipt is on its way to your email.",
        },
      },
    });

    await supabaseAdmin
      .from("payments")
      .update({ stripe_payment_link: link.url, stripe_payment_link_id: link.id })
      .eq("id", paymentId);

    return NextResponse.json({ url: link.url, total, fee, reused: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create the payment link.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
