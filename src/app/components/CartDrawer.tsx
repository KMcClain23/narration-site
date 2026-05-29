"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/context/CartContext";

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (data.url) {
        clearCart();
        window.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={closeCart}
      />

      {/*
        Mobile: bottom sheet (slides up, rounded top, max 85dvh)
        Desktop sm+: side drawer (slides from right, full height)
      */}
      <div
        className={[
          "fixed z-50 flex flex-col",
          "bg-[#0A0D3A] border-[#D4AF37]/20 shadow-2xl",
          "transition-transform duration-300",
          // Mobile positioning + size
          "bottom-0 left-0 right-0 w-full max-h-[85dvh] rounded-t-2xl border-t",
          // Desktop overrides
          "sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:w-full sm:max-w-sm sm:h-[100dvh] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l",
          // Animation — mobile slides from bottom, desktop from right
          isOpen
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-y-0 sm:translate-x-full",
        ].join(" ")}
      >
        {/* Drag handle pill — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white">Your Cart</h2>
          <button onClick={closeCart} className="p-1 text-white/40 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
              <svg className="h-14 w-14 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-white/40 text-sm">Your cart is empty</p>
              <Link href="/merch" onClick={closeCart} className="text-[#D4AF37] text-sm underline underline-offset-2 hover:text-[#F0D060] transition-colors">
                Browse merch
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map(item => (
                <li key={item.variantId} className="flex gap-3 items-start">
                  <div className="relative h-16 w-16 rounded-lg overflow-hidden shrink-0 bg-[#06082E]">
                    <Image src={item.image} alt={item.title} fill className="object-cover" sizes="64px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    <p className="text-sm text-[#D4AF37]">${(item.price / 100).toFixed(2)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="h-6 w-6 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 flex items-center justify-center text-sm transition-colors"
                      >−</button>
                      <span className="text-sm text-white w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="h-6 w-6 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 flex items-center justify-center text-sm transition-colors"
                      >+</button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.variantId)}
                    className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none mt-0.5"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-white/10 flex flex-col gap-3 shrink-0">
            <div className="flex justify-between text-sm text-white/60">
              <span>Subtotal</span>
              <span>${(total / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-white/40">
              <span>+ Shipping calculated at checkout</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-3 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing…
                </>
              ) : "Checkout"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
