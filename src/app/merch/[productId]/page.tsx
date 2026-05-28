import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailClient from "./ProductDetailClient";

export const revalidate = 3600;

interface Props {
  params: Promise<{ productId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params;
  const res = await fetch(
    `https://api.printify.com/v1/shops/27717431/products/${productId}.json`,
    {
      headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}` },
      next: { revalidate: 3600 },
    }
  );
  if (!res.ok) return { title: "Product — Dean Miller Narration" };
  const product = await res.json();
  return {
    title: `${product.title} — Dean Miller Narration`,
    description: product.description?.replace(/<[^>]+>/g, "").slice(0, 160),
  };
}

export default async function ProductPage({ params }: Props) {
  const { productId } = await params;
  const res = await fetch(
    `https://api.printify.com/v1/shops/27717431/products/${productId}.json`,
    {
      headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_KEY}` },
      next: { revalidate: 3600 },
    }
  );
  if (!res.ok) notFound();
  const product = await res.json();

  return <ProductDetailClient product={product} />;
}
