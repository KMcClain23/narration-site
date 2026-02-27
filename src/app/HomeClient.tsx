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

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const getEffectiveDuration = (a: HTMLAudioElement) => {
    const d = a.duration;

    if (Number.isFinite(d) && d > 0) return d;

    try {
      if (a.seekable && a.seekable.length > 0) {
        const end = a.seekable.end(a.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch {
      // ignore
    }

    return 0;
  };

  const pauseSelf = () => {
    const a = audioRefs.current[index];
    if (!a) return;
    a.pause();
  };

  const playSelf = async () => {
    const a = audioRefs.current[index];
    if (!a) return;

    try {
      if (!ready) setBuffering(true);
      await a.play();
      setActiveIndex(index);
    } catch {
      setBuffering(false);
    }
  };

  const toggle = async () => {
    const a = audioRefs.current[index];
    if (!a) return;

    if (!playing) {
      await playSelf();
    } else {
      pauseSelf();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = audioRefs.current[index];
    if (!a) return;

    const effectiveDuration = getEffectiveDuration(a);
    if (!effectiveDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const pctLocal = rect.width ? x / rect.width : 0;
    a.currentTime = pctLocal * effectiveDuration;
  };

  useEffect(() => {
    const a = audioRefs.current[index];
    if (!a) return;

    const updateDurationIfAvailable = () => {
      const d = getEffectiveDuration(a);
      if (d && d !== duration) setDuration(d);
    };

    const onLoaded = () => {
      setReady(true);
      updateDurationIfAvailable();
      setBuffering(false);
    };

    const onCanPlay = () => {
      setReady(true);
      updateDurationIfAvailable();
      setBuffering(false);
    };

    const onDurationChange = () => {
      updateDurationIfAvailable();
    };

    const onWaiting = () => {
      setBuffering(true);
    };

    const onTime = () => {
      setCurrent(a.currentTime || 0);
      updateDurationIfAvailable();
    };

    const onPlay = () => {
      setPlaying(true);
      setActiveIndex(index);
      setBuffering(false);
      updateDurationIfAvailable();
    };

    const onPause = () => {
      setPlaying(false);
      setBuffering(false);
    };

    const onEnded = () => {
      setPlaying(false);
      setBuffering(false);
      setCurrent(0);
      if (activeIndex === index) setActiveIndex(null);
    };

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("durationchange", onDurationChange);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("durationchange", onDurationChange);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, activeIndex, duration]);

  const pct =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  const PlayIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 7.2v9.6c0 1 1.1 1.6 2 1.1l7.7-4.8c.9-.6.9-1.8 0-2.4L11 6.1c-.9-.5-2 .1-2 1.1Z"
      />
    </svg>
  );

  const PauseIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 6.8c0-.7.6-1.3 1.3-1.3h.9c.7 0 1.3.6 1.3 1.3v10.4c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3V6.8Zm6.4 0c0-.7.6-1.3 1.3-1.3h.9c.7 0 1.3.6 1.3 1.3v10.4c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3V6.8Z"
      />
    </svg>
  );

  const SpinnerIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4a8 8 0 0 1 7.7 6.1c.1.5-.2.9-.7 1-.5.1-.9-.2-1-.7A6.2 6.2 0 0 0 12 5.8c-3.4 0-6.2 2.8-6.2 6.2S8.6 18.2 12 18.2c2.1 0 4-.9 5.1-2.4.3-.4.8-.5 1.2-.2.4.3.5.8.2 1.2A8 8 0 1 1 12 4Z"
      />
    </svg>
  );

  return (
    <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-lg text-white">{title}</p>
          <p className="mt-1 text-sm text-white/70">{desc}</p>
        </div>

        <span
          className={[
            "shrink-0 rounded-full border px-3 py-1 text-xs",
            isActive
              ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DE85]"
              : "border-white/10 bg-white/5 text-white/60",
          ].join(" ")}
        >
          {isActive ? "Now playing" : "Demo"}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-[#1A2550] bg-[#050814] p-4">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={toggle}
            className={[
              "relative h-16 w-16 rounded-full flex items-center justify-center transition",
              "border-2 border-white/25 bg-white/10 text-white",
              "shadow-[0_10px_30px_rgba(0,0,0,0.45)]",
              "hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/10",
              "active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
              !src ? "opacity-60 pointer-events-none" : "",
            ].join(" ")}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          >
            <span className="absolute inset-[6px] rounded-full border border-white/10 bg-white/10" />
            <span className="absolute left-[10px] right-[10px] top-[10px] h-[18px] rounded-full bg-white/10 blur-[0.2px]" />

            <span className="relative">
              {buffering ? (
                <SpinnerIcon className="h-8 w-8 animate-spin" />
              ) : playing ? (
                <PauseIcon className="h-9 w-9" />
              ) : (
                <PlayIcon className="h-9 w-9 translate-x-[1px]" />
              )}
            </span>
          </button>

          <div className="flex-1 min-w-0 w-full">
            <button
              type="button"
              onClick={handleSeek}
              className={[
                "relative block w-full h-4 rounded-full overflow-hidden",
                "border border-white/10 bg-white/5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
              ].join(" ")}
              aria-label={`Seek ${title}`}
            >
              <div
                className="absolute left-0 top-0 h-full bg-[#D4AF37]/70"
                style={{ width: `${pct}%` }}
              />
            </button>

            <div className="mt-2 flex items-center justify-between text-xs text-white/60">
              <span>{formatTime(current)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <audio
          preload="metadata"
          ref={(el) => {
            audioRefs.current[index] = el;
          }}
        >
          <source src={src} type="audio/mpeg" />
        </audio>
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

  // Only one demo plays at a time
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

              {/* TRUST CHIPS */}
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

        {/* AT A GLANCE (mobile only) */}
        <section className="mt-14 md:hidden">
          <AtAGlanceCard onOpenLightbox={openLightbox} />
        </section>

        {/* ABOUT */}
        <section id="about" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">About</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-8">
              <p className="text-white/80 leading-relaxed">
                I’m Dean Miller, a professional audiobook narrator drawn to character-driven stories with emotional depth, quiet tension, and honest human connection. I have always been fascinated by voice and performance, especially the way small choices in pacing and tone can change how a story is felt.

                My background in long-form storytelling shaped an approach focused on intention, restraint, and emotional truth rather than overt performance. I aim for narration that feels natural and immersive, where listeners stop noticing the voice and simply live inside the story.

                I record from a broadcast-quality home studio and value clear communication and collaboration throughout each project. For me, successful narration is when the listener forgets there is a narrator at all and walks away feeling the story instead.
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

                <a
                  className="mt-2 inline-block text-base font-semibold text-[#D4AF37] hover:underline md:hidden"
                  href="mailto:Dean@DMNarration.com"
                >
                  Dean@DMNarration.com
                </a>

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