import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Dean Miller Narration",
  description:
    "Privacy policy for Dean Miller Narration, covering this website and the DMN Admin Android app.",
};

export default function PrivacyPolicy() {
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
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <div className="h-0.5 w-14 bg-[#D4AF37] rounded-full mb-8" />
        <p className="text-white/40 text-sm mb-10">Last updated: August 2026</p>

        <div className="flex flex-col gap-8 text-white/70 text-sm leading-relaxed">
          <section>
            <p>
              This policy covers two separate things, and they collect different information from
              different people. The first is this website, including the merchandise store. The
              second is <strong className="text-white/90">DMN Admin</strong>, an Android app used
              privately by Dean Miller and the people he works with to run audiobook production.
            </p>
          </section>

          <div className="h-px bg-white/10" />

          <section>
            <p className="text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-3">Part one</p>
            <h2 className="text-white font-bold text-lg mb-2">This website and store</h2>
          </section>

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

          <div className="h-px bg-white/10" />

          <section>
            <p className="text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-3">Part two</p>
            <h2 className="text-white font-bold text-lg mb-2">The DMN Admin Android app</h2>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Who the App Is For</h2>
            <p>DMN Admin is a private tool for running Dean Miller Narration&rsquo;s own audiobook production. It is not a consumer app and has no public sign-up. Accounts are created by Dean and issued directly to the small number of people he works with, such as an editor. If you have not been given an account, there is nothing in the app for you to use.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">What the App Collects</h2>
            <p>To sign you in, the app collects your email address and password. Authentication is handled by Supabase, our hosted database provider, and your password is never stored on your device or visible to us. The app collects nothing else about you: no name, no phone number, no location, no contacts, no photos, and no files from your device.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">What the App Stores on Your Device</h2>
            <p>Only an encrypted sign-in token, so you are not asked to sign in every time you open the app. It is held in Android&rsquo;s encrypted storage and removed when you sign out. Device backup is switched off for this app, so that token is never copied into a Google account backup or restored onto another device.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">What the App Does Not Do</h2>
            <p>There is no analytics, no advertising, no tracking, and no crash reporting in the app. No third-party SDK collects anything from it. The only Android permission it requests is internet access, which it uses to reach our database and to load audiobook cover images from our own storage.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">What You Can See in the App</h2>
            <p>The app shows Dean Miller Narration&rsquo;s own production information &mdash; audiobook projects, schedules, progress, and for Dean&rsquo;s own account, business finances. What an account may see is decided by its role. Financial figures such as rates and payment terms are not sent to an editor&rsquo;s device at all: they are left out of the data the app requests, rather than merely hidden on screen.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Distribution and Testing</h2>
            <p>The app is distributed privately through Firebase App Distribution and Google Play internal testing. Those services are operated by Google and receive the email address of each invited tester in order to deliver the app to them. They have their own privacy policies governing that use.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Retention and Deletion</h2>
            <p>Account and production data is kept for as long as the account is in use and we have a working relationship. To have an account and its sign-in data deleted, email the address below and it will be removed. Uninstalling the app removes the stored sign-in token from your device immediately.</p>
          </section>

          <div className="h-px bg-white/10" />

          <section>
            <h2 className="text-white font-bold text-base mb-2">Changes to This Policy</h2>
            <p>If this policy changes in a way that affects what is collected or who it is shared with, the date at the top of this page will be updated.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Contact</h2>
            <p>Questions about your data, or a request to delete an account? Email us at <a href="mailto:dean@dmnarration.com" className="text-[#D4AF37] hover:underline">dean@dmnarration.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
