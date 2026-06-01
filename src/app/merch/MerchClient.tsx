"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── Quick-view modal ──────────────────────────────────────────────────────────

function QuickViewModal({
  product,
  onClose,
}: {
  product: PrintifyProduct;
  onClose: () => void;
}) {
  const { addItem, openCart } = useCart();
  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);
  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

  const selectedVariant = enabledVariants.find(v => v.id === selectedVariantId) ?? enabledVariants[0];
  const colorOption = product.options.find(o => o.type === "color" || o.name.toLowerCase() === "color");
  const hasColors = colorOption && enabledVariants.length > 1;
  const sizeOption = product.options.find(o => o.type === "size" || o.name.toLowerCase() === "size");
  const hasSizes = sizeOption && enabledVariants.length > 1;
  const defaultImage = product.images.find(img => img.is_default)?.src ?? product.images[0]?.src ?? "";
  const variantImage =
    product.images.find(img => img.variant_ids.includes(selectedVariant?.id ?? 0))?.src ?? defaultImage;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleAdd = () => {
    if (!selectedVariant) return;
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      title: product.title,
      price: selectedVariant.price,
      image: defaultImage,
    });
    onClose();
    openCart();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#0A0D3A] border border-[#D4AF37]/20 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-bold text-white text-base truncate pr-4">{product.title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-white/40 hover:text-white transition-colors shrink-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row gap-5 p-5">
          {/* Image */}
          <div className="relative w-full sm:w-52 aspect-square shrink-0 rounded-xl overflow-hidden bg-[#06082E] border border-[#D4AF37]/10">
            <Image
              src={variantImage}
              alt={product.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 208px"
            />
          </div>

          {/* Details */}
          <div className="flex flex-col gap-4 flex-1 min-w-0">
            <p className="text-2xl font-bold text-[#D4AF37]">
              ${((selectedVariant?.price ?? 0) / 100).toFixed(0)}
            </p>

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
                        onClick={() => setSelectedVariantId(matchingVariant.id)}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${
                          isSelected ? "border-[#D4AF37] scale-110" : "border-transparent hover:border-white/40"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {hasSizes && sizeOption && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-white/40 uppercase tracking-widest">Size</p>
                <div className="flex flex-wrap gap-1.5">
                  {sizeOption.values.map(value => {
                    const matchingVariant = enabledVariants.find(v => v.options.includes(value.id));
                    if (!matchingVariant) return null;
                    const isSelected = matchingVariant.id === selectedVariantId;
                    return (
                      <button
                        key={value.id}
                        onClick={() => setSelectedVariantId(matchingVariant.id)}
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

            <button
              onClick={handleAdd}
              disabled={!selectedVariant}
              className="w-full py-3 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-40 mt-auto"
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>

            <Link
              href={`/merch/${product.id}`}
              onClick={onClose}
              className="text-center text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
            >
              View full product details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Email capture ─────────────────────────────────────────────────────────────

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/merch/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="border-t border-white/5 mt-14 pt-12 pb-2 text-center">
      <h3 className="text-white font-bold text-lg mb-1">New drops. First to know.</h3>
      <p className="text-white/40 text-sm mb-6">No spam. Just new merch when it lands.</p>
      {status === "success" ? (
        <p className="text-emerald-400 text-sm font-medium">You&apos;re in. ✓</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="flex-1 bg-[#0A0D3A] border border-[#1A2070] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#D4AF37]/50 transition"
          />
          <button
            type="submit"
            disabled={status === "submitting"}
            className="px-5 py-2.5 rounded-lg bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition disabled:opacity-60"
          >
            {status === "submitting" ? "…" : "Subscribe"}
          </button>
        </form>
      )}
      {status === "error" && (
        <p className="text-red-400 text-xs mt-2">Something went wrong. Try again.</p>
      )}
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  index,
  onQuickView,
}: {
  product: PrintifyProduct;
  index: number;
  onQuickView: (p: PrintifyProduct) => void;
}) {
  const { addItem, openCart } = useCart();

  const enabledVariants = product.variants.filter(v => v.is_enabled && v.is_available);
  const colorOption = product.options.find(
    o => o.type === "color" || o.name.toLowerCase() === "color"
  );
  const hasColors = colorOption && enabledVariants.length > 1;

  const [selectedVariantId, setSelectedVariantId] = useState(enabledVariants[0]?.id ?? null);
  const [added, setAdded] = useState(false);

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

      {/* Image — click opens quick-view */}
      <button
        onClick={() => onQuickView(product)}
        aria-label={`Quick view ${product.title}`}
        className="relative aspect-square bg-[#06082E] w-full overflow-hidden cursor-zoom-in"
      >
        <Image
          src={variantImage}
          alt={product.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1200px) 50vw, 33vw"
          priority={index < 4}
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
        />
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
            Quick View
          </span>
        </div>
      </button>

      <div className="flex flex-col gap-3 p-3 sm:p-5 flex-1">
        <div>
          <Link
            href={`/merch/${product.id}`}
            className="text-xs sm:text-sm font-bold text-white leading-snug hover:text-[#D4AF37] transition-colors block mb-1.5"
          >
            {product.title}
          </Link>
          <p className="text-lg sm:text-xl font-bold text-[#D4AF37]">
            ${(selectedVariant.price / 100).toFixed(0)}
          </p>
        </div>

        {hasColors && colorOption && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                  className={`h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 transition-all ${
                    isSelected ? "border-[#D4AF37] scale-110" : "border-transparent hover:border-white/40"
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        )}

        <button
          onClick={handleAdd}
          className="mt-auto w-full py-2 sm:py-2.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-xs sm:text-sm hover:bg-[#F0D060] transition-all active:scale-95"
        >
          {added ? "Added ✓" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

// ── Coming soon placeholder ───────────────────────────────────────────────────

function ComingSoonCard() {
  return (
    <div className="flex flex-col bg-[#0A0D3A]/40 border border-white/5 rounded-xl overflow-hidden">
      <div className="aspect-square bg-[#06082E]/40 flex items-center justify-center">
        <svg className="h-10 w-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div className="p-3 sm:p-5 flex flex-col gap-1.5">
        <p className="text-xs sm:text-sm font-bold text-white/20">More Coming Soon</p>
        <p className="text-[10px] sm:text-xs text-white/15 leading-relaxed">New designs on the way. Check back soon.</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MerchClient({ products }: { products: PrintifyProduct[] }) {
  const { count, openCart, total, isOpen: cartOpen } = useCart();
  const [quickViewProduct, setQuickViewProduct] = useState<PrintifyProduct | null>(null);

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
              <p className="text-[#c8a96e]/70 text-xs leading-relaxed italic mt-2">
                Every purchase helps me keep doing the work I love, bringing stories to life, one voice at a time.
              </p>
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
      <div className="px-4 sm:px-6 pb-32 sm:pb-24">
        <div className="max-w-5xl mx-auto">
          {products.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              <ComingSoonCard />
              <ComingSoonCard />
              <ComingSoonCard />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              {products.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  onQuickView={setQuickViewProduct}
                />
              ))}
              <ComingSoonCard />
            </div>
          )}

          <EmailCapture />

          <div className="border-t border-white/5 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-white/20">
            <span>© {new Date().getFullYear()} Dean Miller Narration LLC. All rights reserved.</span>
            <span className="hidden sm:inline">·</span>
            <a href="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-white/50 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>

      {/* Quick-view modal */}
      {quickViewProduct && (
        <QuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}

      {/* Mobile sticky View Cart bar — hidden when cart drawer is open */}
      {count > 0 && !cartOpen && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30">
          <button
            onClick={openCart}
            className="w-full bg-[#D4AF37] text-[#06082E] font-bold text-sm px-5 py-4 flex items-center justify-center gap-1"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            View Cart · {count} item{count !== 1 ? "s" : ""} — ${(total / 100).toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
}
