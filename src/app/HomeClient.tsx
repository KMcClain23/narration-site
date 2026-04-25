"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, useState, useTransition } from "react";
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
  title, desc, src, index, activeIndex, setActiveIndex, audioRefs,
}: {
  title: string; desc: string; src: string; index: number;
  activeIndex: number | null; setActiveIndex: (v: number | null) => void;
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
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLElement>) => {
    const a = audioRefs.current[index];
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    a.currentTime = (x / rect.width) * duration;
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
      setPlaying(true); setBuffering(false); setActiveIndex(index);
      sendGAEvent("event", "demo_play", { event_category: "Audio", event_label: title, value: index });
      fetch("/api/track-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => { setPlaying(false); setCurrent(0); setActiveIndex(null); };
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
  }, [index, title, setActiveIndex, audioRefs]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={`group relative rounded-2xl transition-all duration-500 ${isActive ? "ring-1 ring-[#D4AF37]/50" : "hover:ring-1 hover:ring-white/10"}`}
      style={{ background: isActive ? "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(11,18,36,1) 60%)" : "rgba(11,18,36,1)" }}>

      {/* Ambient glow when active */}
      {isActive && (
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, rgba(212,175,55,0.4), transparent 60%)" }} />
      )}

      <div className="relative p-6 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-auto">
          <div>
            <h3 className="font-semibold text-base text-white leading-snug">{title}</h3>
            <p className="mt-1 text-sm text-white/50">{desc}</p>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-0.5 rounded-full bg-[#D4AF37]"
                  style={{ height: 14, animation: `barPulse 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
              ))}
            </div>
          )}
        </div>

        {/* Player */}
        <div className="mt-6 rounded-xl border border-white/8 bg-black/30 p-4">
          <div className="flex items-center gap-4">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} type="button"
              className={`relative h-12 w-12 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 ${
                isActive
                  ? "bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20 scale-110"
                  : "border border-white/15 bg-white/5 text-white hover:border-[#D4AF37]/50 hover:bg-white/10"
              } ${!src ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}>
              {buffering
                ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : playing
                  ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
                  : <svg className="h-5 w-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
              }
            </button>
            <div className="flex-1 min-w-0">
              <div
                role="slider"
                aria-label="Seekbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                onClick={handleSeek}
                className="relative block w-full h-2.5 rounded-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #D4AF37 ${pct}%, rgba(255,255,255,0.2) ${pct}%)`,
                  transition: "background 100ms linear",
                }}
              />
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-white/30">
                <span>{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-white/5 pt-3">
            <svg className="h-3.5 w-3.5 text-white/20 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Volume"
              onChange={handleVolume} className="flex-1 h-0.5 bg-white/10 rounded appearance-none cursor-pointer accent-[#D4AF37]" />
          </div>
          <audio ref={(el) => { audioRefs.current[index] = el; }} src={src} preload="metadata" />
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
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
    { title: "LGBTQ+ Romance", desc: "Bright pacing, playful emotional tone", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-PositiveFlirtatious.mp3" },
    { title: "Romantasy", desc: "Atmospheric delivery, grounded fantasy emotion", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%20to%20Remorse%2C%20Deep%20Loss.mp3" },
    { title: "Feminine Voice", desc: "Male & Female Dialogue", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3" },
    { title: "Romance Duet", desc: "British accent, romantic restraint", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3" },
    { title: "Child POV Drama", desc: "Raw emotion, age-appropriate delivery", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20(5-year-old%20boy)%2C%20Emotional%20TraumaWitness%20-%20Sample.mp3" },
    { title: "Multi-Character Dialogue", desc: "Clear character separation and vocal range", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3" },
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

        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-10 pb-12 w-full">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <div className="fade-up flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-[#D4AF37]" />
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#D4AF37]">Audiobook narrator</p>
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

            {/* CTAs */}
            <div className="fade-up-3 mt-10 flex flex-wrap gap-4">
              <a href="/#demos"
                className="inline-flex items-center gap-2.5 rounded-full bg-[#D4AF37] text-black px-7 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] hover:scale-[1.02] active:scale-[0.98]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
                Listen to demos
              </a>
              <a href="/#contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white/80 transition hover:border-white/50 hover:text-white hover:scale-[1.02] active:scale-[0.98]">
                Get in touch
              </a>
            </div>

            {/* Quick credential strip */}
            <div className="fade-up-4 mt-14 flex flex-wrap items-center gap-6">
              {[
                { label: "Turnaround", value: "24–48h" },
                { label: "Platform", value: "ACX-ready" },
                { label: "Specialties", value: "Dark romance · romantasy · drama" },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <div className="h-3.5 w-px bg-[#D4AF37]/40" />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">{s.label}</p>
                    <p className="text-xs text-white/70 mt-0.5">{s.value}</p>
                  </div>
                </div>
              ))}
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
            <div className="flex-1 h-px bg-white/6" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {demos.map((demo, index) => (
              <DemoPlayer key={demo.title} title={demo.title} desc={demo.desc} src={demo.src}
                index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} audioRefs={audioRefs} />
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/narrated-works"
              className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-[#D4AF37] transition-colors">
              Browse the full portfolio
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── ABOUT ── */}
        <section id="about" className="mt-16 scroll-mt-24" aria-label="About Dean Miller">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">About</p>
            <div className="flex-1 h-px bg-white/6" />
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
            <aside className="md:col-span-5">
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
                    <li key={item} className="flex items-start gap-3 px-5 py-3.5 text-sm text-white/65 hover:bg-white/[0.02] transition-colors">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-[#D4AF37] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="px-5 py-4 border-t border-white/8">
                  <Link href="/welcome"
                    className="text-sm text-[#D4AF37] hover:text-[#E0C15A] transition-colors inline-flex items-center gap-1.5">
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
        <section id="contact" className="mt-16 mb-16 scroll-mt-24" aria-label="Contact and booking">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Get in touch</p>
            <div className="flex-1 h-px bg-white/6" />
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
                      className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50" />
                  </label>
                ))}
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">Project details</span>
                  <textarea name="message" required rows={4} disabled={isPending}
                    placeholder="Genre, word count, deadline, etc."
                    className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50 resize-none" />
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
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] mb-3">Book a call</p>
                <p className="text-sm text-white/55 leading-relaxed mb-5">
                  Prefer to talk through your project first? Check availability and book a free 15-minute call.
                </p>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-[#D4AF37]/50 hover:text-white">
                  Check availability
                </a>
              </div>

              {/* Direct email */}
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] mb-3">Direct email</p>
                <button
                  onClick={() => { if (!showEmail) setShowEmail(true); else window.location.href = "mailto:Dean@DMNarration.com"; }}
                  className="text-base font-semibold text-white hover:text-[#D4AF37] transition-colors">
                  {showEmail ? "Dean@DMNarration.com" : "Click to reveal"}
                </button>
                <p className="mt-1 text-xs text-white/30">Response within 24–48 hours.</p>
              </div>

              {/* Find me on */}
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] mb-4">Find me on</p>
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
        <footer className="relative border-t border-white/6 pt-12 pb-8 text-sm text-white/25">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            {[
              { heading: "Navigation", links: [
                { label: "Narrated works", href: "/narrated-works" },
                { label: "Working together", href: "/welcome" },
                { label: "Audio demos", href: "/#demos" },
              ]},
              { heading: "Profiles", links: [
                { label: "ACX", href: "https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" },
                { label: "Audible", href: "https://www.audible.com/search?searchNarrator=Dean+Miller" },
              ]},
              { heading: "Social", links: [
                { label: "TikTok", href: "https://www.tiktok.com/@deanmillernarration" },
                { label: "Instagram", href: "https://www.instagram.com/deanmillernarrator" },
              ]},
            ].map(col => (
              <div key={col.heading}>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/20 mb-4">{col.heading}</p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l.href}>
                      <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined}
                        rel={l.href.startsWith("http") ? "noopener" : undefined}
                        className="text-white/35 hover:text-[#D4AF37] transition-colors text-sm">
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
          <Link href="/admin/login" className="absolute bottom-2 right-2 w-4 h-4 opacity-0" aria-label="Admin login" />
        </footer>
      </div>
    </main>
  );
}

export default function HomeClient() {
  return <HomeContent />;
}
