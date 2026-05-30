"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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

// Neutral dark shimmer used as blur placeholder for all product images
const BLUR_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function ProductCard({ product, index }: { product: PrintifyProduct; index: number }) {
  const { addItem, openCart } = useCart();

  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);
  const colorOption = product.options.find(
    o => o.type === "color" || o.name.toLowerCase() === "color"
  );
  const hasColors = colorOption && enabledVariants.length > 1;

  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  // Preload all variant images on mount so color switching is instant
  useEffect(() => {
    product.images.forEach(img => {
      const preload = new window.Image();
      preload.src = img.src;
    });
  }, [product.images]);

  const selectedVariant = enabledVariants.find(v => v.id === selectedVariantId) ?? enabledVariants[0];
  const defaultImage = product.images.find(img => img.is_default)?.src ?? product.images[0]?.src ?? "";
  const variantImage =
    product.images.find(img => img.variant_ids.includes(selectedVariant?.id ?? 0))?.src ?? defaultImage;

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
    <div className="group flex flex-col bg-[#0A0D3A] border border-[#D4AF37]/20 rounded-xl overflow-hidden hover:border-[#D4AF37]/50 hover:shadow-[0_0_32px_rgba(212,175,55,0.08)] transition-all duration-300">

      {/* Image with hover zoom + shine */}
      <Link href={`/merch/${product.id}`} className="relative aspect-square bg-[#06082E] block overflow-hidden">
        <Image
          src={variantImage}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={index < 3}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
        />
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
      </Link>

      <div className="flex flex-col gap-4 p-5 flex-1">
        <div>
          <Link
            href={`/merch/${product.id}`}
            className="text-sm font-bold text-white leading-snug hover:text-[#D4AF37] transition-colors block mb-2"
          >
            {product.title}
          </Link>
          <p className="text-xl font-bold text-[#D4AF37]">${(selectedVariant.price / 100).toFixed(0)}</p>
        </div>

        {hasColors && colorOption && (
          <div className="flex flex-wrap gap-2">
            {colorOption.values.map(value => {
              const matchingVariant = enabledVariants.find(v => v.options.includes(value.id));
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

function ComingSoonCard() {
  return (
    <div className="flex flex-col bg-[#0A0D3A]/40 border border-white/5 rounded-xl overflow-hidden">
      <div className="aspect-square bg-[#06082E]/40 flex items-center justify-center">
        <svg className="h-10 w-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div className="p-5 flex flex-col gap-1.5">
        <p className="text-sm font-bold text-white/20">More Coming Soon</p>
        <p className="text-xs text-white/15 leading-relaxed">New designs on the way. Check back soon.</p>
      </div>
    </div>
  );
}

export default function MerchClient({ products }: { products: PrintifyProduct[] }) {
  const { count, openCart } = useCart();

  return (
    <div className="min-h-screen bg-[#06082E] text-white">

      {/* Hero */}
      <div className="relative overflow-hidden pt-28 pb-14 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1040]/80 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-[#D4AF37]/[0.04] blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold text-[#D4AF37]/50 uppercase tracking-widest">
              Dean Miller Narration
            </span>
            <div>
              <h1 className="text-5xl sm:text-6xl font-bold text-white mb-3">Merch</h1>
              <div className="h-0.5 w-14 bg-[#D4AF37] rounded-full mb-4" />
              <p className="text-[#c8a96e]/70 text-xs leading-relaxed italic mt-2">Every purchase helps me keep doing the work I love, bringing stories to life, one voice at a time.</p>
            </div>
          </div>

          <button
            onClick={openCart}
            className="relative p-2 text-white/50 hover:text-white transition-colors mt-1 shrink-0"
          >
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
      </div>

      {/* Product grid */}
      <div className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          {products.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <ComingSoonCard />
              <ComingSoonCard />
              <ComingSoonCard />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
              <ComingSoonCard />
            </div>
          )}
          <div className="border-t border-white/5 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-white/20">
            <span>© {new Date().getFullYear()} Dean Miller Narration LLC. All rights reserved.</span>
            <span className="hidden sm:inline">·</span>
            <a href="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-white/50 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>

    </div>
  );
}
