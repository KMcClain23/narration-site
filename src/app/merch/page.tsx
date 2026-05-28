"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart } from "@/context/CartContext";

const PRODUCT_ID = "6a18942f21f4508fc90277ff";
const VARIANT_ID = 101409;
const PRICE = 2500;

const IMAGES = {
  front: "https://images-api.printify.com/mockup/6a18942f21f4508fc90277ff/101409/93895/cotton-canvas-tote-bag.jpg?camera_label=front",
  lifestyle: "https://images-api.printify.com/mockup/6a18942f21f4508fc90277ff/101409/94286/cotton-canvas-tote-bag.jpg?camera_label=person-front",
};

export default function MerchPage() {
  const { addItem, openCart, count } = useCart();
  const [activeImage, setActiveImage] = useState<"front" | "lifestyle">("front");
  const [added, setAdded] = useState(false);

  const handleAddToCart = () => {
    addItem({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      title: "Cotton Canvas Tote Bag",
      price: PRICE,
      image: IMAGES.front,
    });
    openCart();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <main className="min-h-screen bg-[#06082E] text-white px-6 pt-28 pb-20">
      <div className="max-w-4xl mx-auto">

        {/* Cart icon */}
        <div className="flex justify-end mb-6">
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

          {/* Left — Images */}
          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#0A0D3A] border border-[#D4AF37]/10">
              <Image
                key={activeImage}
                src={IMAGES[activeImage]}
                alt="Cotton Canvas Tote Bag"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="flex gap-3">
              {(["front", "lifestyle"] as const).map(key => (
                <button
                  key={key}
                  onClick={() => setActiveImage(key)}
                  className={`relative h-20 w-20 rounded-xl overflow-hidden border-2 transition-all ${activeImage === key ? "border-[#D4AF37]" : "border-white/10 hover:border-white/30"}`}
                >
                  <Image src={IMAGES[key]} alt={key} fill className="object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Right — Details */}
          <div className="flex flex-col gap-5 justify-center">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest">Dean Miller Narration</span>
              <h1 className="text-3xl font-bold text-white">Cotton Canvas Tote Bag</h1>
              <p className="text-2xl font-bold text-[#D4AF37]">$25</p>
            </div>

            <p className="text-white/60 text-sm leading-relaxed">
              100% natural cotton canvas tote featuring the Dean Miller signature logo. One size — 15″ × 16″ with 20″ handles. Perfect for your next trip to the library.
            </p>

            <p className="text-white/30 text-xs">Print on demand · Ships in 5–10 business days</p>

            <button
              onClick={handleAddToCart}
              className="w-full py-3.5 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-all active:scale-95"
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
