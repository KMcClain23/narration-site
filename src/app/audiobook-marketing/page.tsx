import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audiobook Marketing Guide | Dean Miller Narration",
  description:
    "Learn how to promote your audiobook effectively with proven strategies, promo code distribution, and social media tips from audiobook narrator Dean Miller.",
  alternates: {
    canonical: "https://dmnarration.com/audiobook-marketing",
  },
  openGraph: {
    title: "Audiobook Marketing Guide | Dean Miller Narration",
    description:
      "Simple, effective ways to promote your audiobook and grow your audience.",
    url: "https://dmnarration.com/audiobook-marketing",
    type: "website",
  },
};

export default function AudiobookMarketingPage() {
  return (
    <main className="w-full px-6 py-16 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-6">
        Audiobook Marketing Guide
      </h1>

      <p className="text-lg text-gray-300 mb-10">
        Once your audiobook is complete, the next step is getting it in front of listeners.
        Here are a few simple, effective ways to build awareness and drive engagement.
      </p>

      {/* SECTION 1 */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          1. Use Your Existing Audience
        </h2>
        <p className="text-gray-300 mb-4">
          Your current readers are your strongest starting point.
        </p>
        <ul className="list-disc pl-6 text-gray-300 space-y-2">
          <li>Announce your audiobook on social media</li>
          <li>Send it to your email list or newsletter</li>
          <li>Update your website with audio links</li>
        </ul>
      </section>

      {/* SECTION 2 */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          2. Leverage Promo Codes
        </h2>
        <p className="text-gray-300 mb-4">
          Platforms like ACX and Findaway provide promo codes that can be exchanged for reviews or used in giveaways.
        </p>
        <ul className="list-disc pl-6 text-gray-300 space-y-2">
          <li>Offer codes in exchange for honest reviews</li>
          <li>Run giveaways on social media</li>
          <li>Share codes with your most engaged readers</li>
        </ul>
      </section>

      {/* SECTION 3 */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          3. Use Review Platforms
        </h2>
        <p className="text-gray-300 mb-4">
          These platforms help connect your audiobook with listeners actively looking for new titles.
        </p>

        <ul className="list-disc pl-6 text-gray-300 space-y-2">
          <li>
            <a
              href="https://audiobookboom.com/authors"
              target="_blank"
              className="underline"
            >
              Audiobook Boom
            </a>
          </li>
          <li>
            <a
              href="https://theaudiobookworm.com/"
              target="_blank"
              className="underline"
            >
              The Audiobook Worm
            </a>
          </li>
          <li>
            <a
              href="https://freeaudiobookcodes.com/"
              target="_blank"
              className="underline"
            >
              Free Audiobook Codes
            </a>
          </li>
        </ul>
      </section>

      {/* SECTION 4 */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          4. Create Audio-Based Content
        </h2>
        <p className="text-gray-300 mb-4">
          Audiobooks sell best when people can hear them.
        </p>
        <ul className="list-disc pl-6 text-gray-300 space-y-2">
          <li>Post short audio clips from key scenes</li>
          <li>Share character moments or dialogue</li>
          <li>Use TikTok, Instagram Reels, and YouTube Shorts</li>
        </ul>
      </section>

      {/* SECTION 5 */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">
          5. Collaborate
        </h2>
        <p className="text-gray-300 mb-4">
          Cross-promotion expands your reach quickly.
        </p>
        <ul className="list-disc pl-6 text-gray-300 space-y-2">
          <li>Appear on podcasts</li>
          <li>Partner with narrators or influencers</li>
          <li>Engage in reader communities</li>
        </ul>
      </section>

      {/* FINAL CTA */}
      <section className="mt-16 border-t border-gray-700 pt-10">
        <h2 className="text-2xl font-semibold mb-4">
          Want Help Promoting Your Audiobook?
        </h2>
        <p className="text-gray-300 mb-6">
          I’m happy to provide custom audio clips, promotional content, or collaborate on marketing ideas.
        </p>

        <a
          href="/contact"
          className="inline-block bg-white text-black px-6 py-3 rounded-lg font-semibold"
        >
          Get in Touch
        </a>
      </section>
    </main>
  );
}