"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/context/CartContext";

interface PrintifyVariant {
  id: number;
  title: string;
  price: number;
  is_enabled: boolean;
  is_available: boolean;
  options: number[];
}

interface PrintifyImage {
  src: string;
  is_default: boolean;
  position: string;
  variant_ids: number[];
}

interface PrintifyOption {
  name: string;
  type: string;
  values: { id: number; title: string; colors?: string[] }[];
}

interface PrintifyProduct {
  id: string;
  title: string;
  description: string;
  variants: PrintifyVariant[];
  images: PrintifyImage[];
  options: PrintifyOption[];
}

function ProductCard({ product }: { product: PrintifyProduct }) {
  const { addItem, openCart } = useCart();

  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);

  const colorOption = product.options.find(
    o => o.type === "color" || o.name.toLowerCase() === "color"
  );
  const hasColors = colorOption && enabledVariants.length > 1;

  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  const selectedVariant = enabledVariants.find(v => v.id === selectedVariantId) ?? enabledVariants[0];

  const defaultImage =
    product.images.find(img => img.is_default)?.src ??
    product.images[0]?.src ??
    "";

  const variantImage =
    product.images.find(img => img.variant_ids.includes(selectedVariant?.id ?? 0))?.src ??
    defaultImage;

  if (!selectedVariant) return null;

  const handleAdd = () => {
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      title: product.title,
      price: selectedVariant.price,
      image: defaultImage,
    });
    openCart();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="flex flex-col bg-[#0A0D3A] border border-[#D4AF37]/20 rounded-xl overflow-hidden hover:border-[#D4AF37]/40 transition-colors">
      <Link href={`/merch/${product.id}`} className="relative aspect-square bg-[#06082E] block">
        <Image
          src={variantImage}
          alt={product.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      </Link>

      <div className="flex flex-col gap-3 p-5 flex-1">
        <div className="flex flex-col gap-1">
          <Link href={`/merch/${product.id}`} className="text-sm font-bold text-white leading-snug hover:text-[#D4AF37] transition-colors">{product.title}</Link>
          <p className="text-[#D4AF37] font-bold">${(selectedVariant.price / 100).toFixed(0)}</p>
        </div>

        {hasColors && colorOption && (
          <div className="flex flex-wrap gap-2">
            {colorOption.values.map(value => {
              const matchingVariant = enabledVariants.find(v =>
                v.options.includes(value.id)
              );
              if (!matchingVariant) return null;
              const color = value.colors?.[0] ?? "#888";
              const isSelected = matchingVariant.id === selectedVariantId;
              return (
                <button
                  key={value.id}
                  title={value.title}
                  onClick={() => setSelectedVariantId(matchingVariant.id)}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${isSelected ? "border-[#D4AF37] scale-110" : "border-transparent hover:border-white/40"}`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        )}

        <button
          onClick={handleAdd}
          className="mt-auto w-full py-2.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95"
        >
          {added ? "Added ✓" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

export default function MerchClient({ products }: { products: PrintifyProduct[] }) {
  const { count, openCart } = useCart();

  return (
    <main className="min-h-screen bg-[#06082E] text-white px-6 pt-28 pb-20">
      <div className="max-w-5xl mx-auto">

        {/* Cart icon */}
        <div className="flex justify-end mb-8">
          <button onClick={openCart} className="relative p-2 text-white/60 hover:text-white transition-colors">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#D4AF37] text-[#06082E] text-[10px] font-bold flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-2 mb-10">
          <h1 className="text-4xl font-bold text-white">Merch</h1>
          <p className="text-[#D4AF37]/70 text-sm">Branded gear for readers and bookish souls</p>
        </div>

        {/* Grid */}
        {products.length === 0 ? (
          <p className="text-white/40 text-sm">No products available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
