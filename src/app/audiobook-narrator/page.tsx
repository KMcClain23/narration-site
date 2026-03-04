import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  // Audit Fix: Refined title under 60 characters
  title: "Audiobook Narrator for Hire | Professional Fiction Narration",
  description:
    "Hire Dean Miller for professional, character-driven audiobook narration. Specializing in dark romance, romantasy, and drama with broadcast-quality home studio production.",
  alternates: {
    canonical: "https://dmnarration.com/audiobook-narrator",
  },
};

export default function AudiobookNarratorPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-16 text-white/90">
      <section className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">Professional Audiobook Narrator for Hire</h1>

        <p className="text-lg leading-relaxed">
          I am Dean Miller, a professional audiobook narrator working with authors and publishers on character-driven, emotionally immersive fiction. I specialize in grounded performance, natural dialogue, and clean, broadcast-quality audio that supports long-form listening. My focus is on clear communication, reliable turnaround, and performances that respect the emotional truth of the story.
        </p>

        <div className="pt-2">
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-8 py-4 font-bold hover:bg-[#E0C15A] transition active:scale-95"
          >
            Request Project Availability
          </Link>

          <p className="mt-3 text-sm text-white/50">
            Typical response within 24 to 48 hours. Professional inquiries only.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Audiobook Narration Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {/* Audit Fix: Using H3 for service categories */}
            <h3 className="font-bold text-[#D4AF37]">Genre Specialization</h3>
            <p className="text-sm text-white/70">Expertise in Dark Romance, Romantasy, Thriller, and Drama. I provide emotionally grounded male and dual POV narration.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#D4AF37]">Character Performance</h3>
            <p className="text-sm text-white/70">Character-driven dialogue with distinct, consistent voices and strong narrative clarity for immersive storytelling.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#D4AF37]">Technical Excellence</h3>
            <p className="text-sm text-white/70">Broadcast-quality home studio production using professional-grade hardware for ACX-ready, clean audio delivery.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#D4AF37]">Collaborative Workflow</h3>
            <p className="text-sm text-white/70">Proactive communication, fast revisions, and a reliable turnaround to meet your publishing deadlines.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Standard Narration Rates</h2>
        <p className="text-sm leading-relaxed text-white/70">
          I offer competitive Per Finished Hour (PFH) rates for independent authors and publishers. Rates typically include professional recording, editing, and mastering to industry standards (ACX/Audible). 
        </p>
        <ul className="list-disc pl-6 space-y-2 text-sm text-white/80">
          <li><strong>Fiction PFH:</strong> Starting rates available upon project review.</li>
          <li><strong>Royalty Share Plus:</strong> Selective availability for established titles.</li>
          <li><strong>Proofing & Mastering:</strong> Included in standard PFH rates.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Booking and Availability</h2>
        <p className="text-sm text-white/80 leading-relaxed">
          I am currently accepting new audiobook projects for {new Date().getFullYear()}. For specific availability, 
          detailed timelines, or custom audition requests, please reach out via the contact 
          form. I look forward to bringing your characters to life.
        </p>
        <div className="mt-6">
           <Link href="/narrated-works" className="text-[#D4AF37] hover:underline font-medium">View my full portfolio of narrated works →</Link>
        </div>
      </section>
    </main>
  );
}