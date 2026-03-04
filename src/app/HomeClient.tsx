"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, useState, useTransition } from "react";
import { sendEmail } from "@/app/actions/sendEmail";

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";

const BANNER_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerBanner.png";
const LOGO_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerLogo.png";
const PROFILE_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile.jpg";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MediaLightbox({ isOpen, onClose, title, src }: { isOpen: boolean; onClose: () => void; title: string; src: string; }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#1A2550] bg-[#050814] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button type="button" onClick={onClose} className="rounded-md border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:border-white/40 hover:text-white">Close</button>
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
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
        <h3 className="font-semibold text-white">Broadcast-ready workflow</h3>
        <p className="mt-1 text-sm text-white/70">Clean, consistent delivery</p>
      </div>
      <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
        <h3 className="font-semibold text-white">Reliable turnaround</h3>
        <p className="mt-1 text-sm text-white/70">Clear deadlines and updates</p>
      </div>
      <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg transition hover:border-[#D4AF37]/50">
        <h3 className="font-semibold text-white">Easy to direct</h3>
        <p className="mt-1 text-sm text-white/70">Notes, pickups, fast revisions</p>
      </div>
    </div>
  );
}

function AtAGlanceCard({ onOpenLightbox }: { onOpenLightbox: (src: string, title: string) => void; }) {
  return (
    <div className="relative rounded-2xl border border-[#1A2550] bg-[#050814] p-6 shadow-xl">
      <p className="text-xs uppercase tracking-[0.22em] text-[#D4AF37]">At a glance</p>
      <h3 className="mt-2 text-lg font-semibold text-white">Dean Miller, Audiobook Narrator</h3>
      <p className="mt-1 text-sm text-white/70">Character-forward performance, clean audio, and direction-friendly workflow.</p>
      <div className="mt-5 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <h4 className="text-xs uppercase tracking-wide text-[#D4AF37]">Focus</h4>
          <p className="mt-2 text-sm text-white/80">Fiction and narrative nonfiction. Strong in romance, romantasy, drama, thriller, and multi-character dialogue.</p>
        </div>
        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <h4 className="text-xs uppercase tracking-wide text-[#D4AF37]">Studio</h4>
          <p className="mt-2 text-sm text-white/80">Broadcast-ready home studio. Shure MV7+, treated space, consistent edits.</p>
        </div>
        <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-4">
          <h4 className="text-xs uppercase tracking-wide text-[#D4AF37]">Media kit</h4>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <button type="button" onClick={() => onOpenLightbox(LOGO_URL, "Logo")} className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden border border-[#1A2550] bg-[#050814] transition hover:border-[#D4AF37]/60">
              <Image src={LOGO_URL} alt="Logo" fill className="object-contain p-2" />
            </button>
            <button type="button" onClick={() => onOpenLightbox(PROFILE_URL, "Headshot")} className="relative h-24 sm:h-28 w-full rounded-xl overflow-hidden border border-[#1A2550] bg-[#050814] transition hover:border-[#D4AF37]/60">
              <Image src={PROFILE_URL} alt="Headshot" fill className="object-cover" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoPlayer({ title, desc, src, index, activeIndex, setActiveIndex, audioRefs }: { title: string; desc: string; src: string; index: number; activeIndex: number | null; setActiveIndex: (v: number | null) => void; audioRefs: React.MutableRefObject<(HTMLAudioElement | null)[]>; }) {
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
      setPlaying(true); 
      setBuffering(false); 
      setActiveIndex(index);
      fetch('/api/track-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).catch(() => {});
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
      <div className="relative flex items-start justify-between gap-4 min-h-[64px]">
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-white leading-tight">{title}</h3>
          <p className="mt-1 text-sm text-white/70">{desc}</p>
        </div>
        <div className="shrink-0 pt-1">
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider font-bold transition-colors duration-300 ${isActive ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5DE85]" : "border-white/10 bg-white/5 text-white/40"}`}>
            {isActive ? "Now playing" : "Demo"}
          </span>
        </div>
      </div>
      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-[#1A2550] bg-[#050814] p-4">
          <div className="flex items-center gap-4">
            <button onClick={toggle} type="button" className={`relative h-14 w-14 shrink-0 rounded-full flex items-center justify-center transition active:scale-95 border-2 border-white/20 bg-white/5 text-white shadow-xl hover:border-[#D4AF37]/70 ${!src ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
              {buffering ? (<div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />) : playing ? (<svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>) : (<svg className="h-7 w-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>)}
            </button>
            <div className="flex-1 min-w-0">
              <button type="button" onClick={handleSeek} className="relative block w-full h-2 rounded-full overflow-hidden bg-white/10 cursor-pointer z-10">
                <div className="absolute left-0 top-0 h-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
              </button>
              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-white/40 tracking-tighter">
                <span>{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-3">
            <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolume} className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]" />
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxTitle, setLightboxTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formStatus, setFormStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const openLightbox = (src: string, title: string) => { setLightboxSrc(src); setLightboxTitle(title); setLightboxOpen(true); };
  const closeLightbox = () => setLightboxOpen(false);

  const handleNativeSubmit = async (formData: FormData) => {
    setFormStatus(null);
    startTransition(async () => {
      const result = await sendEmail(formData);
      if (result.success) {
        setFormStatus({ success: true, message: "Thanks! Inquiry sent. Talk soon!" });
        formRef.current?.reset();
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : "Please check the form and try again.";
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
    { title: "Multi-Character Text Dialogue", desc: "Clear character separation and vocal range", src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3" },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div id="top" />
      <section className="relative overflow-hidden -mt-16 pt-16">
        <div className="absolute inset-0">
          <Image src={BANNER_URL} alt="Dean Miller banner" fill priority className="object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050814]/85 via-[#050814]/75 to-[#050814]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 py-10 sm:py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-start">
            <div className="md:col-span-7">
              <p className="text-xs tracking-[0.28em] text-white/70 uppercase">Audiobook narrator for fiction and narrative nonfiction.</p>
              {/* Audit Fix: Explicit H1 for Crawler Visibility */}
              <h1 className="mt-3 sm:mt-4 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05]">Dean Miller</h1>
              <p className="mt-4 text-base sm:text-lg md:text-xl text-white/85 max-w-2xl leading-relaxed">Character-driven audiobook narration specializing in dark romance and romantasy. Broadcast-quality audio with 24-48 hour turnaround.</p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <a href="/#demos" className="w-full inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A]">Listen to demos</a>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center rounded-md border border-white/25 px-6 py-3 font-semibold transition hover:border-white/60">Request availability</a>
              </div>
              <ProofPoints />
            </div>
            <div className="hidden md:block md:col-span-5"><AtAGlanceCard onOpenLightbox={openLightbox} /></div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-12 sm:py-14">
        <section id="demos" className="mt-2 scroll-mt-24">
          <h2 className="text-3xl font-bold">Featured Audiobook Demos</h2>
          <p className="mt-2 text-white/70">Short, targeted clips. Sample the range and emotional depth of Dean Miller.</p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo, index) => (
              <DemoPlayer key={demo.title} title={demo.title} desc={demo.desc} src={demo.src} index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} audioRefs={audioRefs} />
            ))}
          </div>
        </section>

        <section id="about" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">About Dean Miller</h2>
          <div className="mt-6 flex flex-col gap-8">
            <div className="max-w-4xl">
              <p className="text-white/90 text-lg leading-relaxed">Hello. I’m <span className="text-[#D4AF37] font-semibold">Dean Miller</span>, a professional audiobook narrator specializing in immersive storytelling. I focus on emotionally grounded performances that let the listener get lost in the author&apos;s world.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-8 shadow-lg transition hover:border-[#D4AF37]/30">
                <h3 className="text-[#D4AF37] text-xs uppercase tracking-widest font-bold mb-4">The Musical Ear</h3>
                <p className="text-white/80 leading-relaxed text-sm">I’ve always been fascinated by vocal nuances. My background in music and theatre allows me to approach every script with a keen sense of rhythm, timing, and emotional authenticity.</p>
              </div>
              <div className="rounded-xl border border-[#1A2550] bg-[#0B1224] p-8 shadow-lg transition hover:border-[#D4AF37]/30">
                <h3 className="text-[#D4AF37] text-xs uppercase tracking-widest font-bold mb-4">The Professional Path</h3>
                <p className="text-white/80 leading-relaxed text-sm">Combining years of performance with a meticulous studio workflow, I provide authors with a seamless collaborative experience from first audition to final ACX-ready master.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="mt-20 scroll-mt-24">
          <h2 className="text-3xl font-bold">Contact & Booking</h2>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <form ref={formRef} action={handleNativeSubmit} className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
              {formStatus && (
                <div className={`mb-6 p-4 rounded-md text-sm border ${formStatus.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100" : "bg-red-500/10 border-red-500/30 text-red-100"}`}>
                  {formStatus.message}
                </div>
              )}
              <input type="text" name="_hp_name" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
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
                  <textarea name="message" required rows={6} disabled={isPending} className="mt-2 w-full rounded-md bg-[#050814] border border-[#1A2550] px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]/70 disabled:opacity-50" placeholder="Genre, word count, deadline, etc." />
                </label>
                <button type="submit" disabled={isPending} className="mt-5 w-full inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-3 font-semibold transition hover:bg-[#E0C15A] active:scale-[0.98] disabled:opacity-50">
                  {isPending ? "Sending..." : "Send inquiry"}
                </button>
              </div>
            </form>
            <div className="space-y-6 flex flex-col">
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg">
                <h3 className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">Direct Email</h3>
                <button 
                  onClick={() => window.location.href = "mailto:Dean@DMNarration.com"}
                  className="mt-2 text-lg font-semibold text-white hover:text-[#D4AF37] transition-colors"
                >
                  Dean@DMNarration.com
                </button>
                <p className="mt-2 text-sm text-white/50">Typical response within 24-48 hours.</p>
              </div>
              <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6 shadow-lg flex-1">
                <h3 className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">Studio Specs</h3>
                <ul className="mt-4 space-y-4 text-sm text-white/80">
                  <li className="flex items-start gap-3"><div className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shrink-0" />Hardware: Shure MV7+ with professional pop filtration.</li>
                  <li className="flex items-start gap-3"><div className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shrink-0" />Environment: Custom-treated acoustic space.</li>
                  <li className="flex items-start gap-3"><div className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shrink-0" />Quality: ACX-ready, broadcast-quality audio delivery.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Audit Fix: New Comprehensive Footer for Internal & Social Links */}
        <footer className="mt-24 border-t border-white/5 pt-12 pb-8 text-sm text-white/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left mb-12">
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Navigation</h4>
              <ul className="space-y-2">
                <li><Link href="/audiobook-narrator" className="hover:text-[#D4AF37]">Services & Rates</Link></li>
                <li><Link href="/narrated-works" className="hover:text-[#D4AF37]">Full Portfolio</Link></li>
                <li><a href="/#demos" className="hover:text-[#D4AF37]">Audio Samples</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Professional Links</h4>
              <ul className="space-y-2">
                <li><a href="https://www.linkedin.com/in/kevinandrewmcclain" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">LinkedIn Profile</a></li>
                <li><a href="https://www.acx.com/narrator?p=A3DYAXR7JFPXPE" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">ACX Narrator Profile</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4 uppercase tracking-wider text-xs">Social</h4>
              <ul className="space-y-2">
                <li><a href="https://www.tiktok.com/@deanmillernarration" target="_blank" rel="noopener" className="hover:text-[#D4AF37]">TikTok Portfolio</a></li>
              </ul>
            </div>
          </div>
          <div className="text-center pt-8 border-t border-white/5">
            <p>© {new Date().getFullYear()} Dean Miller Narration. All rights reserved.</p>
          </div>
          <Link
            href="/admin/login"
            className="absolute bottom-2 right-2 w-4 h-4 opacity-0"
            aria-label="Admin login"
          />
        </footer>
      </div>
      <MediaLightbox isOpen={lightboxOpen} onClose={closeLightbox} title={lightboxTitle} src={lightboxSrc} />
    </main>
  );
}

export default function HomeClient() {
  return <HomeContent />;
}