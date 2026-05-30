import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Dean Miller Narration",
  description: "Terms of service for Dean Miller Narration.",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#06082E] text-white px-6 py-28">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors mb-10">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
        <p className="text-xs font-bold text-[#D4AF37]/50 uppercase tracking-widest mb-4">Dean Miller Narration</p>
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <div className="h-0.5 w-14 bg-[#D4AF37] rounded-full mb-8" />
        <p className="text-white/40 text-sm mb-10">Last updated: May 2026</p>

        <div className="flex flex-col gap-8 text-white/70 text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold text-base mb-2">Orders & Payment</h2>
            <p>All orders are processed in USD through Stripe. By completing a purchase you confirm that you are authorized to use the payment method provided. Prices are subject to change without notice.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Fulfillment & Shipping</h2>
            <p>Orders are fulfilled through Printify and typically ship within 3–7 business days. US shipping is free. International orders ship for a flat rate of $13.99. Delivery times vary by destination and are not guaranteed.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Returns & Refunds</h2>
            <p>Because our products are printed on demand, we do not accept returns or exchanges unless an item arrives damaged or defective. If there is a problem with your order, contact us within 14 days of delivery and we will make it right.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Intellectual Property</h2>
            <p>All designs, graphics, and branding on this site are the property of Dean Miller Narration LLC. Products purchased are for personal use only and may not be reproduced or resold.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Contact</h2>
            <p>Questions? Reach us at <a href="mailto:deanmillernarrator@gmail.com" className="text-[#D4AF37] hover:underline">deanmillernarrator@gmail.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
