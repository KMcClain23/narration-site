"use client";

import Image from "next/image";
import Script from "next/script";
import { useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

function HomeContent() {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

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
      desc: "Bright, playful",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-PositiveFlirtatious.mp3",
    },
    {
      title: "Romantasy",
      desc: "Possessive, haunted",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%20to%20Remorse%2C%20Deep%20Loss.mp3",
    },
    {
      title: "Drama",
      desc: "Somber, reflective",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Male%20(SomberDepressed)%2C%20Reflective.mp3",
    },
    {
      title: "British Accent",
      desc: "Intimate, dominant",
      src: "",
    },
    {
      title: "Thriller / Suspense",
      desc: "Tense, controlled",
      src: "",
    },
    {
      title: "Contemporary Romance",
      desc: "Warm, grounded",
      src: "",
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

        <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7">
              <p className="text-xs tracking-[0.28em] text-white/70 uppercase">
                Audiobook Narrator
              </p>

              <h1 className="mt-4 text-4xl md:text-6xl font-bold leading-tight">
                Dean Miller
              </h1>

              <p className="mt-5 text-lg md:text-xl text-white/80 max-w-2xl">
                Character-driven narration with clear emotional beats, clean
                character separation, consistent audio, and fast communication.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <a
                  href="/#demos"
                  className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold hover:bg-[#E0C15A] transition"
                >
                  Listen to demos
                </a>

                <a
                  href="/#contact"
                  className="inline-flex items-center justify-center rounded-md border border-white/25 px-6 py-3 font-semibold hover:border-white/60 transition"
                >
                  Request availability
                </a>
              </div>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg hover:border-[#D4AF37]/50 transition">
                  <p className="font-semibold text-white">
                    Broadcast-ready workflow
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    Clean, consistent delivery
                  </p>
                </div>

                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg hover:border-[#D4AF37]/50 transition">
                  <p className="font-semibold text-white">Reliable turnaround</p>
                  <p className="mt-1 text-sm text-white/70">
                    Clear deadlines and updates
                  </p>
                </div>

                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg hover:border-[#D4AF37]/50 transition">
                  <p className="font-semibold text-white">Easy to direct</p>
                  <p className="mt-1 text-sm text-white/70">
                    Notes, pickups, fast revisions
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="relative rounded-2xl border border-[#1A2550] bg-[#050814] p-6 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-[#1A2550] bg-[#0B1224]">
                    <Image
                      src="/dean-profile.png"
                      alt="Dean Miller profile logo"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#D4AF37]">
                      Brand
                    </p>
                    <p className="text-lg font-semibold text-white">
                      Dean Miller Narrator
                    </p>
                    <p className="text-sm text-white/70">
                      Demos, availability, inquiries
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <div className="relative h-24 w-24 rounded-2xl overflow-hidden border border-[#1A2550] bg-[#0B1224]">
                    <Image
                      src="/dean-headshot.jpg"
                      alt="Dean Miller headshot"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#D4AF37]">
                      Headshot
                    </p>
                    <p className="text-base font-semibold text-white">
                      Professional and approachable
                    </p>
                    <p className="text-sm text-white/70">
                      Ideal for producers and author sites
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#D4AF37]">
                    Quick booking info
                  </p>
                  <p className="mt-1 text-sm text-white/80">
                    Include genre, word count, deadline, and any character notes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        {/* DEMOS */}
        <section id="demos" className="mt-2">
          <h2 className="text-3xl font-bold">Featured demos</h2>
          <p className="mt-2 text-white/70">
            Short, targeted clips. Click play and you will know fast.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo, index) => (
              <div
                key={demo.title}
                className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg hover:border-[#D4AF37]/50 transition"
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
                      Paste an MP3 URL into this demo’s <code>src</code> to enable
                      playback.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* TIKTOK SLIDER SECTION */}
        <section id="tiktok" className="mt-20">
          <h2 className="text-3xl font-bold">Latest on TikTok</h2>
          <p className="mt-2 text-white/70 mb-8">
            Narration snippets, voice acting tips, behind-the-scenes, and more. Follow{" "}
            <a
              href="https://www.tiktok.com/@deanmillernarration"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D4AF37] hover:underline"
            >
              @deanmillernarration
            </a>{" "}
            for regular updates!
          </p>

          <div
            className="commonninja_component pid-02edfc2b-9cd6-4970-aae7-b4d5b880eb88"
            style={{ width: "100%", minHeight: "500px" }}
          />

          <Script
            src="https://cdn.commoninja.com/sdk/latest/commonninja.js"
            strategy="afterInteractive"
          />
        </section>

        {/* ABOUT */}
        <section id="about" className="mt-20">
          <h2 className="text-3xl font-bold">About</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-8">
              <p className="text-white/80 leading-relaxed">
                I’m Dean Miller, a professional audiobook narrator specializing
                in character-driven stories with strong emotional arcs. I’ve always
                been drawn to voice and performance, from early character work to
                years of theatrical and musical storytelling. That foundation shaped
                the way I approach narration today: with intention, precision, and
                respect for the emotional truth of the story. I record from a
                professional home studio with a broadcast-quality workflow,
                delivering clean, consistent audio and clear communication throughout
                every project. For me, narration is about connection. It’s the moment
                a listener forgets there’s a narrator at all and simply feels the story.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4 shadow-lg">
                  <p className="font-semibold text-white">Genres</p>
                  <p className="mt-1 text-sm text-white/70">
                    Dark romance, romantasy, drama, thriller
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
                <a
                  className="mt-2 inline-block text-base font-semibold text-[#D4AF37] hover:underline"
                  href="mailto:DeanMillerNarrator@gmail.com"
                >
                  DeanMillerNarrator@gmail.com
                </a>

                <p className="mt-4 text-sm text-white/70">
                  Include word count, deadline, genre, POV, and any character notes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="mt-20">
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
              <input
                type="hidden"
                name="_redirect"
                value="https://narration-site.vercel.app/?sent=1#contact"
              />

              {/* Suspense wrapper here fixes the build error */}
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
                className="mt-5 inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold hover:bg-[#E0C15A] transition w-full"
              >
                Send inquiry
              </button>

              <div className="mt-4 text-xs text-white/60">
                Prefer email:
                <div>
                  <a
                    className="text-[#D4AF37] hover:underline"
                    href="mailto:DeanMillerNarrator@gmail.com"
                  >
                    DeanMillerNarrator@gmail.com
                  </a>
                </div>
              </div>
            </form>

            <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
              <p className="text-sm text-white/70">Best results if you include:</p>

              <ul className="mt-4 space-y-2 text-white/80 text-sm">
                <li>• Genre and tone (dark romance, thriller, etc.)</li>
                <li>• Word count (or estimated finished hours)</li>
                <li>• Deadline and preferred schedule</li>
                <li>• POV and character count</li>
                <li>• Accent notes and pronunciation guide</li>
              </ul>

              <div className="mt-6 border-t border-[#1A2550] pt-5">
                <p className="text-sm text-white/70">Direct email</p>
                <a
                  className="mt-1 inline-block text-lg font-semibold text-[#D4AF37] hover:underline"
                  href="mailto:DeanMillerNarrator@gmail.com"
                >
                  DeanMillerNarrator@gmail.com
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-20 py-10 text-sm text-white/50">
          © {new Date().getFullYear()} Dean Miller. All rights reserved.
        </footer>
      </div>
    </main>
  );
}

export default function HomeClient() {
  return <HomeContent />;
}