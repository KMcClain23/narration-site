"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, Suspense, useState, useCallback } from "react";
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

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
      <div className="sm:hidden mt-7 rounded-xl border border-[#1A2550] bg-[#0B1224] p-4 shadow-lg">
        <p className="text-sm font-semibold text-white">Quick highlights</p>
        <ul className="mt-2 space-y-2 text-sm text-white/75">
          <li>• Broadcast-ready workflow</li>
          <li>• Reliable turnaround</li>
          <li>• Easy to direct</li>
        </ul>
      </div>

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
              >
                <Image
                  src="/dean-profile.png"
                  alt="Logo"
                  fill
                  className="object-contain p-2"
                />
              </button>

              <button
                type="button"
                onClick={() => onOpenLightbox("/dean-headshot.jpg", "Headshot")}
                className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden border border-[#1A2550] bg-[#050814] transition hover:border-[#D4AF37]/60"
              >
                <Image
                  src="/dean-headshot.jpg"
                  alt="Headshot"
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

function DemoPlayer({
  title,
  desc,
  src,
  index,
  activeIndex,
  setActiveIndex,
  audioRefs,
}: {
  title: string;
  desc: string;
  src: string;
  index: number;
  activeIndex: number | null;
  setActiveIndex: (v: number | null) => void;
  audioRefs: React.MutableRefObject<(HTMLAudioElement | null)[]>;
}) {
  const isActive = activeIndex === index;

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const a = audioRefs.current[index];
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = audioRefs.current[index];
    if (!a || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const pctLocal = x / rect.width;
    a.currentTime = pctLocal * duration;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    const a = audioRefs.current[index];
    if (a) a.volume = val;
  };

  useEffect(() => {
    const a = audioRefs.current[index];
    if (!a) return;

    const onTimeUpdate = () => setCurrent(a.currentTime);
    const onDurationChange = () => setDuration(a.duration);
    const onPlay = () => {
      setPlaying(true);
      setBuffering(false);
      setActiveIndex(index);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      setActiveIndex(null);
    };

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("durationchange", onDurationChange);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("durationchange", onDurationChange);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", onEnded);
    };
  }, [index, setActiveIndex, audioRefs]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50 flex flex-col h-full">
      <div className="relative flex items-start justify-between gap-4 min-h-[64px]">
        <div className="flex-1">
          <p className="font-semibold text-lg text-white leading-tight">{title}</p>
          <p className="mt-1 text-sm text-white/70">{desc}</p>
        </div>

        <div className="shrink-0 pt-1">
          <span
            className={[
              "rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider font-bold transition-colors duration-300",
              isActive
                ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DE85]"
                : "border-white/10 bg-white/5 text-white/40",
            ].join(" ")}
          >
            {isActive ? "Now playing" : "Demo"}
          </span>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-[#1A2550] bg-[#050814] p-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggle}
              className={[
                "relative h-14 w-14 shrink-0 rounded-full flex items-center justify-center transition active:scale-95",
                "border-2 border-white/20 bg-white/5 text-white shadow-xl hover:border-[#D4AF37]/70",
                !src ? "opacity-50 pointer-events-none" : "cursor-pointer",
              ].join(" ")}
            >
              {buffering ? (
                <div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
              ) : playing ? (
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
                </svg>
              ) : (
                <svg className="h-7 w-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v13.72l11-6.86L8 5.14z" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={handleSeek}
                className="relative block w-full h-2 rounded-full overflow-hidden bg-white/10 cursor-pointer z-10"
              >
                <div
                  className="absolute left-0 top-0 h-full bg-[#D4AF37]"
                  style={{ width: `${pct}%` }}
                />
              </button>
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-white/40 tracking-tighter">
                <span>{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-3">
            <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolume}
              className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
            />
          </div>

          <audio
            ref={(el) => {
              audioRefs.current[index] = el;
            }}
            src={src}
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxTitle, setLightboxTitle] = useState("");

  const openLightbox = (src: string, title: string) => {
    setLightboxSrc(src);
    setLightboxTitle(title);
    setLightboxOpen(true);
  };

  const closeLightbox = () => setLightboxOpen(false);

  useEffect(() => {
    audioRefs.current.forEach((audio, i) => {
      if (!audio) return;
      if (activeIndex === null) return;
      if (i !== activeIndex) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  }, [activeIndex]);

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
      title: "Femminine Voice",
      desc: "Male & Female Dialogue",
      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3",
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
      <section className="relative overflow-hidden -mt-16 pt-16">
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
              <p className="text-xs tracking-[0.28em] text-white/70 uppercase">
                Audiobook narrator for fiction and narrative nonfiction.
              </p>

              <h1 className="mt-3 sm:mt-4 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05]">
                Dean Miller
              </h1>

              <p className="mt-4 text-base sm:text-lg md:text-xl text-white/85 max-w-2xl leading-relaxed">
                Character-driven audiobook narration with clear emotional beats, clean
                character separation, consistent audio, and fast, reliable communication.
              </p>

              <div className="mt-5 flex flex-wrap gap-2 max-w-2xl">
                {[
                  "24 to 48h reply",
                  "Pickups within 24h",
                  "ACX-ready delivery",
                  "Broadcast-ready studio",
                  "Romance, romantasy, drama, thriller",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur-sm transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
                  >
                    {item}
                  </span>
                ))}
              </div>

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

              <div className="mt-4">
                <Link
                  href="/audiobook-narrator"
                  className="text-sm text-[#D4AF37] hover:underline"
                >
                  Learn about services and rates
                </Link>
              </div>

              <ProofPoints />
            </div>

            {/* RIGHT HERO CARD */}
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
              <DemoPlayer
                key={demo.title}
                title={demo.title}
                desc={demo.desc}
                src={demo.src}
                index={index}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                audioRefs={audioRefs}
              />
            ))}
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">About</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-8">
              <p className="text-white/80 leading-relaxed">
                I’m Dean Miller, a professional audiobook narrator drawn to character-driven stories with emotional depth, quiet tension, and honest human connection. I aim for narration that feels natural and immersive, where listeners stop noticing the voice and simply live inside the story.
              </p>

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
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg text-center">
                <p className="text-sm text-white/70">Preferred contact</p>
                <a
                  className="mt-2 inline-block text-lg font-semibold text-[#D4AF37] hover:underline"
                  href="mailto:Dean@DMNarration.com"
                >
                  Dean@DMNarration.com
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">Contact</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <form
              action="https://formspree.io/f/mdalkedn"
              method="POST"
              className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg"
            >
              <Suspense fallback={null}>
                <SentMessage />
              </Suspense>

              <label className="block">
                <span className="text-sm text-white/80">Name</span>
                <input
                  name="name"
                  required
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder="Your name"
                />
              </label>

              <label className="block mt-4">
                <span className="text-sm text-white/80">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block mt-4">
                <span className="text-sm text-white/80">Project details</span>
                <textarea
                  name="message"
                  required
                  rows={6}
                  className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70"
                  placeholder="Genre, word count, deadline, etc."
                />
              </label>

              <button
                type="submit"
                className="mt-5 w-full inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A]"
              >
                Send inquiry
              </button>
            </form>

            <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
              <p className="text-sm text-white/70">Direct email</p>
              <a
                className="mt-1 inline-block text-lg font-semibold text-[#D4AF37] hover:underline"
                href="mailto:Dean@DMNarration.com"
              >
                Dean@DMNarration.com
              </a>
              <div className="mt-6 border-t border-[#1A2550] pt-5">
                <p className="text-sm text-white/70">Prefer to schedule?</p>
                <a
                  href={BOOKINGS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white/40 hover:text-white transition"
                >
                  Book a 15-minute call
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-20 py-10 text-sm text-white/50 text-center">
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