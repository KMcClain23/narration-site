import { NextRequest, NextResponse } from "next/server";
import { paypalConfigured, paypalFetch } from "@/lib/paypal";
import { findPaymentBy, settleFromProvider } from "@/lib/settle-payment";

export const dynamic = "force-dynamic";

/**
 * PayPal tells us an invoice was paid.
 *
 * Unlike Stripe there is no local signature check — PayPal verifies its own
 * signature through an API call, so the raw body and five headers go back to
 * them and they answer SUCCESS or FAILURE. That means an unverifiable request
 * costs a round trip, which is the price of the design.
 *
 * The endpoint is public by necessity, so verification is the only gate: a
 * forged "invoice paid" would otherwise mark real money as received.
 */

const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

async function verify(req: NextRequest, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const headers = Object.fromEntries(
    SIGNATURE_HEADERS.map(h => [h, req.headers.get(h) ?? ""]),
  );
  if (Object.values(headers).some(v => !v)) return false;

  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    json: {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      // The body PayPal signed, parsed rather than re-serialised — re-encoding
      // would reorder keys and the signature would no longer match.
      webhook_event: JSON.parse(rawBody),
    },
  });

  return res.ok && (res.body as { verification_status?: string } | null)?.verification_status === "SUCCESS";
}

export async function POST(req: NextRequest) {
  if (!paypalConfigured() || !process.env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: "PayPal webhooks are not configured." }, { status: 500 });
  }

  const rawBody = await req.text();

  if (!(await verify(req, rawBody))) {
    // 401, not 400: PayPal retries a 5xx and gives up on a 4xx, and a request
    // that cannot be verified will never verify on a retry either.
    return NextResponse.json({ error: "Unverified" }, { status: 401 });
  }

  let event: { event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed event." }, { status: 400 });
  }

  // Only the paid event matters. Every other invoicing event is acknowledged
  // so PayPal stops resending it.
  if (event.event_type !== "INVOICING.INVOICE.PAID") {
    return NextResponse.json({ received: true });
  }

  // The id sits in different places depending on the event shape.
  const invoiceId = event.resource?.invoice?.id ?? event.resource?.id ?? "";
  const paymentId = await findPaymentBy("paypal_invoice_id", invoiceId);

  if (!paymentId) {
    console.log("PayPal invoice paid with no matching payment:", invoiceId);
    return NextResponse.json({ received: true });
  }

  const result = await settleFromProvider(paymentId, "PayPal");
  console.log(`Invoice ${paymentId}: ${result.reason}`);

  return NextResponse.json({ received: true });
}
