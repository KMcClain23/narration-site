import type { Metadata } from "next";
import MerchClient from "./MerchClient";

export const metadata: Metadata = {
  title: "Merch — Dean Miller Narration",
  description: "Branded merch from Dean Miller Narration.",
};

export const revalidate = 3600;

export default async function MerchPage() {
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

  return (
    <>
      <link rel="preconnect" href="https://images-api.printify.com" />
      <MerchClient products={products} />
    </>
  );
}
