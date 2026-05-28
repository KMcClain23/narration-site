import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (webhookSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      return NextResponse.json({ error: `Webhook signature verification failed: ${err}` }, { status: 400 });
    }
  } else {
    console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    event = JSON.parse(body) as Stripe.Event;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const items: { productId: string; variantId: number; quantity: number }[] = JSON.parse(
      session.metadata?.items ?? "[]"
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shipping = (session as any).shipping_details as { name?: string; address?: { country?: string; state?: string; line1?: string; line2?: string; city?: string; postal_code?: string } } | null;
    const address = shipping?.address;
    const name = shipping?.name ?? "Customer";
    const email = session.customer_details?.email ?? "";

    if (!address) {
      console.error("No shipping address in session", session.id);
      return NextResponse.json({ received: true });
    }

    const orderPayload = {
      external_id: session.id,
      label: "DMNarration.com Order",
      line_items: items.map(i => ({
        product_id: i.productId,
        variant_id: i.variantId,
        quantity: i.quantity,
      })),
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: name.split(" ")[0],
        last_name: name.split(" ").slice(1).join(" ") || "-",
        email,
        phone: "",
        country: address.country ?? "",
        region: address.state ?? "",
        address1: address.line1 ?? "",
        address2: address.line2 ?? "",
        city: address.city ?? "",
        zip: address.postal_code ?? "",
      },
    };

    const res = await fetch("https://api.printify.com/v1/shops/27717431/orders.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (res.ok) {
      console.log("Printify order created for session", session.id);
    } else {
      const err = await res.text();
      console.error("Printify order failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}
