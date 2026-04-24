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

  const handleSeek = (e: React.MouseEvent<HTMLButtonElement>) => {
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
    <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 min-h-[64px]">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-white leading-tight">{title}</h3>
          <p className="mt-1 text-sm text-white/70">{desc}</p>
        </div>
        <span className={`shrink-0 mt-1 rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider font-bold transition-colors duration-300 ${isActive ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DE85]" : "border-white/10 bg-white/5 text-white/40"}`}>
          {isActive ? "Now playing" : "Demo"}
        </span>
      </div>
      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-[#1A2550] bg-[#050814] p-4">
          <div className="flex items-center gap-4">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} type="button"
              className={`relative h-14 w-14 shrink-0 rounded-full flex items-center justify-center transition active:scale-95 border-2 border-white/20 bg-white/5 text-white shadow-xl hover:border-[#D4AF37]/70 ${!src ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
              {buffering ? (
                <div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
              ) : playing ? (
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
              ) : (
                <svg className="h-7 w-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <button type="button" aria-label="Seekbar" onClick={handleSeek}
                className="relative block w-full h-2 rounded-full overflow-hidden bg-white/10 cursor-pointer z-10">
                <div className="absolute left-0 top-0 h-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
              </button>
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-white/40 tracking-tighter">
                <span>{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-3">
            <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Volume control"
              onChange={handleVolume} className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]" />
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
        setFormStatus({ success: true, message: "Thanks! Inquiry sent. Talk soon!" });
        formRef.current?.reset();
      } else {
        const errorMsg = typeof result.error === "string" ? result.error : "Please check the form and try again.";
        setFormStatus({ success: false, message: errorMsg });
      }
    });
  };

  useEffect(() => {
    audioRefs.current.forEach((audio, i) => {
      if (audio && activeIndex !== null && i !== activeIndex) {
        audio.pause();
        audio.currentTime = 0;
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
    <main className="min-h-screen bg-[#050814] text-white">
      <div id="top" />

      {/* HERO */}
      <section className="relative overflow-hidden -mt-16 pt-16" aria-label="Introduction">
        <div className="absolute inset-0">
          <Image src={BANNER_URL} alt="Dean Miller recording studio" fill priority sizes="100vw" className="object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050814]/80 via-[#050814]/70 to-[#050814]" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-20 md:py-28">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7">
              <p className="text-xs tracking-[0.28em] text-white/60 uppercase">Audiobook narrator · Dark romance &amp; romantasy</p>
              <h1 className="mt-3 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05]">Dean Miller</h1>
              <p className="mt-5 text-base sm:text-lg text-white/85 max-w-xl leading-relaxed">
                Character-driven narration for fiction that demands emotional depth. Specializing in dark romance, romantasy, and multi-character drama — delivered broadcast-ready with 24–48 hour turnaround.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="/#demos" className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-7 py-3 font-semibold transition hover:bg-[#E0C15A]">Listen to demos</a>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-md border border-white/25 px-7 py-3 font-semibold transition hover:border-white/60">Request availability</a>
              </div>
            </div>
            <div className="hidden md:flex md:col-span-5 flex-col items-center gap-6">
              <div className="relative h-56 w-56 rounded-full overflow-hidden border-2 border-[#D4AF37]/30 shadow-2xl">
                <Image src={PROFILE_URL} alt="Dean Miller, audiobook narrator" fill sizes="224px" className="object-cover" priority />
              </div>
              <div className="grid grid-cols-3 gap-3 w-full text-center">
                {[{ label: "Genres", value: "6+" }, { label: "Turnaround", value: "24–48h" }, { label: "Platform", value: "ACX" }].map((s) => (
                  <div key={s.label} className="rounded-xl border border-[#1A2550] bg-[#0B1224] py-3 px-2">
                    <p className="text-[#D4AF37] font-bold text-lg leading-none">{s.value}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-white/50">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-5 sm:px-6">

        {/* DEMOS */}
        <section id="demos" className="mt-4 scroll-mt-24" aria-label="Audio demos">
          <h2 className="text-3xl font-bold">Featured audiobook demos</h2>
          <p className="mt-2 text-white/60">Six targeted clips showcasing range, character work, and emotional depth across genres.</p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo, index) => (
              <DemoPlayer key={demo.title} title={demo.title} desc={demo.desc} src={demo.src} index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} audioRefs={audioRefs} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/narrated-works" className="inline-flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#E0C15A] transition">
              Browse the full portfolio
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="mt-24 scroll-mt-24" aria-label="About Dean Miller">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
            <div className="md:col-span-7">
              <h2 className="text-3xl font-bold">About Dean Miller</h2>
              <p className="mt-4 text-white/85 text-base leading-relaxed">
                I&apos;m a professional audiobook narrator with a background in music and theatre. My focus is immersive, character-forward performance — the kind where listeners forget they&apos;re listening to a single person.
              </p>
              <p className="mt-4 text-white/75 text-base leading-relaxed">
                I specialize in dark romance, romantasy, LGBTQ+ fiction, thriller, and drama. Strong in emotionally complex scenes, multi-character dialogue, and accent work including British RP. Every project gets a full character voice list sent for author approval before recording begins.
              </p>
              <p className="mt-4 text-white/75 text-base leading-relaxed">
                My home studio delivers ACX-ready, broadcast-quality audio on a Shure MV7+ in a custom-treated acoustic space. Milestone updates throughout, and pickups handled promptly.
              </p>
            </div>
            <aside className="md:col-span-5 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">What to expect</p>
              <ul className="mt-4 space-y-3">
                {[
                  "Character voice list sent for approval before recording",
                  "First-15 review — approve tone and voices early",
                  "Milestone updates throughout the project",
                  "ACX-ready masters, clean edits, no outsourced mastering",
                  "Fast pickups and clear communication",
                  "Option to livestream recording sessions for promo content",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/80">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-white/10 pt-5">
                <Link href="/welcome" className="text-sm text-[#D4AF37] hover:text-[#E0C15A] transition inline-flex items-center gap-1">
                  Full process &amp; welcome packet
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="mt-24 scroll-mt-24" aria-label="Contact and booking">
          <h2 className="text-3xl font-bold">Get in touch</h2>
          <p className="mt-2 text-white/60">Ready to cast your next project? Send an inquiry or book a call directly.</p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <form ref={formRef} action={handleNativeSubmit} className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
              {formStatus && (
                <div className={`mb-6 p-4 rounded-md text-sm border ${formStatus.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100" : "bg-red-500/10 border-red-500/30 text-red-100"}`}>
                  {formStatus.message}
                </div>
              )}
              <input type="text" name="_hp_name" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm text-white/80 font-medium">Name</span>
                  <input name="name" required disabled={isPending} className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 disabled:opacity-50" placeholder="Your name" />
                </label>
                <label className="block">
                  <span className="text-sm text-white/80 font-medium">Email</span>
                  <input name="email" type="email" required disabled={isPending} className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 disabled:opacity-50" placeholder="you@example.com" />
                </label>
                <label className="block">
                  <span className="text-sm text-white/80 font-medium">Project details</span>
                  <textarea name="message" required rows={5} disabled={isPending} className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 disabled:opacity-50" placeholder="Genre, word count, deadline, etc." />
                </label>
                <button type="submit" disabled={isPending} className="mt-2 w-full inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A] active:scale-[0.98] disabled:opacity-50">
                  {isPending ? "Sending…" : "Send inquiry"}
                </button>
              </div>
            </form>
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
                <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">Book a call</p>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">Prefer to talk through your project first? Check availability and book a free 15-minute call.</p>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer" className="mt-4 w-full inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-2.5 text-sm font-semibold transition hover:border-[#D4AF37]/60 hover:text-white">
                  Check availability
                </a>
              </div>
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
                <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">Direct email</p>
                <button onClick={() => { if (!showEmail) { setShowEmail(true); } else { window.location.href = "mailto:Dean@DMNarration.com"; } }} className="mt-2 text-base font-semibold text-white hover:text-[#D4AF37] transition-colors">
                  {showEmail ? "Dean@DMNarration.com" : "Click to reveal email"}
                </button>
                <p className="mt-1 text-sm text-white/50">Typical response within 24–48 hours.</p>
              </div>
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
                <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">Find me on</p>
                <ul className="mt-3 space-y-2 text-sm text-white/75">
                  <li><a href="https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" target="_blank" rel="noopener noreferrer" className="hover:text-[#D4AF37] transition">ACX narrator profile</a></li>
                  <li><a href="https://www.tiktok.com/@deanmillernarration" target="_blank" rel="noopener noreferrer" className="hover:text-[#D4AF37] transition">TikTok — @deanmillernarration</a></li>
                  <li><a href="https://www.instagram.com/deanmillernarrator" target="_blank" rel="noopener noreferrer" className="hover:text-[#D4AF37] transition">Instagram — @deanmillernarrator</a></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative mt-24 border-t border-white/5 pt-12 pb-8 text-sm text-white/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left mb-10">
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Navigation</h4>
              <ul className="space-y-2">
                <li><Link href="/narrated-works" className="hover:text-[#D4AF37]">Narrated works</Link></li>
                <li><Link href="/welcome" className="hover:text-[#D4AF37]">Working together</Link></li>
                <li><a href="/#demos" className="hover:text-[#D4AF37]">Audio demos</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Profiles</h4>
              <ul className="space-y-2">
                <li><a href="https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">ACX</a></li>
                <li><a href="https://www.audible.com/search?searchNarrator=Dean+Miller" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">Audible</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Social</h4>
              <ul className="space-y-2">
                <li><a href="https://www.tiktok.com/@deanmillernarration" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">TikTok</a></li>
                <li><a href="https://www.instagram.com/deanmillernarrator" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">Instagram</a></li>
              </ul>
            </div>
          </div>
          <div className="text-center pt-8 border-t border-white/5">
            <p>© {new Date().getFullYear()} Dean Miller Narration. All rights reserved.</p>
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
