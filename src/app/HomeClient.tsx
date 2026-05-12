"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, useState, useTransition, useCallback, useMemo } from "react";
import { sendEmail } from "@/app/actions/sendEmail";
import { sendGAEvent } from "@next/third-parties/google";

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";
const BANNER_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerBanner.png";
const PROFILE_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile.jpg";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function DemoPlayer({
  title, desc, src, index, activeIndex, setActiveIndex, audioRefs, color, tags,
}: {
  title: string; desc: string; src: string; index: number; color: string; tags: string[];
  activeIndex: number | null; setActiveIndex: (v: number | null) => void;
  audioRefs: React.MutableRefObject<(HTMLAudioElement | null)[]>;
}) {
  const isActive = activeIndex === index;
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);     // 0–100 for bar width
  const [displayTime, setDisplayTime] = useState(0); // seconds for clock
  const [muted, setMuted] = useState(false);

  // Local audio ref — also syncs to shared audioRefs for cross-player pause
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false); // stable ref for draw loop

  const setAudioEl = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    audioRefs.current[index] = el;
  }, [audioRefs, index]);

  // ── Web Audio init (called once on first user gesture) ──────────────────────
  const initWebAudio = useCallback(() => {
    if (analyserRef.current || !audioElRef.current) return; // already done or no element
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      const source = ctx.createMediaElementSource(audioElRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // Web Audio unavailable or element already claimed — close the dangling
      // context so it doesn't intercept audio routing, then let audio play raw
      ctx?.close().catch(() => {});
    }
  }, []);

  // ── Canvas draw loop ────────────────────────────────────────────────────────
  const startDraw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    const BAR_N = 28;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(data);
      const W = canvas.width; const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      const slot = W / BAR_N;
      const barW = slot * 0.55;
      for (let i = 0; i < BAR_N; i++) {
        const v = data[Math.floor((i / BAR_N) * bufLen)] / 255;
        const bh = Math.max(2, v * H * 0.88);
        ctx2d.globalAlpha = isPlayingRef.current ? 0.65 : 0.12;
        ctx2d.fillStyle = "#D4AF37";
        ctx2d.fillRect(i * slot + (slot - barW) / 2, (H - bh) / 2, barW, bh);
      }
    };
    frame();
  }, []);

  const stopDraw = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    // draw dim static frame
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);
    const W = canvas.width; const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);
    const BAR_N = 28; const slot = W / BAR_N; const barW = slot * 0.55;
    ctx2d.globalAlpha = 0.12; ctx2d.fillStyle = "#D4AF37";
    for (let i = 0; i < BAR_N; i++) {
      const v = data[Math.floor((i / BAR_N) * bufLen)] / 255;
      const bh = Math.max(3, v * H * 0.88 + 3);
      ctx2d.fillRect(i * slot + (slot - barW) / 2, (H - bh) / 2, barW, bh);
    }
  }, []);

  // ── Controls ────────────────────────────────────────────────────────────────
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const a = audioElRef.current;
    if (!a) return;
    if (a.paused) {
      initWebAudio();
      const ctx = audioCtxRef.current;
      // AudioContexts start suspended — must resume before play or audio is silent
      if (ctx && ctx.state === "suspended") {
        ctx.resume().then(() => a.play().catch(() => {})).catch(() => a.play().catch(() => {}));
      } else {
        a.play().catch(() => {});
      }
    } else {
      a.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioElRef.current;
    if (!a) return;
    const dur = a.duration;
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
    a.currentTime = ratio * dur;
    setProgress(ratio * 100);
    setDisplayTime(ratio * dur);
  };

  const toggleMute = () => {
    const a = audioElRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(v => !v);
  };

  // ── Event listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const a = audioElRef.current;
    if (!a) return;
    const onTimeUpdate = () => {
      const dur = a.duration || 0;
      setDisplayTime(a.currentTime);
      setProgress(dur > 0 ? (a.currentTime / dur) * 100 : 0);
    };
    const onDurationChange = () => setDuration(a.duration || 0);
    const onPlay = () => {
      setPlaying(true); isPlayingRef.current = true; setBuffering(false); setActiveIndex(index);
      startDraw();
      sendGAEvent("event", "demo_play", { event_category: "Audio", event_label: title, value: index });
      fetch("/api/track-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
    };
    const onPause = () => { setPlaying(false); isPlayingRef.current = false; stopDraw(); };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => {
      setPlaying(false); isPlayingRef.current = false;
      setProgress(0); setDisplayTime(0); setActiveIndex(null); stopDraw();
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [index, title, setActiveIndex, startDraw, stopDraw]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={`group relative rounded-2xl border-t-2 ${color} transition-all duration-500 ${isActive ? "ring-1 ring-[#D4AF37]/50" : "hover:ring-1 hover:ring-white/10"}`}
      style={{ background: isActive ? "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(11,18,36,1) 60%)" : "rgba(11,18,36,1)" }}
    >
      {isActive && (
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, rgba(212,175,55,0.4), transparent 60%)" }} />
      )}

      <div className="relative p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-white leading-snug">{title}</h3>
            <p className="mt-0.5 text-xs text-white/50 leading-snug">{desc}</p>
          </div>
          {isActive && (
            <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-0.5 rounded-full bg-[#D4AF37]"
                  style={{ height: 12, animation: `barPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
              ))}
            </div>
          )}
        </div>

        {/* Genre tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50">{tag}</span>
            ))}
          </div>
        )}

        {/* Player */}
        <div className="relative mt-auto rounded-xl bg-black/40 overflow-hidden px-3 pt-3 pb-2">
          {/* Live waveform canvas */}
          <canvas ref={canvasRef} width={320} height={60}
            className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />

          {/* Controls */}
          <div className="relative flex items-center gap-3">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} type="button"
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-[#D4AF37] text-black hover:bg-[#E0C15A] transition-colors shadow-lg shadow-[#D4AF37]/20 ${!src ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}>
              {buffering
                ? <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : playing
                  ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
                  : <svg className="h-4 w-4 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
              }
            </button>

            <div className="flex-1 min-w-0">
              {/* Progress track */}
              <div className="relative w-full h-5 flex items-center cursor-pointer" onClick={handleSeek}
                role="slider" aria-label="Seekbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="relative w-full h-1 rounded-full bg-white/10">
                  {/* Gold fill */}
                  <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${progress}%` }} />
                  {/* Scrubber circle */}
                  <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[#D4AF37] border border-black/20 shadow pointer-events-none"
                    style={{ left: `calc(${progress}% - 6px)` }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/30 mt-1">
                <span>{formatTime(displayTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Mute toggle */}
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}
              className="shrink-0 text-white/25 hover:text-white/60 transition-colors">
              {muted
                ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              }
            </button>
          </div>
          <audio ref={setAudioEl} src={src} preload="metadata" />
        </div>
      </div>
    </div>
  );
}


function StatsBar({ stats }: { stats: { titles: number; authors: number; co_narrators: number; genres: number } }) {
  if (!stats.titles) return null;

  const items = [
    { value: stats.titles,       label: "titles narrated" },
    { value: stats.authors,      label: "authors worked with" },
    { value: stats.co_narrators, label: "co-narrators" },
    { value: stats.genres,       label: "genres" },
  ];

  return (
    <div className="fade-up-3 mt-8 flex flex-wrap gap-2 justify-start">
      {items.map(({ value, label }) => (
        <div key={label} className="flex items-baseline gap-1.5 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04]">
          <span className="text-base font-bold text-[#D4AF37] leading-none">{value}</span>
          <span className="text-[11px] text-white/45 leading-none whitespace-nowrap">{label}</span>
        </div>
      ))}
    </div>
  );
}

interface Testimonial {
  quote?: string;
  paragraphs?: string[];
  author: string;
  title: string;
  book?: string;
  cover_url?: string;
}

// Hardcoded seed testimonials — always shown even if API is down
const SEED_TESTIMONIALS: Testimonial[] = [
  {
    quote: "Working with Dean has been such a pleasure! He is friendly, professional, and incredibly talented. I've honestly loved every second of the production process for my audiobook with him!",
    author: "River Fox",
    title: "Author",
    book: "Blood on the Asphalt",
    cover_url: "/covers/blood-on-the-asphalt.png",
  },
  {
    quote: "Dean Miller, what a guy! When I started narrating duets, I was so nervous about depending on others. Well, Dean has set the bar pretty high for dream co-narrators! He's a hidden gem of talent and one of the most honest, genuine people I've had the pleasure to know and work with. I'm so blessed to have him in my corner as a peer and to continue working with him on more projects to come! Highly recommend!!!!!",
    author: "Stephanie Betschart/Ann Dahlia",
    title: "Narrator",
    book: "Blood on the Asphalt",
    cover_url: "/covers/blood-on-the-asphalt.png",
  },
  {
    paragraphs: [
      "If you're looking for a male narrator, Dean is your guy. No hesitation, no second guessing—just trust me on this one.",
      "From the very beginning, he has been nothing short of incredible to work with. He actually listens—like really listens—to what you want for your story and then brings it to life in a way that somehow feels even better than what you had in your head. He doesn't just read your words, he understands them. The tone, the tension, the emotion—he gets it, and he delivers every single time.",
      "On top of that, he's been insanely supportive through the entire process. Whether it was questions, ideas, or me overthinking something for the hundredth time, he always had an answer and never once made it feel like I was asking too much. That kind of patience and dedication? You don't find that everywhere.",
      "And let's talk about personality for a second—because this matters. Dean is one of the easiest people to get along with. If you're nervous, awkward, unsure, whatever… he kills that energy immediately. You settle in fast, and suddenly you're not stressed—you're excited. That comfort makes a huge difference, especially when you're trusting someone with your work.",
      "He's professional, talented, reliable, and just an all-around solid human. The kind of narrator you want in your corner.",
      "Truly, I could not recommend him more.",
      "And Dean… when you blow up—and you will—you better not forget about me. I'm claiming early supporter rights forever.",
    ],
    author: "E.A. Harper",
    title: "Author",
    book: "Whiskey & Lies",
    cover_url: "/covers/whiskey-and-lies.jpg",
  },
];

const TRUNCATE_LENGTH = 320;

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const [expanded, setExpanded] = useState(false);
  const hasParagraphs = Boolean(testimonial.paragraphs?.length);
  const fullText = hasParagraphs ? "" : (testimonial.quote || "");
  const isLong = !hasParagraphs && fullText.length > TRUNCATE_LENGTH;
  const displayQuote = isLong && !expanded
    ? fullText.slice(0, TRUNCATE_LENGTH).trimEnd() + "…"
    : fullText;
  const paragraphs = testimonial.paragraphs || [];
  const visibleParagraphs = hasParagraphs && !expanded ? paragraphs.slice(0, 2) : paragraphs;
  const hasMoreParagraphs = hasParagraphs && paragraphs.length > 2;

  return (
    <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6 flex flex-col gap-4 hover:border-[#D4AF37]/20 transition-colors">
      <div className="text-[#D4AF37]/30 text-5xl font-serif leading-none select-none">&ldquo;</div>
      <div className="flex-1">
        {hasParagraphs ? (
          <div className="space-y-3">
            {visibleParagraphs.map((p, i) => (
              <p key={i} className="text-white/75 text-sm leading-relaxed font-normal">{p}</p>
            ))}
            {hasMoreParagraphs && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="mt-1 text-xs font-semibold text-[#D4AF37] hover:text-[#E0C15A] transition-colors inline-flex items-center gap-1">
                {expanded ? "Show less" : `Read more (${paragraphs.length - 2} more paragraphs)`}
                <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-white/75 text-sm leading-relaxed font-normal">{displayQuote}</p>
            {isLong && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="mt-3 text-xs font-semibold text-[#D4AF37] hover:text-[#E0C15A] transition-colors inline-flex items-center gap-1">
                {expanded ? "Show less" : "Read more"}
                <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
      <div className="border-t border-white/6 pt-4 flex items-center gap-3">
        {testimonial.cover_url ? (
          <img
            src={testimonial.cover_url}
            alt={testimonial.book || ""}
            className="h-14 w-9 object-cover rounded-md shrink-0 shadow-lg"
          />
        ) : testimonial.book ? (
          <div className="h-14 w-9 rounded-md shrink-0 bg-white/5 border border-white/10 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white/30 text-center leading-tight px-0.5">
              {testimonial.book.split(/\s+/).slice(0, 3).map(w => w[0]?.toUpperCase() ?? "").join("")}
            </span>
          </div>
        ) : null}
        <div>
          <p className="font-semibold text-white text-sm">{testimonial.author}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {testimonial.title}{testimonial.book ? ` · ${testimonial.book}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function TestimonialsCarousel() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>(SEED_TESTIMONIALS);
  const [current, setCurrent] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number>(0);

  // Fetch approved testimonials + books (for cover lookup) and merge with seeds
  useEffect(() => {
    const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    Promise.all([
      fetch("/api/testimonials").then(r => r.json()),
      fetch("/api/books").then(r => r.json()).catch(() => ({ books: [] })),
    ]).then(([testimonialData, booksData]) => {
      if (!testimonialData.testimonials?.length) return;
      // Build slug→cover and lowercase-title→cover maps for fast lookup
      const slugMap = new Map<string, string>();
      const titleMap = new Map<string, string>();
      for (const b of (booksData.books ?? []) as Array<{ title: string; cover_url?: string; slug?: string }>) {
        if (!b.cover_url) continue;
        if (b.slug) slugMap.set(b.slug, b.cover_url);
        slugMap.set(toSlug(b.title), b.cover_url);
        titleMap.set(b.title.trim().toLowerCase(), b.cover_url);
      }
      const seedAuthors = new Set(SEED_TESTIMONIALS.map(t => t.author.toLowerCase()));
      const apiOnes: Testimonial[] = testimonialData.testimonials
        .filter((t: { reviewer_name: string }) => !seedAuthors.has(t.reviewer_name.toLowerCase()))
        .map((t: { reviewer_name: string; reviewer_role: string; book_title: string; quote: string }) => {
          const bookKey = (t.book_title || "").trim();
          const cover_url = bookKey
            ? (slugMap.get(toSlug(bookKey)) ?? titleMap.get(bookKey.toLowerCase()))
            : undefined;
          const role = t.reviewer_role?.trim();
          return {
            quote: t.quote,
            author: t.reviewer_name,
            title: role ? (role.charAt(0).toUpperCase() + role.slice(1)) : "Author",
            book: bookKey || undefined,
            cover_url,
          };
        });
      if (apiOnes.length) setTestimonials([...SEED_TESTIMONIALS, ...apiOnes]);
    }).catch(() => {});
  }, []);

  // Auto-advance every 6 seconds — only if more than 3 testimonials
  useEffect(() => {
    if (!autoPlay || testimonials.length <= 3) return;
    timerRef.current = setTimeout(() => {
      setCurrent(c => (c + 1) % testimonials.length);
    }, 6000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, autoPlay, testimonials.length]);

  const go = (idx: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAutoPlay(false);
    setCurrent((idx + testimonials.length) % testimonials.length);
    setTimeout(() => setAutoPlay(true), 10000);
  };

  const pauseAutoPlay = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAutoPlay(false);
  };

  const resumeAutoPlay = () => {
    if (testimonials.length > 3) setAutoPlay(true);
  };

  if (testimonials.length === 0) return null;

  return (
    <div className="relative">
      {/* Cards — show current + peek of next on larger screens */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start"
        onMouseEnter={pauseAutoPlay}
        onMouseLeave={resumeAutoPlay}
      >
        {testimonials.slice(current, current + 3).concat(
          current + 3 > testimonials.length ? testimonials.slice(0, (current + 3) % testimonials.length) : []
        ).slice(0, Math.min(3, testimonials.length)).map((t, i) => (
          <div key={`${t.author}-${i}`}
            className={`transition-all duration-700 ease-in-out ${i === 0 ? "opacity-100" : i === 1 ? "hidden md:block opacity-100" : "hidden lg:block opacity-100"}`}>
            <TestimonialCard testimonial={t} />
          </div>
        ))}
      </div>

      {/* Controls */}
      {testimonials.length > 3 && (
        <div className="mt-6 flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex gap-2">
            {testimonials.map((_, i) => (
              <button key={i} type="button" onClick={() => go(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === current ? "bg-[#D4AF37] w-7" : "bg-[#D4AF37]/30 w-2.5 hover:bg-[#D4AF37]/60"
                }`} />
            ))}
          </div>
          {/* Prev/next */}
          <div className="flex gap-2">
            <button type="button" onClick={() => go(current - 1)}
              className="h-8 w-8 rounded-full border border-white/15 flex items-center justify-center text-white/50 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => go(current + 1)}
              className="h-8 w-8 rounded-full border border-white/15 flex items-center justify-center text-white/50 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Leave a review link */}
      <div className="mt-6 text-center">
        <a href="/leave-a-review"
          className="inline-flex items-center gap-2 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors px-4 py-2 rounded-full text-sm">
          Worked with Dean? Leave a review
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function HomeContent({ acceptingProjects = true, stats }: { acceptingProjects?: boolean; stats?: { titles: number; authors: number; co_narrators: number; genres: number } }) {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formStatus, setFormStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  const handleNativeSubmit = async (formData: FormData) => {
    setFormStatus(null);
    startTransition(async () => {
      const result = await sendEmail(formData);
      if (result.success) {
        setFormStatus({ success: true, message: "Thanks — I'll be in touch soon." });
        formRef.current?.reset();
      } else {
        setFormStatus({ success: false, message: typeof result.error === "string" ? result.error : "Something went wrong. Please try again." });
      }
    });
  };

  useEffect(() => {
    audioRefs.current.forEach((audio, i) => {
      if (audio && activeIndex !== null && i !== activeIndex) {
        audio.pause(); audio.currentTime = 0;
      }
    });
  }, [activeIndex]);

  const demos = [
    { title: "LGBTQ+ Romance",         desc: "Bright pacing, playful emotional tone",       color: "border-pink-400",   tags: ["LGBTQ+", "Romance"],      src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-PositiveFlirtatious.mp3" },
    { title: "Romantasy",              desc: "Atmospheric, grounded fantasy emotion",       color: "border-purple-400", tags: ["Romantasy", "Fantasy"],   src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%20to%20Remorse%2C%20Deep%20Loss.mp3" },
    { title: "Feminine Voice",         desc: "Male & Female Dialogue",                      color: "border-violet-400", tags: ["Feminine Voice", "Duet"], src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3" },
    { title: "Romance Duet",           desc: "British accent, romantic restraint",           color: "border-rose-300",   tags: ["Romance", "British"],     src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3" },
    { title: "Child POV Drama",        desc: "Raw emotion, age-appropriate delivery",        color: "border-blue-400",   tags: ["Drama", "Child POV"],     src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20(5-year-old%20boy)%2C%20Emotional%20TraumaWitness%20-%20Sample.mp3" },
    { title: "Multi-Character Dialogue", desc: "Clear character separation, vocal range",   color: "border-amber-400",  tags: ["Multi-Character"],        src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3" },
  ];

  return (
    <main className="min-h-screen bg-[#06082E] text-white overflow-x-clip">
      {/* Keyframes */}
      <style>{`
        @keyframes barPulse {
          from { transform: scaleY(0.4); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.7s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.7s 0.35s ease both; }
        .fade-up-4 { animation: fadeUp 0.7s 0.5s ease both; }
      `}</style>

      <div id="top" />

      {/* ── HERO ── */}
      <section className="relative min-h-[60vh] flex items-center" aria-label="Introduction">
        {/* Full bleed background */}
        <div className="absolute inset-0">
          <Image src={BANNER_URL} alt="Dean Miller recording studio" fill priority
            sizes="(max-width: 768px) 100vw, 100vw"
            className="object-cover opacity-20" style={{ objectPosition: "center center" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(6,8,46,0.6) 0%, rgba(6,8,46,0.3) 40%, rgba(6,8,46,1) 100%)" }} />
          {/* Strong vignette to clip edges */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(6,8,46,0.85) 70%, rgba(6,8,46,1) 100%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-4 sm:pt-10 pb-12 w-full">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <div className="fade-up flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-[#D4AF37]" />
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#D4AF37]">Audiobook narrator</p>
            </div>

            {/* Availability badge */}
            <div className="fade-up flex items-center gap-2 mb-5">
              <span className={`relative flex h-2 w-2`}>
                {acceptingProjects && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${acceptingProjects ? "bg-emerald-400" : "bg-red-400"}`} />
              </span>
              <span className={`text-xs font-medium ${acceptingProjects ? "text-emerald-400" : "text-red-400"}`}>
                {acceptingProjects ? "Currently accepting new projects" : "Not currently accepting new projects"}
              </span>
            </div>

            {/* Name */}
            <h1 className="fade-up-1 text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.0] tracking-tight">
              Dean<br />Miller
            </h1>

            {/* Tagline */}
            <p className="fade-up-2 mt-6 text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
              Character-driven narration for fiction that demands emotional depth —
              dark romance, romantasy, and multi-character drama.
            </p>

            {/* CTA + stats in one row */}
            <div className="fade-up-3 mt-10 flex flex-wrap items-center gap-4">
              <a href="/#contact"
                className="inline-flex items-center gap-2 rounded-full bg-[#D4AF37] text-black px-7 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] hover:scale-[1.02] active:scale-[0.98]">
                Get in touch
              </a>
              {stats && stats.titles > 0 && (
                [
                  { value: stats.titles,       label: "titles narrated" },
                  { value: stats.authors,      label: "authors worked with" },
                  { value: stats.co_narrators, label: "co-narrators" },
                  { value: stats.genres,       label: "genres" },
                ].map(({ value, label }) => (
                  <div key={label} className="flex items-baseline gap-1.5 px-4 py-2 rounded-full border border-white/10 bg-white/[0.04]">
                    <span className="text-base font-bold text-[#D4AF37] leading-none">{value}</span>
                    <span className="text-[11px] text-white/45 leading-none whitespace-nowrap">{label}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Profile image — floats right on desktop */}
          <div className="hidden md:block absolute right-6 top-1/2 -translate-y-1/2 w-56 lg:w-64">
            <div className="relative" style={{ aspectRatio: "3/4" }}>
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <Image src={PROFILE_URL} alt="Dean Miller, audiobook narrator" fill
                  sizes="(max-width: 1024px) 224px, 288px"
                  className="object-cover" style={{ objectPosition: "center top" }} priority />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(6,8,46,1) 0%, rgba(6,8,46,0.4) 40%, transparent 70%)" }} />
              </div>
              {/* Gold accent line */}
              <div className="absolute left-0 bottom-0 top-0 w-px bg-gradient-to-b from-transparent via-[#D4AF37]/40 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-5 sm:px-6">

        {/* ── DEMOS ── */}
        <section id="demos" className="pt-4 scroll-mt-24" aria-label="Audio demos">
          {/* Section label */}
          <div className="flex items-center gap-4 mb-10">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Featured demos</p>
            <div className="flex-1 h-px bg-[#D4AF37]/20" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {demos.map((demo, index) => (
              <DemoPlayer key={demo.title} title={demo.title} desc={demo.desc} src={demo.src}
                color={demo.color} tags={demo.tags}
                index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} audioRefs={audioRefs} />
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/narrated-works"
              className="inline-flex items-center gap-2 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10 px-5 py-2 rounded-full text-sm transition-colors">
              Browse the full portfolio
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>


        {/* ── TESTIMONIALS ── */}
        <section id="testimonials" className="mt-16 scroll-mt-24 -mx-5 sm:-mx-6 px-5 sm:px-6 bg-white/[0.02]" aria-label="Author testimonials">
          <div className="flex items-center gap-4 mb-10">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Author testimonials</p>
            <div className="flex-1 h-px bg-[#D4AF37]/20" />
          </div>
          <TestimonialsCarousel />
        </section>

        {/* ── ABOUT ── */}
        <section id="about" className="mt-16 scroll-mt-24" aria-label="About Dean Miller">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">About</p>
            <div className="flex-1 h-px bg-[#D4AF37]/20" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 items-start">
            <div className="md:col-span-7 space-y-5">
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                The kind of narration where listeners forget there's a narrator at all.
              </h2>
              <p className="text-white/70 text-base leading-relaxed">
                I'm a professional audiobook narrator with a background in music and theatre. My focus is
                immersive, character-forward performance — finding the emotional truth in every scene and
                making each voice distinct enough that the listener never loses the thread.
              </p>
              <p className="text-white/60 text-base leading-relaxed">
                I specialize in dark romance, romantasy, LGBTQ+ fiction, thriller, and drama, with strong
                accent range including British RP. Every project starts with a full character voice list sent
                for author approval before a single line is recorded.
              </p>
              <p className="text-white/60 text-base leading-relaxed">
                My home studio delivers ACX-ready, broadcast-quality audio on a Shure MV7+ in a
                custom-treated acoustic space. Milestone updates throughout. Pickups handled promptly.
              </p>
            </div>

            {/* What to expect sidebar */}
            <aside id="process" className="md:col-span-5 scroll-mt-24">
              <div className="rounded-2xl overflow-hidden border border-white/8">
                <div className="px-5 py-4 border-b border-white/8">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37]">What to expect</p>
                </div>
                <ul className="divide-y divide-white/6">
                  {[
                    "Character voice list sent for approval before recording",
                    "First-15 review — lock tone and voices early",
                    "Milestone updates throughout production",
                    "ACX-ready masters, no outsourced mastering",
                    "Fast pickups and clear communication",
                    "Option to livestream sessions for promo content",
                  ].map((item) => (
                    <li key={item} className="px-5 py-3.5 text-sm text-white/65 hover:bg-white/[0.02] transition-colors">
                      <span className="block border-l-2 border-[#D4AF37] pl-3">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-5 py-4 border-t border-white/8">
                  <Link href="/welcome"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#D4AF37] border border-[#D4AF37]/40 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]/70 transition-colors">
                    Full process & welcome packet
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section id="contact" className="mt-16 mb-16 scroll-mt-24 -mx-5 sm:-mx-6 px-5 sm:px-6 bg-white/[0.02]" aria-label="Contact and booking">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Get in touch</p>
            <div className="flex-1 h-px bg-[#D4AF37]/20" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form */}
            <form ref={formRef} action={handleNativeSubmit}
              className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6 backdrop-blur-sm">
              {formStatus && (
                <div className={`mb-5 px-4 py-3 rounded-lg text-sm border ${
                  formStatus.success
                    ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-300"
                    : "bg-red-500/8 border-red-500/20 text-red-300"
                }`}>
                  {formStatus.message}
                </div>
              )}
              <input type="text" name="_hp_name" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
              <div className="space-y-4">
                {[
                  { name: "name", label: "Name", type: "text", placeholder: "Your name" },
                  { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
                ].map(f => (
                  <label key={f.name} className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">{f.label}</span>
                    <input name={f.name} type={f.type} required disabled={isPending}
                      placeholder={f.placeholder}
                      className="mt-2 w-full rounded-lg bg-white/5 border border-white/25 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60 transition disabled:opacity-50" />
                  </label>
                ))}
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">Project details</span>
                  <textarea name="message" required rows={4} disabled={isPending}
                    placeholder="Genre, word count, deadline, etc."
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/25 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60 transition disabled:opacity-50 resize-none" />
                </label>
                <button type="submit" disabled={isPending}
                  className="w-full rounded-full bg-[#D4AF37] text-black px-6 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 mt-2">
                  {isPending ? "Sending…" : "Send inquiry"}
                </button>
              </div>
            </form>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Book a call */}
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37]">Book a call</p>
                </div>
                <p className="text-sm text-white/55 leading-relaxed mb-5">
                  Prefer to talk through your project first? Check availability and book a free 15-minute call.
                </p>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-[#D4AF37]/50 hover:text-white">
                  Check availability
                </a>
              </div>

              {/* Direct email */}
              <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#0A0D3A]/60 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37]">Direct email</p>
                </div>
                <button
                  onClick={() => { if (!showEmail) setShowEmail(true); else window.location.href = "mailto:Dean@DMNarration.com"; }}
                  className="text-base font-semibold text-white hover:text-[#D4AF37] transition-colors">
                  {showEmail ? "Dean@DMNarration.com" : "Click to reveal"}
                </button>
                <p className="mt-1 text-xs text-white/30">Response within 24–48 hours.</p>
              </div>

              {/* Find me on */}
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                  </svg>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37]">Find me on</p>
                </div>
                <ul className="space-y-2.5">
                  {[
                    { label: "ACX narrator profile", href: "https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" },
                    { label: "TikTok — @deanmillernarration", href: "https://www.tiktok.com/@deanmillernarration" },
                    { label: "Instagram — @deanmillernarrator", href: "https://www.instagram.com/deanmillernarrator" },
                  ].map(l => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between text-sm text-white/50 hover:text-[#D4AF37] transition-colors group">
                        {l.label}
                        <svg className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="relative border-t border-white/6 pt-12 pb-8">
          <div className="max-w-4xl mx-auto px-8">
            {/* Wordmark */}
            <div className="flex flex-col items-center gap-2 mb-10">
              <div className="h-10 w-10 rounded-full border border-white/15 bg-white/5 overflow-hidden">
                <Image src="/dean-profile.png" alt="Dean Miller" width={40} height={40} className="object-cover"/>
              </div>
              <div className="text-center leading-tight">
                <p className="text-sm font-semibold text-white/80">Dean Miller</p>
                <p className="text-xs text-white/35">Audiobook Narrator</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-8 mb-10">
              {[
                { heading: "Navigation", links: [
                  { label: "Narrated works", href: "/narrated-works" },
                  { label: "Working together", href: "/welcome" },
                  { label: "Audio demos", href: "/#demos" },
                  { label: "Leave a review", href: "/leave-a-review" },
                ]},
                { heading: "Profiles", links: [
                  { label: "ACX", href: "https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" },
                  { label: "Audible", href: "https://www.audible.com/search?searchNarrator=Dean+Miller" },
                  { label: "Spotify", href: "https://open.spotify.com/show/5rGzXvmCjjza1WQGveIavz" },
                ]},
                { heading: "Social", links: [
                  { label: "TikTok", href: "https://www.tiktok.com/@deanmillernarration" },
                  { label: "Instagram", href: "https://www.instagram.com/deanmillernarrator" },
                ]},
              ].map(col => (
                <div key={col.heading}>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#D4AF37] mb-4 pb-2 border-b border-white/6">{col.heading}</p>
                  <ul className="space-y-2.5">
                    {col.links.map(l => (
                      <li key={l.href}>
                        <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined}
                          rel={l.href.startsWith("http") ? "noopener" : undefined}
                          className="text-white/50 hover:text-white transition-colors text-sm">
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-white/5 pt-8 text-center text-xs text-white/20">
              © {new Date().getFullYear()} Dean Miller Narration. All rights reserved.
            </div>
          </div>
          <Link href="/admin/login" className="absolute bottom-2 right-2 w-4 h-4 opacity-0" aria-label="Admin login" />
        </footer>
      </div>
    </main>
  );
}

export default function HomeClient({ acceptingProjects = true, stats }: { acceptingProjects?: boolean; stats?: { titles: number; authors: number; co_narrators: number; genres: number } }) {
  return <HomeContent acceptingProjects={acceptingProjects} stats={stats} />;
}
