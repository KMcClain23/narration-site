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

function cleanDescription(html: string) {
  return html.replace(/(<br\s*\/?>\s*){2,}/gi, "<br>").trim();
}

export default function ProductDetailClient({ product }: { product: PrintifyProduct }) {
  const { addItem, openCart, count } = useCart();

  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);
  const defaultImage = product.images.find(img => img.is_default)?.src ?? product.images[0]?.src ?? "";

  const [activeImage, setActiveImage] = useState(defaultImage);
  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  const selectedVariant = enabledVariants.find(v => v.id === selectedVariantId) ?? enabledVariants[0];

  const colorOption = product.options.find(
    o => o.type === "color" || o.name.toLowerCase() === "color"
  );
  const hasColors = colorOption && enabledVariants.length > 1;

  const handleSelectVariant = (variantId: number, colorOptionId: number) => {
    setSelectedVariantId(variantId);
    const variantImg = product.images.find(img => img.variant_ids.includes(variantId))?.src;
    if (variantImg) setActiveImage(variantImg);
    void colorOptionId;
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;
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
    <main className="min-h-screen bg-[#06082E] text-white px-6 pt-28 pb-20">
      <div className="max-w-5xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/merch" className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Merch
          </Link>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">

          {/* Left — Image gallery */}
          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#0A0D3A] border border-[#D4AF37]/10">
              <Image
                src={activeImage}
                alt={product.title}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>

            {product.images.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(img.src)}
                    className={`relative h-16 w-16 rounded-lg overflow-hidden border-2 transition-all shrink-0 flex-col ${activeImage === img.src ? "border-[#D4AF37]" : "border-white/10 hover:border-white/30"}`}
                  >
                    <Image src={img.src} alt={img.position ?? `View ${i + 1}`} fill className="object-cover" sizes="64px" />
                    {img.position && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white/90 text-[9px] font-medium text-center py-0.5 capitalize leading-tight">
                        {img.position.replace(/-/g, " ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right — Product details */}
          <div className="flex flex-col gap-6 justify-center">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold text-white">{product.title}</h1>
              <p className="text-2xl font-bold text-[#D4AF37]">
                ${((selectedVariant?.price ?? 0) / 100).toFixed(0)}
              </p>
            </div>

            {product.description && (
              <div
                className="text-sm text-white/60 leading-relaxed prose prose-invert prose-sm max-w-none [&_a]:text-[#D4AF37]"
                dangerouslySetInnerHTML={{ __html: cleanDescription(product.description) }}
              />
            )}

            {hasColors && colorOption && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-white/40 uppercase tracking-widest">Color</p>
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
                        onClick={() => handleSelectVariant(matchingVariant.id, value.id)}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${isSelected ? "border-[#D4AF37] scale-110" : "border-transparent hover:border-white/40"}`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handleAddToCart}
              disabled={!selectedVariant}
              className="w-full py-3.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
