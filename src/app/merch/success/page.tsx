"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

export default function MerchSuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[#06082E] text-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <svg className="h-20 w-20 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>

      <div className="flex flex-col gap-3 max-w-md">
        <h1 className="text-4xl font-bold text-white">Order Confirmed!</h1>
        <p className="text-white/50 text-base leading-relaxed">
          Thank you! You&apos;ll receive a shipping confirmation email when your order ships (typically 5–10 business days).
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
        <Link
          href="/merch"
          className="px-6 py-3 rounded-full bg-[#D4AF37] text-[#06082E] font-bold text-sm hover:bg-[#F0D060] transition-colors"
        >
          Return to Merch
        </Link>
        <Link
          href="/"
          className="text-sm text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
