"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";

/**
 * Isolated component to handle the "sent" success message.
 * This prevents the entire page from failing the static build.
 */
function SentMessage() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";

  if (!sent) return null;

  return (
    <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
      Thanks, your inquiry was sent. I will reply soon.
    </div>
  );
}

function MediaLightbox({
  isOpen,
  onClose,
  title,
  src,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  src: string;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-[#1A2550] bg-[#050814] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="mt-4 relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#1A2550] bg-black/30">
          <Image src={src} alt={title} fill className="object-contain" />
        </div>
      </div>
    </div>
  );
}

function ProofPoints() {
  return (
    <>
      {/* Mobile: single clean strip */}
      <div className="sm:hidden mt-7 rounded-xl border border-[#1A2550] bg-[#0B1224] p-4 shadow-lg">
        <p className="text-sm font-semibold text-white">Quick highlights</p>
        <ul className="mt-2 space-y-2 text-sm text-white/75">
          <li>• Broadcast-ready workflow</li>
          <li>• Reliable turnaround</li>
          <li>• Easy to direct</li>
        </ul>
      </div>

      {/* Desktop: three cards */}
      <div className="hidden sm:grid mt-8 grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
          <p className="font-semibold text-white">Broadcast-ready workflow</p>
          <p className="mt-1 text-sm text-white/70">Clean, consistent delivery</p>
        </div>

        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
          <p className="font-semibold text-white">Reliable turnaround</p>
          <p className="mt-1 text-sm text-white/70">Clear deadlines and updates</p>
        </div>

        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
          <p className="font-semibold text-white">Easy to direct</p>
          <p className="mt-1 text-sm text-white/70">Notes, pickups, fast revisions</p>
        </div>
      </div>
    </>
  );
}

function AtAGlanceCard({
  onOpenLightbox,
}: {
  onOpenLightbox: (src: string, title: string) => void;
}) {
  return (
    <div className="relative rounded-2xl border border-[#1A2550] bg-[#050814] p-6 shadow-xl">
      <p className="text-xs uppercase tracking-[0.22em] text-[#D4AF37]">
        At a glance
      </p>

      <p className="mt-2 text-lg font-semibold text-white">
        Dean Miller, Audiobook Narrator
      </p>

      <p className="mt-1 text-sm text-white/70">
        Character-forward performance, clean audio, and direction-friendly workflow.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <p className="text-xs uppercase tracking-wide text-[#D4AF37]">Focus</p>
          <p className="mt-2 text-sm text-white/80">
            Fiction and narrative nonfiction. Strong in romance, romantasy, drama,
            thriller, and multi-character dialogue.
          </p>
        </div>

        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <p className="text-xs uppercase tracking-wide text-[#D4AF37]">Studio</p>
          <p className="mt-2 text-sm text-white/80">
            Broadcast-ready home studio. Shure MV7+, treated space, consistent edits.
          </p>
        </div>

        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <p className="text-xs uppercase tracking-wide text-[#D4AF37]">Media kit</p>

          <p className="mt-2 text-sm text-white/70">Click to enlarge.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => onOpenLightbox("/dean-profile.png", "Logo")}
                className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden border border-[#1A2550] bg-[#050814] transition hover:border-[#D4AF37]/60"
                aria-label="Open logo"
              >
                <Image
                  src="/dean-profile.png"
                  alt="Dean Miller logo"
                  fill
                  className="object-contain p-2"
                />
              </button>

              <button
                type="button"
                onClick={() => onOpenLightbox("/dean-headshot.jpg", "Headshot")}
                className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden border border-[#1A2550] bg-[#050814] transition hover:border-[#D4AF37]/60"
                aria-label="Open headshot"
              >
                <Image
                  src="/dean-headshot.jpg"
                  alt="Dean Miller headshot"
                  fill
                  className="object-cover"
                />
              </button>
            </div>

            <div className="md:pl-2">
              <p className="text-sm text-white/80 leading-relaxed">
                Logo and headshot available for producer packets and author sites.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxTitle, setLightboxTitle] = useState("");

  const openLightbox = (src: string, title: string) => {
    setLightboxSrc(src);
    setLightboxTitle(title);
    setLightboxOpen(true);
  };

  const closeLightbox = () => setLightboxOpen(false);

  // Handle anchor scrolling on initial load from other pages
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, []);

  const handlePlay = (index: number) => {
    audioRefs.current.forEach((audio, i) => {
      if (!audio) return;
      if (i !== index) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  };

  const demos = [
    {
      title: "LGBTQ+ Romance",
      desc: "Bright pacing, playful emotional tone",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-PositiveFlirtatious.mp3",
    },
    {
      title: "Romantasy",
      desc: "Atmospheric delivery, grounded fantasy emotion",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%20to%20Remorse%2C%20Deep%20Loss.mp3",
    },
    {
      title: "Drama",
      desc: "Controlled intensity, reflective pacing",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Male%20(SomberDepressed)%2C%20Reflective.mp3",
    },
    {
      title: "Romance Duet",
      desc: "British accent, romantic restraint",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3",
    },
    {
      title: "Child POV Drama",
      desc: "Raw emotion, age-appropriate delivery",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20(5-year-old%20boy)%2C%20Emotional%20TraumaWitness%20-%20Sample.mp3",
    },
    {
      title: "Multi-Character Text Dialogue",
      desc: "Clear character separation and vocal range",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3",
    },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div id="top" />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/dean-banner.png"
            alt="Dean Miller Narrator banner"
            fill
            priority
            className="object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050814]/85 via-[#050814]/75 to-[#050814]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 py-10 sm:py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-start">
            {/* LEFT HERO */}
            <div className="md:col-span-7">
              <p className="sm:hidden text-[11px] tracking-[0.18em] text-white/65 uppercase">
                Audiobook Narrator
              </p>
              <p className="hidden sm:block text-xs tracking-[0.28em] text-white/70 uppercase">
                Audiobook narrator for fiction and narrative nonfiction.
              </p>

              <h1 className="mt-3 sm:mt-4 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05]">
                Dean Miller
              </h1>

              <p className="mt-4 text-base sm:text-lg md:text-xl text-white/85 max-w-2xl leading-relaxed">
                <span className="sm:hidden">
                  Character-driven narration with clean character separation and clear
                  emotional beats.
                </span>
                <span className="hidden sm:inline">
                  Character-driven audiobook narration with clear emotional beats, clean
                  character separation, consistent audio, and fast, reliable communication.
                </span>
              </p>

              {/* Clean CTAs */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <a
                  href="/#demos"
                  className="w-full inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A]"
                >
                  Listen to demos
                </a>

                <a
                  href={BOOKINGS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center rounded-md border border-white/25 px-6 py-3 font-semibold transition hover:border-white/60"
                >
                  Request availability
                </a>
              </div>

              {/* One clean link */}
              <div className="mt-4">
                <Link
                  href="/audiobook-narrator"
                  className="text-sm text-[#D4AF37] hover:underline"
                >
                  Learn about services and rates
                </Link>
              </div>

              <p className="mt-3 text-sm text-white/70 max-w-2xl leading-relaxed">
                Strong in romance, romantasy, drama, thriller, and multi-character dialogue.
              </p>

              <ProofPoints />
            </div>

            {/* RIGHT HERO CARD (desktop only for clean mobile) */}
            <div className="hidden md:block md:col-span-5">
              <AtAGlanceCard onOpenLightbox={openLightbox} />
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-12 sm:py-14">
        {/* DEMOS */}
        <section id="demos" className="mt-2 scroll-mt-24">
          <h2 className="text-3xl font-bold">Featured demos</h2>
          <p className="mt-2 text-white/70">
            Short, targeted clips. Click play and you will know fast.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo, index) => (
              <div
                key={demo.title}
                className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50"
              >
                <p className="font-semibold text-lg text-white">{demo.title}</p>
                <p className="mt-1 text-sm text-white/70">{demo.desc}</p>

                {demo.src ? (
                  <div className="mt-4 rounded-lg bg-[#050814] p-3 border border-[#1A2550]">
                    <audio
                      controls
                      className="w-full"
                      ref={(el) => {
                        audioRefs.current[index] = el;
                      }}
                      onPlay={() => handlePlay(index)}
                    >
                      <source src={demo.src} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-[#1A2550] bg-[#050814] p-4">
                    <p className="text-sm text-white/70">Demo link not added yet.</p>
                    <p className="mt-1 text-xs text-white/50">
                      Paste an MP3 URL into this demo’s <code>src</code> to enable playback.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* AT A GLANCE (mobile only, placed after demos) */}
        <section className="mt-14 md:hidden">
          <AtAGlanceCard onOpenLightbox={openLightbox} />
        </section>

        {/* ABOUT */}
        <section id="about" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">About</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-8">
              <p className="text-white/80 leading-relaxed">
                I’m Dean Miller, a professional audiobook narrator specializing in
                character-driven stories with strong emotional arcs. I’ve always been
                drawn to voice and performance, from early character work to years of
                theatrical and musical storytelling. That foundation shaped the way I
                approach narration today: with intention, precision, and respect for
                the emotional truth of the story. I record from a professional home
                studio with a broadcast-quality workflow, delivering clean, consistent
                audio and clear communication throughout every project. For me,
                narration is about connection. It’s the moment a listener forgets
                there’s a narrator at all and simply feels the story.
              </p>

              <ul className="mt-6 space-y-2 text-sm text-white/80">
                <li>• Broadcast-quality home studio</li>
                <li>• Long-form audiobook experience</li>
                <li>• Reliable communication and revisions</li>
              </ul>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4 shadow-lg">
                  <p className="font-semibold text-white">Genres</p>
                  <p className="mt-1 text-sm text-white/70">
                    Romance, romantasy, drama, thriller, narrative nonfiction
                  </p>
                </div>

                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4 shadow-lg">
                  <p className="font-semibold text-white">Studio</p>
                  <p className="mt-1 text-sm text-white/70">
                    Shure MV7+, pop filter, treated space
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-4">
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
                <p className="text-sm text-white/70">Preferred contact</p>

                {/* Mobile only: show email */}
                <a
                  className="mt-2 inline-block text-base font-semibold text-[#D4AF37] hover:underline md:hidden"
                  href="mailto:Dean@DMNarration.com"
                >
                  Dean@DMNarration.com
                </a>

                {/* Desktop: show booking button instead of repeating email */}
                <a
                  href={BOOKINGS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 hidden md:inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white/40 hover:text-white transition"
                >
                  Request availability
                </a>

                <p className="mt-4 text-sm text-white/70">
                  Include word count, deadline, genre, POV, and any character notes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">Contact</h2>
          <p className="mt-2 text-white/70">
            Send word count, deadline, genre, and any character notes. I will reply
            with availability and a quote.
          </p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <form
              action="https://formspree.io/f/mdalkedn"
              method="POST"
              className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg"
            >
              <input
                type="text"
                name="_gotcha"
                tabIndex={-1}
                autoComplete="off"
                style={{ display: "none" }}
              />
              <input
                type="hidden"
                name="_subject"
                value="New Narration Inquiry from Website"
              />

              {/* Optional: If you still want the form success message, update the redirect to your live domain */}
              <input
                type="hidden"
                name="_redirect"
                value="https://dmnarration.com/?sent=1#contact"
              />

              <Suspense fallback={null}>
                <SentMessage />
              </Suspense>

              <label className="block">
                <span className="text-sm text-white/80">Name</span>
                <input
                  name="name"
                  required
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder="Your name"
                />
              </label>

              <label className="block mt-4">
                <span className="text-sm text-white/80">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block mt-4">
                <span className="text-sm text-white/80">Project details</span>
                <textarea
                  name="message"
                  required
                  rows={6}
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder={`Genre, word count, deadline, POV, accents, any notes.\nExample: 85k romantasy, dual POV, delivery by June 15, 2 character accents.`}
                />
              </label>

              <input type="hidden" name="source" value="narration-site" />

              <button
                type="submit"
                className="mt-5 inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A] w-full"
              >
                Send inquiry
              </button>

              <p className="mt-3 text-xs text-white/60">
                Typical response within 24 to 48 hours.
              </p>

              {/* Mobile only: email as backup */}
              <div className="mt-4 text-xs text-white/60 md:hidden">
                Prefer email:
                <div>
                  <a
                    className="text-[#D4AF37] hover:underline"
                    href="mailto:Dean@DMNarration.com"
                  >
                    Dean@DMNarration.com
                  </a>
                </div>
              </div>

              {/* Booking CTA inside the form for desktop too, without repeating email */}
              <div className="mt-5">
                <a
                  href={BOOKINGS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-3 font-semibold text-white/90 hover:border-white/40 hover:text-white transition w-full"
                >
                  Or book a 15-minute call
                </a>
              </div>
            </form>

            <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
              <p className="text-sm text-white/70">Best results if you include:</p>

              <ul className="mt-4 space-y-2 text-white/80 text-sm">
                <li>• Genre and tone (romance, thriller, etc.)</li>
                <li>• Word count (or estimated finished hours)</li>
                <li>• Deadline and preferred schedule</li>
                <li>• POV and character count</li>
                <li>• Accent notes and pronunciation guide</li>
              </ul>

              <div className="mt-6 border-t border-[#1A2550] pt-5">
                <p className="text-sm text-white/70">Direct email</p>
                <a
                  className="mt-1 inline-block text-lg font-semibold text-[#D4AF37] hover:underline"
                  href="mailto:Dean@DMNarration.com"
                >
                  Dean@DMNarration.com
                </a>

                <div className="mt-4">
                  <p className="text-sm text-white/70">Prefer to schedule?</p>
                  <a
                    href={BOOKINGS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white/40 hover:text-white transition"
                  >
                    Book a 15-minute inquiry call
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-20 py-10 text-sm text-white/50">
          © {new Date().getFullYear()} Dean Miller. All rights reserved.
        </footer>
      </div>

      <MediaLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        title={lightboxTitle}
        src={lightboxSrc}
      />
    </main>
  );
}

export default function HomeClient() {
  return <HomeContent />;
}
