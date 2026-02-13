import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audiobook Narrator for Hire | Professional Character Driven Narration",
  description:
    "Hire a professional audiobook narrator delivering emotionally grounded, character driven performances across fiction genres. Broadcast quality audio, fast turnaround, and collaborative production.",
  alternates: {
    canonical: "https://dmnarration.com/audiobook-narrator",
  },
};

export default function AudiobookNarratorPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-16">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold">Professional Audiobook Narrator for Hire</h1>

        <p className="text-lg">
          I am Dean Miller, a professional audiobook narrator specializing in
          character driven, emotionally immersive storytelling. I work with
          authors and publishers to bring fiction to life through grounded
          performance, natural dialogue, and clean, broadcast quality audio.
        </p>

        {/* PRIMARY CTA: jump to the homepage contact section */}
        <div className="pt-2">
          <a
            href="/#contact"
            className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold hover:bg-[#E0C15A] transition"
          >
            Request availability
          </a>

          <p className="mt-3 text-sm text-black/70">
            Typical response within 24 to 48 hours.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">What Authors Hire Me For</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Emotionally grounded male and dual POV narration</li>
          <li>Character driven dialogue with distinct voices</li>
          <li>Strong pacing and narrative clarity</li>
          <li>Broadcast quality home studio production</li>
          <li>Clear communication and fast revisions</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Audiobook Narration Samples</h2>
        <p>
          Explore selected audiobook narration samples showcasing emotional
          performance, dialogue work, and character range.
        </p>

        {/* Replace with your audio players */}
        <div className="space-y-6">
          <div>
            <p className="font-medium">Character driven fiction sample</p>
            <p className="text-sm text-muted-foreground">
              Audiobook sample featuring emotionally restrained narration,
              intimate dialogue, and controlled pacing.
            </p>
          </div>

          <div>
            <p className="font-medium">Multi character dialogue sample</p>
            <p className="text-sm text-muted-foreground">
              Audiobook sample demonstrating clear voice separation and
              conversational flow across multiple characters.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Booking and Availability</h2>
        <p>
          I am currently accepting new audiobook projects. For availability,
          timelines, or rate information, please reach out using the contact
          form on this site.
        </p>

        {/* SECONDARY CTA: catches readers at the bottom */}
        <div className="pt-2">
          <a
            href="/#contact"
            className="inline-flex items-center justify-center rounded-md border border-black/20 px-6 py-3 font-semibold hover:border-black/40 transition"
          >
            Request availability
          </a>
        </div>
      </section>
    </main>
  );
}
