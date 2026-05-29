import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch(
    `https://api.printify.com/v1/shops/27717431/products.json`,
    {
      headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}` },
      next: { revalidate: 3600 },
    }
  );
  const data = await res.json();
  const products = (data.data ?? []).filter(
    (p: { visible: boolean; is_deleted: boolean }) =>
      p.visible === true && p.is_deleted === false
  );
  return NextResponse.json(products);
}
