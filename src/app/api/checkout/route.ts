import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { CartItem } from "@/context/CartContext";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const { items }: { items: CartItem[] } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: items.map(item => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.title, images: [item.image] },
        unit_amount: item.price,
      },
      quantity: item.quantity,
    })),
    shipping_address_collection: { allowed_countries: ["US", "CA", "GB", "AU", "NZ", "DE", "FR", "IE", "SE", "NO", "DK", "NL"] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 0, currency: "usd" },
          display_name: "Free US Shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 5 },
            maximum: { unit: "business_day", value: 10 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 1399, currency: "usd" },
          display_name: "International Shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 10 },
            maximum: { unit: "business_day", value: 21 },
          },
        },
      },
    ],
    metadata: {
      items: JSON.stringify(
        items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }))
      ),
    },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/merch`,
  });

  console.log("Created session with metadata:", session.metadata);

  return NextResponse.json({ url: session.url });
}
