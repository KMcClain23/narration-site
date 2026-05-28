import type { Metadata } from "next";

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
        <div className="w-full aspect-square bg-[#06082E] border border-[#D4AF37]/20 rounded-xl flex flex-col items-center justify-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-[#D4AF37]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <p className="text-white/20 text-xs uppercase tracking-widest">Mockup Coming Soon</p>
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
        Interested in getting early access?{" "}
        <a
          href="mailto:deanmillernarrator@gmail.com"
          className="text-[#D4AF37] hover:text-[#F0D060] transition-colors underline underline-offset-2"
        >
          Reach out directly
        </a>{" "}
        and I&apos;ll let you know when the shop opens.
      </p>

    </main>
  );
}
