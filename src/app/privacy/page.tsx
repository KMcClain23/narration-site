import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Dean Miller Narration",
  description: "Privacy policy for Dean Miller Narration.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#06082E] text-white px-6 py-28">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs font-bold text-[#D4AF37]/50 uppercase tracking-widest mb-4">Dean Miller Narration</p>
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <div className="h-0.5 w-14 bg-[#D4AF37] rounded-full mb-8" />
        <p className="text-white/40 text-sm mb-10">Last updated: May 2026</p>

        <div className="flex flex-col gap-8 text-white/70 text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold text-base mb-2">Information We Collect</h2>
            <p>When you make a purchase, we collect your name, email address, shipping address, and payment information. Payment details are processed securely by Stripe and are never stored on our servers.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">How We Use Your Information</h2>
            <p>Your information is used solely to fulfill your order, send order confirmations, and communicate about your purchase. We do not sell or share your personal information with third parties except as necessary to fulfill your order.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Third-Party Services</h2>
            <p>We use Stripe for payment processing and Printify for order fulfillment. Your shipping information is shared with Printify solely to produce and ship your order. Each service has its own privacy policy governing their use of your data.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Cookies</h2>
            <p>We use local storage to maintain your shopping cart between visits. No tracking cookies or third-party advertising cookies are used.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Contact</h2>
            <p>Questions about your data? Email us at <a href="mailto:deanmillernarrator@gmail.com" className="text-[#D4AF37] hover:underline">deanmillernarrator@gmail.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
