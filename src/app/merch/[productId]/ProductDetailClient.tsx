"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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


export default function ProductDetailClient({ product }: { product: PrintifyProduct }) {
  const { addItem, openCart, count, isOpen: cartOpen } = useCart();

  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);
  const defaultImage = product.images.find(img => img.is_default)?.src ?? product.images[0]?.src ?? "";

  const [activeImage, setActiveImage] = useState(defaultImage);
  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  const selectedVariant = enabledVariants.find(v => v.id === selectedVariantId) ?? enabledVariants[0];

  const colorOption = product.options.find(
    o => o.type === "color" || o.name.toLowerCase() === "color"
  );
  const hasColors = colorOption && enabledVariants.length > 1;

  const sizeOption = product.options.find(
    o => o.type === "size" || o.name.toLowerCase() === "size"
  );
  const hasSizes = sizeOption && enabledVariants.length > 1;

  const selectedSizeOptionId = sizeOption?.values.find(v =>
    selectedVariant?.options.includes(v.id)
  )?.id ?? null;

  const selectedColorOptionId = colorOption?.values.find(v =>
    selectedVariant?.options.includes(v.id)
  )?.id ?? null;

  // Only show images that belong to the selected variant (empty variant_ids = all variants)
  const visibleImages = product.images.filter(
    img => img.variant_ids.length === 0 || img.variant_ids.includes(selectedVariant?.id ?? 0)
  );

  // Show sticky bar when the main Add to Cart button scrolls out of view
  useEffect(() => {
    const el = addButtonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const handleSelectVariant = (variantId: number) => {
    setSelectedVariantId(variantId);
    const first = product.images.find(
      img => img.variant_ids.length === 0 || img.variant_ids.includes(variantId)
    );
    if (first) setActiveImage(first.src);
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

  // Swipe left/right to navigate images
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    const idx = visibleImages.findIndex(img => img.src === activeImage);
    if (dx < 0 && idx < visibleImages.length - 1) setActiveImage(visibleImages[idx + 1].src);
    else if (dx > 0 && idx > 0) setActiveImage(visibleImages[idx - 1].src);
  };

  const handleZoomMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoomOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const activeImageIndex = visibleImages.findIndex(img => img.src === activeImage);

  return (
    <>
      <main className="min-h-screen bg-[#06082E] text-white px-6 pt-28 pb-28 md:pb-20">
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

            {/* Left — image + thumbnails + buying controls */}
            <div className="flex flex-col gap-5">

              {/* Gallery: thumbnail strip (left on desktop) + main image */}
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">

                {/* Thumbnails — vertical strip on desktop, horizontal row below on mobile */}
                {visibleImages.length > 1 && (
                  <div className="order-2 md:order-1 flex flex-row flex-wrap gap-2 md:flex-col md:flex-nowrap shrink-0 md:w-[64px]">
                    {visibleImages.map((img, i) => (
                      <button
                        key={img.src}
                        onMouseEnter={() => setActiveImage(img.src)}
                        onClick={() => setActiveImage(img.src)}
                        className={`relative h-14 w-14 md:h-[60px] md:w-[60px] rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                          activeImage === img.src
                            ? "border-[#D4AF37]"
                            : "border-white/10 hover:border-white/40"
                        }`}
                      >
                        <Image
                          src={img.src}
                          alt={img.position ?? `View ${i + 1}`}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                        {img.position && img.position !== "other" && (
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white/90 text-[9px] font-medium text-center py-0.5 capitalize leading-tight">
                            {img.position.replace(/-/g, " ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Main image — zoom on desktop hover, lightbox on click, swipe on mobile */}
                <div className="order-1 md:order-2 flex-1">
                  <button
                    className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#0A0D3A] border border-[#D4AF37]/10 cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onMouseEnter={() => setZoom(true)}
                    onMouseLeave={() => setZoom(false)}
                    onMouseMove={handleZoomMove}
                  >
                    <Image
                      src={activeImage}
                      alt={product.title}
                      fill
                      className="object-cover select-none"
                      priority
                      sizes="(max-width: 768px) 100vw, 50vw"
                      style={{
                        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                        transform: zoom ? "scale(2)" : "scale(1)",
                        transition: "transform 0.15s ease",
                      }}
                    />
                    {visibleImages.length > 1 && (
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 sm:hidden pointer-events-none">
                        {visibleImages.map((_, i) => (
                          <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${
                              i === activeImageIndex ? "w-4 bg-[#D4AF37]" : "w-1.5 bg-white/30"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                </div>

              </div>

              {/* Color selector */}
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
                          onClick={() => handleSelectVariant(matchingVariant.id)}
                          className={`h-7 w-7 rounded-full border-2 transition-all ${isSelected ? "border-[#D4AF37] scale-110" : "border-transparent hover:border-white/40"}`}
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size selector */}
              {hasSizes && sizeOption && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-white/40 uppercase tracking-widest">Size</p>
                  <div className="flex flex-wrap gap-2">
                    {sizeOption.values.map(value => {
                      // Prefer a variant matching both this size and the current color; fall back to size-only
                      const matchingVariant =
                        enabledVariants.find(v =>
                          v.options.includes(value.id) &&
                          (selectedColorOptionId === null || v.options.includes(selectedColorOptionId))
                        ) ?? enabledVariants.find(v => v.options.includes(value.id));
                      if (!matchingVariant) return null;
                      const isSelected = value.id === selectedSizeOptionId;
                      return (
                        <button
                          key={value.id}
                          onClick={() => handleSelectVariant(matchingVariant.id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                            isSelected
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                              : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
                          }`}
                        >
                          {value.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add to Cart */}
              <button
                ref={addButtonRef}
                onClick={handleAddToCart}
                disabled={!selectedVariant}
                className="w-full py-3.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {added ? "Added ✓" : "Add to Cart"}
              </button>

            </div>

            {/* Right — title, price, description only */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-white">{product.title}</h1>
                <p className="text-2xl font-bold text-[#D4AF37]">
                  ${((selectedVariant?.price ?? 0) / 100).toFixed(0)}
                </p>
              </div>

              {product.description && (
                <div
                  dangerouslySetInnerHTML={{ __html: product.description }}
                  className="
                    text-white/70 text-sm leading-relaxed
                    [&_span]:!text-white/70
                    [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:mt-4 [&_table]:mb-6
                    [&_td]:!text-white/70 [&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-2
                    [&_tr:first-child_td]:font-bold [&_tr:first-child_td]:!text-[#D4AF37]
                    [&_p]:mb-3 [&_p:empty]:hidden
                  "
                />
              )}
            </div>

          </div>
        </div>
      </main>

      {/* Sticky Add to Cart bar — appears when main button is off-screen */}
      <div
        className={`fixed bottom-0 inset-x-0 z-30 px-5 py-4 bg-[#0A0D3A]/95 backdrop-blur-md border-t border-[#D4AF37]/20 transition-transform duration-300 ${showStickyBar && !cartOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{product.title}</p>
            <p className="text-[#D4AF37] font-bold text-sm">${((selectedVariant?.price ?? 0) / 100).toFixed(0)}</p>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={!selectedVariant}
            className="shrink-0 px-6 py-2.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-40"
          >
            {added ? "Added ✓" : "Add to Cart"}
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Prev / Next arrows */}
          {activeImageIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={e => { e.stopPropagation(); setActiveImage(visibleImages[activeImageIndex - 1].src); }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {activeImageIndex < visibleImages.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={e => { e.stopPropagation(); setActiveImage(visibleImages[activeImageIndex + 1].src); }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div
            className="relative w-full max-w-2xl aspect-square"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={activeImage}
              alt={product.title}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>

          {/* Dot indicators */}
          {visibleImages.length > 1 && (
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
              {visibleImages.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setActiveImage(visibleImages[i].src); }}
                  className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? "w-5 bg-[#D4AF37]" : "w-1.5 bg-white/30 hover:bg-white/50"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
