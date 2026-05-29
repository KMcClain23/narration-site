import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      // Retrieve full session with shipping details expanded
      const session = await stripe.checkout.sessions.retrieve(
        (event.data.object as Stripe.Checkout.Session).id,
        { expand: ["shipping_details"] }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = session as any;
      console.log("Session shipping_details:", JSON.stringify(s.shipping_details));
      console.log("Session metadata:", session.metadata);
      console.log("Session customer_details:", JSON.stringify(session.customer_details));

      const shipping = s.shipping_details as { name?: string; address?: { country?: string; state?: string; line1?: string; line2?: string | null; city?: string; postal_code?: string } } | null;
      const customer = session.customer_details;

      if (!shipping?.address) {
        console.error("No shipping address found. Full session:", JSON.stringify(session));
        return NextResponse.json({ received: true });
      }

      const items = JSON.parse(session.metadata?.items ?? "[]");
      if (!items.length) {
        console.error("No items in metadata");
        return NextResponse.json({ received: true });
      }

      const nameParts = (shipping.name ?? customer?.name ?? "").split(" ");
      const firstName = nameParts[0] ?? "Customer";
      const lastName = nameParts.slice(1).join(" ") || "-";

      const orderPayload = {
        external_id: session.id,
        label: "DMNarration.com Order",
        line_items: items.map((i: { productId: string; variantId: number; quantity: number }) => ({
          product_id: i.productId,
          variant_id: i.variantId,
          quantity: i.quantity,
        })),
        shipping_method: 1,
        send_shipping_notification: true,
        address_to: {
          first_name: firstName,
          last_name: lastName,
          email: customer?.email ?? "",
          phone: "",
          country: shipping.address.country ?? "US",
          region: shipping.address.state ?? "",
          address1: shipping.address.line1 ?? "",
          address2: shipping.address.line2 ?? "",
          city: shipping.address.city ?? "",
          zip: shipping.address.postal_code ?? "",
        },
      };

      console.log("Sending to Printify:", JSON.stringify(orderPayload));

      const printifyRes = await fetch(
        `https://api.printify.com/v1/shops/27717431/orders.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderPayload),
        }
      );

      const printifyData = await printifyRes.json();
      console.log("Printify response:", JSON.stringify(printifyData));

      if (!printifyRes.ok) {
        console.error("Printify order failed:", printifyData);
      } else {
        console.log("Printify order created successfully:", printifyData.id);
      }
    } catch (err) {
      console.error("Error processing order:", err);
    }
  }

  return NextResponse.json({ received: true });
}
