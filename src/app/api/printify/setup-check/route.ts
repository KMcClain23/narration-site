import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.PRINTIFY_API_KEY;

  // Get shops
  const shopsRes = await fetch("https://api.printify.com/v1/shops.json", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const shops = await shopsRes.json();

  if (!shops?.length) return NextResponse.json({ error: "No shops found", shops });

  const shopId = shops[0].id;

  // Get products
  const productsRes = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const products = await productsRes.json();

  return NextResponse.json({ shopId, shops, products });
}
