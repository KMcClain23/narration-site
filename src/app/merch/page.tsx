import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Merch — Dean Miller Narration",
  description: "Branded merch from Dean Miller Narration. Coming soon.",
};

export default function MerchPage() {
  return (
    <main className="min-h-screen bg-[#06082E] text-white flex flex-col items-center px-6 pt-32 pb-20">

      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-12 text-center">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold text-white">Merch</h1>
          <span className="text-[#D4AF37] border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
            Coming Soon
          </span>
        </div>
        <p className="text-white/50 text-base max-w-md">
          Branded gear for readers, listeners, and the bookish at heart.
        </p>
      </div>

      {/* Product Card */}
      <div className="bg-[#0A0D3A] border border-[#D4AF37]/20 shadow-2xl rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="relative w-full aspect-square bg-[#06082E]">
          <Image
            src="/merch/tote-placeholder.jpg"
            alt="Dean Miller Narration Tote Bag"
            fill
            className="object-cover"
          />
        </div>
        <div className="p-6 flex flex-col gap-3">
          <h2 className="text-lg font-bold text-white">
            Dean Miller Narration Tote Bag
          </h2>
          <p className="text-sm text-white/50 leading-relaxed">
            A sturdy, stylish tote featuring the Dean Miller signature logo. Perfect for your next trip to the library.
          </p>
          <button
            disabled
            className="mt-2 w-full py-3 rounded-full bg-[#D4AF37]/20 text-[#D4AF37]/50 border border-[#D4AF37]/20 text-sm font-bold cursor-not-allowed select-none"
          >
            Available Soon
          </button>
        </div>
      </div>

      {/* Notification line */}
      <p className="mt-10 text-sm text-white/40 text-center max-w-sm">
        Want to be notified when the shop opens?{" "}
        <Link href="/contact" className="text-[#D4AF37]/70 hover:text-[#D4AF37] underline underline-offset-2 transition-colors">
          Reach out via the contact page.
        </Link>
      </p>

    </main>
  );
}
