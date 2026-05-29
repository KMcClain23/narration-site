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
      const sessionId = (event.data.object as Stripe.Checkout.Session).id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = session as any;

      // Log for debugging
      console.log("shipping_details:", JSON.stringify(s.shipping_details));
      console.log("customer_details:", JSON.stringify(session.customer_details));
      console.log("collected_information:", JSON.stringify(s.collected_information));
      console.log("metadata:", session.metadata);

      // Try all possible address locations (varies by Stripe API version)
      const collectedInfo = s.collected_information;
      const shippingDetails = s.shipping_details ?? collectedInfo?.shipping_details;

      const shippingAddress = shippingDetails?.address ?? session.customer_details?.address;
      const shippingName = shippingDetails?.name ?? session.customer_details?.name ?? "Customer";

      if (!shippingAddress) {
        console.error("No address found. Session keys:", Object.keys(session));
        return NextResponse.json({ received: true });
      }

      // Parse items from metadata
      const items = JSON.parse(session.metadata?.items ?? "[]");
      if (!items.length) {
        console.error("No items in metadata. Full metadata:", session.metadata);
        return NextResponse.json({ received: true });
      }

      const nameParts = shippingName.split(" ");
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
          email: session.customer_details?.email ?? "",
          phone: "",
          country: shippingAddress.country ?? "US",
          region: shippingAddress.state ?? "",
          address1: shippingAddress.line1 ?? "",
          address2: shippingAddress.line2 ?? "",
          city: shippingAddress.city ?? "",
          zip: shippingAddress.postal_code ?? "",
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
