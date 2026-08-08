"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useEffect, useState, useTransition, useCallback, useMemo } from "react";
import { sendEmail } from "@/app/actions/sendEmail";
import { sendGAEvent } from "@next/third-parties/google";
import { DemoPlayer, DEMO_COLORS, titleToSlug } from "@/components/demos/DemoPlayer";
// Demos now come from Supabase via page.tsx — no hardcoded config needed

const BOOKINGS_URL =
  "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";
const BANNER_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerBanner.png";

const PROFILE_URL =
  "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile%20Photo%202.jpg";

const LOGO_ITEMS: { name: string; src: string; href: string; filter?: string }[] = [
  {
    name: "Spotify Audiobooks",
    src: "https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg",
    href: "https://open.spotify.com/show/5rGzXvmCjjza1WQGveIavz",
  },
  {
    name: "Blue Nose Audio",
    src: "https://www.bluenoseaudio.com/uploads/7/1/4/6/7146733/untitled-design-2.png",
    href: "https://www.bluenoseaudio.com",
  },
  {
    name: "Dark Star Romance",
    src: "https://darkstarromance.com/wp-content/uploads/2023/07/1.png",
    href: "https://darkstarromance.com",
  },
  {
    name: "ACX",
    src: "https://seeklogo.com/images/A/audiobook-creation-exchange-logo-837E58791F-seeklogo.com.png",
    href: "https://www.acx.com",
  },
  {
    name: "Author's Republic",
    src: "https://www.authorsrepublic.com/images/ar-logo.png",
    href: "https://www.authorsrepublic.com",
    filter: "brightness(0) invert(1)",
  },
  {
    name: "AHAB",
    src: "https://www.ahabtalent.com/wp-content/themes/ahab_talent/assets/images/ahab_logo.svg",
    href: "https://www.ahabtalent.com",
  },
  {
    name: "Pink Flamingo Productions",
    src: "https://images.squarespace-cdn.com/content/v1/5ff4961f791d303194d2bc47/3cbdac2c-6825-422b-b70c-7d272d0b7611/Untitled+design+%2835%29.png",
    href: "https://www.pinkflamingoproductions.com",
  },
];


function LogoCard({
  logo,
  duplicate = false,
}: {
  logo: { name: string; src: string; href: string; filter?: string };
  duplicate?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <a
      href={logo.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={logo.name}
      // The seamless-loop copy is decorative and unreachable by keyboard, so it
      // is announced and tabbed to once, not twice.
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : undefined}
      className="shrink-0 w-44 h-20 rounded-xl border border-white/20 bg-white/5 px-5 py-3 flex items-center justify-center transition-all duration-200 hover:border-white/50 hover:scale-105"
    >
      {imgError ? (
        <span className="text-white/70 text-xs font-semibold text-center leading-tight">{logo.name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo.src}
          alt={logo.name}
          className="h-full w-full object-contain"
          style={logo.filter ? { filter: logo.filter } : undefined}
          onError={() => setImgError(true)}
        />
      )}
    </a>
  );
}

/**
 * Section label, in two weights.
 *
 * Every section used to carry the identical gold rule and tracked caps —
 * six of them, top to bottom, so nothing told the eye which section mattered.
 * Six equal signals read the same as none.
 *
 * "primary" keeps the full treatment for the sections a visitor is actually
 * deciding on. "quiet" drops the rules and keeps the label, which preserves the
 * motif without every band on the page shouting at the same volume.
 */
function SectionLabel({
  children,
  variant = "primary",
  align = "left",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
  align?: "left" | "center";
}) {
  const label = (
    <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37] whitespace-nowrap">{children}</p>
  );

  if (variant === "quiet") {
    return <div className={`mb-6 ${align === "center" ? "text-center" : ""}`}>{label}</div>;
  }

  return (
    <div className={`flex items-center gap-4 mb-10 ${align === "center" ? "justify-center" : ""}`}>
      <div className="h-px w-6 bg-[#D4AF37]" />
      {label}
      {align === "center" ? <div className="h-px w-6 bg-[#D4AF37]" /> : <div className="flex-1 h-px bg-[#D4AF37]/20" />}
    </div>
  );
}

// Demo data shape coming from Supabase
type DbDemo = {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  file_url: string;
  duration_seconds: number | null;
  sort_order: number;
};





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

/**
 * Longest a pull quote runs before the rest goes behind "Read more".
 *
 * Praise is not read at length. One testimonial ran to seven paragraphs on the
 * card, which is a reading task rather than a recommendation, and the card was
 * cutting the others mid-sentence with an ellipsis. A quote that stops on a
 * full stop reads as something the person said; one that stops on "…" reads as
 * something a script did to it.
 */
const TRUNCATE_LENGTH = 240;

/** Cut at the last sentence end that fits, so the quote closes cleanly. */
function toPullQuote(text: string): { quote: string; truncated: boolean } {
  if (text.length <= TRUNCATE_LENGTH) return { quote: text, truncated: false };
  const window = text.slice(0, TRUNCATE_LENGTH);
  const end = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  // No sentence break to land on, so fall back to the hard cut rather than
  // returning the whole thing.
  if (end < 60) return { quote: window.trimEnd() + "…", truncated: true };
  return { quote: text.slice(0, end + 1), truncated: true };
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const [expanded, setExpanded] = useState(false);
  const hasParagraphs = Boolean(testimonial.paragraphs?.length);
  const fullText = hasParagraphs ? "" : (testimonial.quote || "");
  const pull = toPullQuote(fullText);
  const isLong = !hasParagraphs && pull.truncated;
  const displayQuote = isLong && !expanded ? pull.quote : fullText;
  const paragraphs = testimonial.paragraphs || [];
  // One paragraph, not two: the opening line is the recommendation and
  // everything after it is the supporting detail someone reads only if the
  // opening earned it.
  const visibleParagraphs = hasParagraphs && !expanded ? paragraphs.slice(0, 1) : paragraphs;
  const hasMoreParagraphs = hasParagraphs && paragraphs.length > 1;

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
                {expanded ? "Show less" : "Read the full review"}
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

function HomeContent({ acceptingProjects = true, bookingWindow, demos: rawDemos = [] }: { acceptingProjects?: boolean; bookingWindow?: string; demos?: DbDemo[] }) {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formStatus, setFormStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  const [submittedName, setSubmittedName] = useState("");

  const handleNativeSubmit = async (formData: FormData) => {
    setFormStatus(null);
    const name = (formData.get("name") as string) || "";
    startTransition(async () => {
      const result = await sendEmail(formData);
      if (result.success) {
        setSubmittedName(name);
        setFormStatus({ success: true });
        formRef.current?.reset();
        fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "contact_form_submitted", page: "/", metadata: {} }),
        }).catch(() => {});
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

  // Adapt Supabase demo rows to the shape DemoPlayer expects
  const demos = rawDemos.map((d, i) => ({
    title:  d.title,
    desc:   d.description ?? "",
    src:    d.file_url,
    slug:   titleToSlug(d.title),
    color:  DEMO_COLORS[i % DEMO_COLORS.length],
    tags:   d.genre ? [d.genre] : [],
    durationSeconds: d.duration_seconds ?? 0,
  }));

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
      <section className="relative min-h-[60vh] flex items-center pt-16 sm:pt-20" aria-label="Introduction">
        {/* Full bleed background */}
        <div className="absolute inset-0">
          <Image src={BANNER_URL} alt="Dean Miller recording studio" fill
            sizes="(max-width: 768px) 100vw, 100vw"
            className="object-cover opacity-20" style={{ objectPosition: "center center" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(6,8,46,0.6) 0%, rgba(6,8,46,0.3) 40%, rgba(6,8,46,1) 100%)" }} />
          {/* Strong vignette to clip edges */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(6,8,46,0.85) 70%, rgba(6,8,46,1) 100%)" }} />
        </div>

        {/* Grid rather than an absolutely-positioned portrait: the photo needs
            to sit *above* the copy on a phone rather than vanish, and an
            absolute element cannot participate in that stacking. */}
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-4 sm:pt-10 pb-6 w-full">
          <div className="flex flex-col-reverse gap-8 md:grid md:grid-cols-12 md:items-center md:gap-10">
          <div className="md:col-span-8">
            {/* Eyebrow now carries the name.
                The name used to be the h1 at text-7xl, which answered a
                question no visitor arrives with — an author is deciding
                whether you can narrate *their* book, and the pitch that
                answers it was set at a quarter the size underneath. Identity
                is still here, and the <title> tag carries it for search. */}
            <div className="fade-up flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-[#D4AF37]" />
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#D4AF37]">
                Dean Miller <span className="text-white/40">· Audiobook narrator</span>
              </p>
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
                {acceptingProjects && bookingWindow && (
                  <span className="text-white/50 font-normal"> · Booking {bookingWindow}</span>
                )}
              </span>
            </div>

            {/* The pitch, at the size the name used to be.
                This line was the About section's heading, four sections down —
                the best sentence on the site, where almost nobody scrolled. */}
            <h1 className="fade-up-1 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-2xl">
              Listeners forget there&apos;s a narrator at all.
            </h1>

            {/* Genre match, so an author knows within a glance whether this is
                for their book. */}
            <p className="fade-up-2 mt-6 text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
              Character-driven audiobook narration for books that demand emotional depth.
            </p>

            {/* The call to action, alone.
                It used to share this row with five stat pills, so the one click
                worth making sat at the same visual weight as "37 genres". */}
            <div className="fade-up-3 mt-10">
              <a href="/#contact"
                className="inline-flex items-center gap-2 rounded-full bg-[#D4AF37] text-black px-7 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] hover:scale-[1.02] active:scale-[0.98]">
                Get in touch
              </a>
            </div>
          </div>

          {/* Portrait, now visible on a phone.
              It was hidden md:block, so the majority of visitors got no face at
              all on a site whose entire proposition is one person's voice. On
              mobile it sits above the copy (flex-col-reverse) at a size that
              introduces without pushing the pitch off-screen. */}
          <div className="fade-up md:col-span-4 mx-auto w-40 sm:w-48 md:w-full md:max-w-[16rem]">
            <div className="relative" style={{ aspectRatio: "3/4" }}>
              <div className="absolute inset-0 rounded-2xl overflow-hidden border-2 border-[#D4AF37]/40"
                style={{ boxShadow: "0 0 30px rgba(212,175,55,0.15)" }}>
                <Image src={PROFILE_URL} alt="Dean Miller, audiobook narrator" fill
                  sizes="(max-width: 768px) 192px, 256px"
                  className="object-cover" style={{ objectPosition: "center top" }} priority />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(6,8,46,1) 0%, rgba(6,8,46,0.4) 40%, transparent 70%)" }} />
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ── LOGO CAROUSEL ── */}
      {/* Was aria-hidden, which hid the only third-party credibility on the
          page from anyone using a screen reader. The logos are real links to
          real platforms; they belong in the accessibility tree. */}
      <section className="border-t border-white/10 pt-10 pb-10" aria-label="Platforms and publishers Dean works with">
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <SectionLabel variant="quiet" align="center">Works With</SectionLabel>
          <div
            className="overflow-hidden logo-carousel-wrapper"
            style={{
              maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent 100%)",
            }}
          >
            <div className="logo-track flex gap-4 w-max">
              {/* The list is duplicated so the scroll loops seamlessly. Only the
                  first copy is announced — the second is the same seven links
                  again, and a screen reader reading them twice is noise. */}
              {[...LOGO_ITEMS, ...LOGO_ITEMS].map((logo, i) => (
                <LogoCard key={i} logo={logo} duplicate={i >= LOGO_ITEMS.length} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-5 sm:px-6">

        {/* ── DEMOS ── */}
        <section id="demos" className="pt-2 scroll-mt-24" aria-label="Audio demos">
          {/* Section label */}
          <SectionLabel variant="primary">Featured demos</SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {demos.map((demo, index) => (
              <DemoPlayer key={demo.title} title={demo.title} desc={demo.desc} src={demo.src} slug={demo.slug}
                color={demo.color} tags={demo.tags} durationSeconds={demo.durationSeconds}
                index={index} activeIndex={activeIndex} setActiveIndex={setActiveIndex} audioRefs={audioRefs} />
            ))}
          </div>

          {/* Two different intents, and until now only the second was offered:
              the one link out of the demos section went to /narrated-works,
              which is books. Anyone who wanted to hear more had nowhere to go,
              even though /demos already listed every one of them. Hearing more
              is the closer match to what someone is doing here, so it leads. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demos"
              className="inline-flex items-center gap-2 bg-[#D4AF37] text-black hover:bg-[#E0C15A] px-5 py-2 rounded-full text-sm font-semibold transition-colors">
              Hear all demos
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/narrated-works"
              className="inline-flex items-center gap-2 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10 px-5 py-2 rounded-full text-sm transition-colors">
              Browse the full portfolio
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>


        {/* ── WHAT TO EXPECT ── */}
        {/* Promoted out of the About sidebar. This is the most reassuring
            content on the page for an author who has been burned by a narrator
            before, and it was sitting in a right-hand column four sections
            down. It belongs immediately after the demos, at the point where
            someone has heard the voice and is deciding whether to work with
            the person attached to it. */}
        <section id="process" className="mt-16 scroll-mt-24" aria-label="What to expect">
          <SectionLabel>What to expect</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Character voice list sent for approval before recording",
              "First-15 review to lock tone and voices early",
              "Milestone updates throughout production",
              "ACX-ready masters, delivered to spec",
              "Fast pickups and clear communication",
              "Option to livestream sessions for promo content",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-4">
                <span className="block border-l-2 border-[#D4AF37] pl-3 text-sm text-white/70">{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link href="/welcome"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#D4AF37] border border-[#D4AF37]/40 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]/70 transition-colors">
              Full process &amp; welcome packet
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ── TESTIMONIALS ── */}
        <section id="testimonials" className="mt-16 scroll-mt-24 -mx-5 sm:-mx-6 px-5 sm:px-6 bg-white/[0.02]" aria-label="Testimonials">
          <SectionLabel variant="primary">Testimonials</SectionLabel>
          <TestimonialsCarousel />
        </section>

        {/* ── ABOUT ── */}
        <section id="about" className="mt-16 scroll-mt-24" aria-label="About Dean Miller">
          <SectionLabel variant="quiet">About</SectionLabel>

          <div className="max-w-3xl space-y-5">
              {/* Plainer than it was, because the line that used to live here
                  — "listeners forget there's a narrator at all" — is now the
                  hero headline, and repeating it twice on one page spends the
                  best sentence on the site twice for no extra effect. */}
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Background, method, and the room it&apos;s recorded in.
              </h2>
              <p className="text-white/70 text-base leading-relaxed">
                I'm a professional audiobook narrator with a background in music and theatre. My focus is
                immersive, character-forward performance that finds the emotional truth in every scene and
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
        </section>

        {/* ── CONTACT ── */}
        <section id="contact" className="mt-16 mb-16 scroll-mt-24 -mx-5 sm:-mx-6 px-5 sm:px-6 bg-white/[0.02]" aria-label="Contact and booking">
          <SectionLabel variant="primary">Get in touch</SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form / Success */}
            {formStatus?.success ? (
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-8 backdrop-blur-sm flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
                  <svg className="h-7 w-7 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">Thanks{submittedName ? `, ${submittedName.split(" ")[0]}` : ""}!</p>
                  <p className="text-sm text-white/60 mt-1">Your inquiry has been received.</p>
                  <p className="text-sm text-white/50 mt-0.5">I&apos;ll be in touch within 24–48 hours.</p>
                </div>
                <button type="button" onClick={() => { setFormStatus(null); setSubmittedName(""); }}
                  className="text-xs text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-colors mt-2">
                  Send another inquiry
                </button>
              </div>
            ) : (
            <form ref={formRef} action={handleNativeSubmit}
              className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6 backdrop-blur-sm">
              {formStatus && !formStatus.success && (
                <div className="mb-5 px-4 py-3 rounded-lg text-sm border bg-red-500/8 border-red-500/20 text-red-300">
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
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">Genre</span>
                  <select name="genre" disabled={isPending}
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/25 px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]/60 transition disabled:opacity-50 appearance-none">
                    <option value="" className="bg-[#0A0D3A]">Select a genre…</option>
                    {["Dark Romance","Romantasy","Thriller","LGBTQ+ Fiction","Drama","Sci-Fi / Fantasy","Contemporary Romance","Horror","Other"].map(g => (
                      <option key={g} value={g} className="bg-[#0A0D3A]">{g}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">Word count <span className="normal-case tracking-normal text-white/20">(optional)</span></span>
                  <input name="word_count" type="text" disabled={isPending}
                    placeholder="e.g. 90,000"
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/25 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60 transition disabled:opacity-50" />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium">Project details</span>
                  <textarea name="message" required rows={3} disabled={isPending}
                    placeholder="Deadline, series info, tone, anything else…"
                    className="mt-2 w-full rounded-lg bg-white/5 border border-white/25 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60 transition disabled:opacity-50 resize-none" />
                </label>
                <button type="submit" disabled={isPending}
                  className="w-full rounded-full bg-[#D4AF37] text-black px-6 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 mt-2">
                  {isPending ? "Sending…" : "Send inquiry"}
                </button>
              </div>
            </form>
            )}

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* One card, not three.
                  The form is the route that captures a project; the rest of
                  this column was competing with it at equal weight. "Find me
                  on" is deleted rather than merged: ACX, TikTok and Instagram
                  are all already in the footer a few inches below, so it was
                  the same three links twice on one screen.

                  Email keeps its click-to-reveal, which exists to keep the
                  address away from scrapers, but it is a line inside this card
                  now rather than a card of its own. */}
              <div className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37]">Prefer to talk first?</p>
                </div>
                <p className="text-sm text-white/55 leading-relaxed mb-5">
                  Book a free 15-minute call and we can talk the project through before anything is written down.
                </p>
                <a href={BOOKINGS_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-[#D4AF37]/50 hover:text-white">
                  Check availability
                </a>

                <div className="mt-6 border-t border-white/8 pt-5">
                  <p className="text-sm text-white/55">
                    Or email{" "}
                    <button
                      onClick={() => { if (!showEmail) setShowEmail(true); else window.location.href = "mailto:Dean@DMNarration.com"; }}
                      className="font-semibold text-white underline decoration-[#D4AF37]/40 underline-offset-4 hover:text-[#D4AF37] transition-colors">
                      {showEmail ? "Dean@DMNarration.com" : "click to reveal"}
                    </button>
                    {" "}directly.
                  </p>
                  <p className="mt-1 text-xs text-white/30">Response within 24 to 48 hours.</p>
                </div>
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
                <Image src="https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile%20Photo%202.jpg" alt="Dean Miller" width={40} height={40} className="object-cover" style={{ objectPosition: "center 30%" }}/>
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
                  { label: "Discord", href: "https://discord.com/users/1425271466538045512" },
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
            <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-white/20">
              <span>© {new Date().getFullYear()} Dean Miller Narration. All rights reserved.</span>
              <span className="hidden sm:inline">·</span>
              <a href="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</a>
              <span>·</span>
              <a href="/terms" className="hover:text-white/50 transition-colors">Terms of Service</a>
            </div>
          </div>
          <Link href="/admin/login" className="absolute bottom-2 right-2 w-4 h-4 opacity-0" aria-label="Admin login" />
        </footer>
      </div>
    </main>
  );
}

export default function HomeClient({ acceptingProjects = true, bookingWindow, demos }: { acceptingProjects?: boolean; bookingWindow?: string; demos?: DbDemo[] }) {
  return <HomeContent acceptingProjects={acceptingProjects} bookingWindow={bookingWindow} demos={demos} />;
}
