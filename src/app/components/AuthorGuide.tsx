"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Step {
  id: string;
  phase: string;
  title: string;
  duration: string;
  summary: string;
  detail: string;
  tips: string[];
  resources: { label: string; href: string }[];
  deanNote?: string;
}

const STEPS: Step[] = [
  {
    id: "manuscript-final",
    phase: "Editing",
    title: "Final manuscript edit",
    duration: "2–8 weeks",
    summary: "Before anything else — your book needs to be in its final, publication-ready form.",
    detail: "This means a full developmental edit (structure, pacing, character arcs), followed by line editing (sentence-level clarity and flow), then copy editing (grammar, consistency, punctuation), and finally proofreading. Most authors work with at least one professional editor. Don't skip this step — every downstream version of your book (ebook, print, audiobook) starts here.",
    tips: [
      "Hire a genre-experienced editor — romance editing is different from thriller editing",
      "Beta readers are not a substitute for a professional editor, but use both",
      "Allow at least one full week between your own read-throughs to see the manuscript fresh",
      "Lock the manuscript before audiobook production begins — changes after recording cost time and money",
    ],
    resources: [
      { label: "Reedsy: Find an editor", href: "https://reedsy.com/edit" },
      { label: "Editorial Freelancers Association", href: "https://www.the-efa.org" },
    ],
  },
  {
    id: "cover-design",
    phase: "Production",
    title: "Cover design",
    duration: "1–3 weeks",
    summary: "Your cover is your #1 marketing tool. It needs to signal genre instantly and look professional at thumbnail size.",
    detail: "Hire a designer who specialises in your genre. Dark romance covers look nothing like cozy mystery covers — the visual language matters. You'll need separate files optimised for ebook (1600×2400px minimum), print (with bleed and spine), and audiobook (square, 3000×3000px for Audible). Brief your designer with comparable titles ('books with covers like mine should look like X').",
    tips: [
      "Browse bestsellers in your genre on Amazon — your cover should fit the shelf",
      "Don't use a cover designed for ebook on your audiobook — AR and Audible require square format",
      "Get the layered source file from your designer so you can update the title for a series",
      "Test at 80×80px — if you can't read the title or see the genre, redesign",
    ],
    resources: [
      { label: "Reedsy: Cover designers", href: "https://reedsy.com/design" },
      { label: "99designs: Book covers", href: "https://99designs.com/book-cover-design" },
    ],
  },
  {
    id: "ebook-formatting",
    phase: "Production",
    title: "Ebook & print formatting",
    duration: "3–7 days",
    summary: "Format your manuscript for digital and physical distribution before uploading anywhere.",
    detail: "Ebook formatting converts your Word or Google Doc into a clean EPUB or MOBI file. Print formatting creates a properly laid-out PDF with correct margins, fonts, and chapter headers for POD (print on demand). These are different files — don't skip either if you plan to publish both. Tools like Vellum (Mac) or Atticus (cross-platform) make this manageable for self-publishers.",
    tips: [
      "Vellum is the gold standard for ebook and print formatting on Mac",
      "Atticus works on Windows and Mac and includes formatting + writing tools",
      "Always proof your formatted file on an actual Kindle device, not just the app",
      "Use consistent chapter heading styles — they power the ebook's table of contents",
    ],
    resources: [
      { label: "Vellum (Mac)", href: "https://vellum.pub" },
      { label: "Atticus (cross-platform)", href: "https://www.atticus.io" },
    ],
  },
  {
    id: "isbn-copyright",
    phase: "Publishing",
    title: "ISBN & copyright",
    duration: "1–3 days",
    summary: "Register your work and get ISBNs for each format before uploading anywhere.",
    detail: "An ISBN (International Standard Book Number) uniquely identifies each edition of your book. You need a separate ISBN for ebook, print, and audiobook. In the US, ISBNs are purchased from Bowker. Some platforms (KDP, IngramSpark) offer free ISBNs — these work, but tie the 'publisher of record' to that platform. Buying your own gives you control. Copyright registration is separate and optional in the US (your work is automatically protected) but registration strengthens your legal standing.",
    tips: [
      "Buy your own ISBNs from Bowker (myidentifiers.com) if you want to be your own publisher",
      "Bowker sells ISBNs in packs of 10 — much cheaper per unit than buying one at a time",
      "Copyright registration in the US costs $35–$65 and is done at copyright.gov",
      "Keep a master spreadsheet of all your ISBNs, formats, and registration numbers",
    ],
    resources: [
      { label: "Bowker: Buy ISBNs (US)", href: "https://www.myidentifiers.com" },
      { label: "US Copyright Office registration", href: "https://www.copyright.gov/registration" },
    ],
  },
  {
    id: "ebook-publishing",
    phase: "Publishing",
    title: "Ebook & print publishing",
    duration: "1–5 days (+ review time)",
    summary: "Upload your formatted files and metadata to your chosen distribution platforms.",
    detail: "For ebooks, the main options are KDP (Amazon's platform, also handles print), Draft2Digital (wide distribution aggregator), and uploading direct to each retailer. KDP Select gives you Kindle Unlimited access in exchange for 90-day Amazon exclusivity. Going 'wide' means publishing everywhere — Kobo, Apple Books, Barnes & Noble, and more — without exclusivity. For print, KDP Print and IngramSpark are the two primary options; IngramSpark reaches more bookstores and libraries.",
    tips: [
      "KDP Select (Kindle Unlimited) can be lucrative for romance — but requires exclusivity",
      "Draft2Digital is the easiest way to go wide without managing each retailer separately",
      "IngramSpark has a better print quality reputation and wider bookstore distribution than KDP Print",
      "Set a pre-order for at least 2–4 weeks to build early momentum before launch day",
    ],
    resources: [
      { label: "KDP: Kindle Direct Publishing", href: "https://kdp.amazon.com" },
      { label: "Draft2Digital: Wide distribution", href: "https://www.draft2digital.com" },
      { label: "IngramSpark: Print distribution", href: "https://www.ingramspark.com" },
    ],
  },
  {
    id: "audiobook-production",
    phase: "Audiobook",
    title: "Audiobook production",
    duration: "4–12 weeks",
    summary: "Turn your book into an immersive listening experience with a professional narrator.",
    detail: "Audiobook production starts with choosing your platform (ACX/Audible or Authors Republic for wide distribution) and finding the right narrator. On ACX, you can post your project and receive auditions, or approach narrators directly. On Authors Republic, you work with narrators off-platform with a direct contract. Either way, the process involves: narrator auditions → character voice approval → First 15 review → full recording → corrections → final delivery.",
    tips: [
      "Listen to a narrator's demos in your specific genre before reaching out — tone matters as much as quality",
      "ACX royalty share requires no upfront cost but ties you to Audible exclusivity for 7 years",
      "PFH (per-finished-hour) gives you ownership and flexibility — a 90,000-word book is roughly 10 finished hours",
      "Lock your manuscript before production begins — changes after recording are expensive",
      "Provide a character voice list and pronunciation guide before the narrator starts",
    ],
    resources: [
      { label: "ACX: Find a narrator", href: "https://www.acx.com" },
      { label: "Author's Republic: Narrator marketplace", href: "https://www.authorsrepublic.com/how-it-works" },
      { label: "Working with Dean Miller →", href: "/welcome" },
    ],
    deanNote: "This is where I come in. I specialise in dark romance, romantasy, and character-driven drama — and I bring a background in music and theatre to every project. If your book has complex characters, emotional depth, or multi-POV scenes, let's talk.",
  },
  {
    id: "arc-reviews",
    phase: "Marketing",
    title: "ARCs & early reviews",
    duration: "3–6 weeks before launch",
    summary: "Get your book into readers' hands early to build reviews and word-of-mouth before launch day.",
    detail: "ARC stands for Advance Review Copy. Distributing ARCs to readers, bloggers, and BookTok/Bookstagram influencers in exchange for honest reviews builds social proof before your launch. Services like BookSirens, NetGalley, and StoryOrigin help manage ARC distribution. Aim for at least 20–30 reviews live on launch day. For audiobooks, you can request promotional codes from Audible (via ACX) or provide download links for AR.",
    tips: [
      "Target ARC readers who review in your genre — a cozy mystery reviewer won't help your dark romance",
      "BookTok (TikTok's book community) can drive significant sales for romance — prioritise video-friendly reviewers",
      "Don't ask for positive reviews — ask for honest ones. Authenticity converts better",
      "Schedule ARC distribution to land at least 3 weeks before launch so reviews are live in time",
    ],
    resources: [
      { label: "BookSirens: ARC management", href: "https://booksirens.com" },
      { label: "StoryOrigin: ARC & newsletter tools", href: "https://storyoriginapp.com" },
      { label: "NetGalley: Trade ARC platform", href: "https://www.netgalley.com" },
    ],
  },
  {
    id: "launch-marketing",
    phase: "Marketing",
    title: "Launch & marketing",
    duration: "Ongoing",
    summary: "A coordinated launch amplifies word-of-mouth and maximises your first-week ranking on Amazon and Audible.",
    detail: "A successful launch combines social media, email list, paid ads, and retailer promotions. For romance and dark romance, TikTok (BookTok) and Instagram (Bookstagram) are the highest-ROI organic channels. Build your launch team (readers who share on launch day), coordinate with your ARC readers for review timing, and consider a release day countdown. Paid ads on Amazon (AMS), Facebook/Instagram, and BookBub come after you have at least 10 reviews.",
    tips: [
      "Your email list is your most valuable asset — start building it before your first book",
      "A 'launch team' of 20 engaged readers sharing on the same day can spike your ranking",
      "Don't run paid ads until you have reviews — no reviews means low conversion on ad traffic",
      "BookBub Featured Deals are competitive but can move thousands of units for a backlist book",
      "For audiobook marketing: Chirp deals (via Authors Republic) and Whispersync promotions (via ACX) are both worth exploring",
    ],
    resources: [
      { label: "Mailerlite: Email marketing (free tier)", href: "https://www.mailerlite.com" },
      { label: "BookBub: Reader promotions", href: "https://www.bookbub.com/partners" },
      { label: "Publisher Rocket: Amazon keyword research", href: "https://publisherrocket.com" },
    ],
  },
  {
    id: "series-backlist",
    phase: "Growth",
    title: "Series, backlist & long game",
    duration: "Ongoing",
    summary: "One book is a debut. A backlist is a business. The most successful indie authors think in series.",
    detail: "Romance readers in particular are voracious — they want to know there's more coming. A series amplifies every marketing dollar: ads for book 1 convert better when books 2–5 are available because readers know there's more to buy. Build your backlist deliberately: plan series arcs before you publish book 1, keep your world and character details in a series bible, and consider a consistent release cadence to stay visible in the algorithm. Audiobook rights for a series are a strong draw for narrators too.",
    tips: [
      "Plan your series before publishing book 1 — it shapes everything from the cover to the ending",
      "A 'series bible' tracks character descriptions, timelines, world rules, and continuity details",
      "Rapid release (one book every 4–6 weeks) is a common indie strategy for genre fiction",
      "Consider bundling completed series arcs as box sets — they sell well and expand your audience",
      "Audiobook rights for a full series are often more valuable than a single title — worth discussing early",
    ],
    resources: [
      { label: "Alliance of Independent Authors", href: "https://www.allianceindependentauthors.org" },
      { label: "20Books to 50K (indie author community)", href: "https://www.facebook.com/groups/20Booksto50k" },
    ],
  },
];

const PHASE_COLORS: Record<string, string> = {
  "Editing":    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Production": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Publishing": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Audiobook":  "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30",
  "Marketing":  "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "Growth":     "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

export default function AuthorGuide() {
  const [active, setActive] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  const currentStep = active !== null ? active : 0;

  const scrollToStep = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goToStep = (index: number) => {
    setActive(index);
    setTimeout(() => scrollToStep(index), 50);
  };

  const markComplete = (index: number) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    if (index < STEPS.length - 1) {
      goToStep(index + 1);
    }
  };

  useEffect(() => {
    if (started && active === null) {
      setActive(0);
      setTimeout(() => scrollToStep(0), 100);
    }
  }, [started, active]);

  if (!started) {
    return (
      <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/8 to-transparent p-8 text-center">
        <div className="mx-auto max-w-xl">
          {/* Opening hook */}
          <div className="mb-8 text-left">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37] mb-4">Author resource</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
              So you&apos;ve finished<br />writing a book.
            </h2>
            <p className="text-xl text-[#D4AF37] font-semibold mb-5">Now what?</p>
            <div className="space-y-3 text-sm text-white/65 leading-relaxed">
              <p>
                Finishing a manuscript is a huge deal — but it&apos;s also just the beginning. What comes next can feel overwhelming: editing, cover design, ISBNs, formatting, choosing between KDP and wide distribution, figuring out audiobooks, marketing, launch strategy...
              </p>
              <p>
                This guide walks you through every step in order, with honest advice, realistic timelines, and links to the tools and people who can help. It&apos;s built specifically for indie authors publishing fiction — and it&apos;s completely free.
              </p>
              <p className="text-white/45 italic text-xs">
                Follow along step by step, or jump to whatever you&apos;re working on right now.
              </p>
            </div>
          </div>

          {/* Phase overview */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-8">
            {["Editing", "Production", "Publishing", "Audiobook", "Marketing", "Growth"].map((phase, i) => (
              <div key={phase} className="text-center">
                <div className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1.5 rounded-lg border mb-1 ${PHASE_COLORS[phase]}`}>
                  {phase}
                </div>
                <p className="text-[9px] text-white/25">Step {
                  i === 0 ? "1" : i === 1 ? "2–3" : i === 2 ? "4–5" : i === 3 ? "6" : i === 4 ? "7–8" : "9"
                }</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => setStarted(true)}
              className="inline-flex items-center gap-2.5 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-8 py-4 rounded-full transition-all hover:scale-105 active:scale-95 text-sm shadow-lg shadow-[#D4AF37]/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Guide Me
            </button>
            <p className="mt-3 text-xs text-white/25">{STEPS.length} steps · skip or jump ahead at any time · completely free</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-white/40 mb-2">
          <span>{completed.size} of {STEPS.length} steps reviewed</span>
          <button onClick={() => { setStarted(false); setActive(null); setCompleted(new Set()); }} className="hover:text-white transition-colors">
            Reset guide
          </button>
        </div>
        <div className="h-1 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
            style={{ width: `${(completed.size / STEPS.length) * 100}%` }}
          />
        </div>
        {/* Step dots */}
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((step, i) => (
            <button
              key={step.id}
              onClick={() => goToStep(i)}
              title={step.title}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                completed.has(i) ? "bg-[#D4AF37]" :
                active === i ? "bg-white/60" :
                "bg-white/15 hover:bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isOpen = active === i;
          const isDone = completed.has(i);

          return (
            <div
              key={step.id}
              ref={el => { stepRefs.current[i] = el; }}
              className={`rounded-2xl border transition-all duration-300 ${
                isOpen
                  ? "border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/5 to-white/[0.02]"
                  : isDone
                  ? "border-white/8 bg-white/[0.02] opacity-70"
                  : "border-white/8 bg-white/[0.02] hover:border-white/15"
              }`}
            >
              {/* Step header */}
              <button
                type="button"
                onClick={() => goToStep(isOpen ? -1 : i)}
                className="w-full text-left px-5 py-4 flex items-center gap-4"
              >
                {/* Number / check */}
                <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                  isDone
                    ? "bg-[#D4AF37] border-[#D4AF37] text-black"
                    : isOpen
                    ? "border-[#D4AF37]/60 text-[#D4AF37] bg-[#D4AF37]/10"
                    : "border-white/20 text-white/40 bg-white/5"
                }`}>
                  {isDone
                    ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : i + 1
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PHASE_COLORS[step.phase]}`}>
                      {step.phase}
                    </span>
                    <span className="text-[10px] text-white/30">{step.duration}</span>
                  </div>
                  <p className={`font-semibold text-sm sm:text-base leading-snug ${isOpen ? "text-white" : isDone ? "text-white/50 line-through decoration-white/20" : "text-white/80"}`}>
                    {step.title}
                  </p>
                </div>

                <svg
                  className={`h-4 w-4 shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Step body */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-white/6 pt-4">
                  <p className="text-white/80 text-sm leading-relaxed font-medium mb-3">{step.summary}</p>
                  <p className="text-white/60 text-sm leading-relaxed">{step.detail}</p>

                  {/* Dean note */}
                  {step.deanNote && (
                    <div className="mt-4 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-bold mb-2">A note from Dean</p>
                      <p className="text-sm text-white/80 leading-relaxed">{step.deanNote}</p>
                      <Link href="/welcome"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37] hover:text-[#E0C15A] transition-colors">
                        Learn about working together
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                  )}

                  {/* Tips */}
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Tips</p>
                    <ul className="space-y-2">
                      {step.tips.map((tip, ti) => (
                        <li key={ti} className="flex gap-2.5 text-sm text-white/65">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-[#D4AF37] shrink-0" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Resources */}
                  {step.resources.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Resources</p>
                      <div className="flex flex-wrap gap-2">
                        {step.resources.map(r => (
                          r.href.startsWith("/") ? (
                            <Link key={r.href} href={r.href}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/25 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/20 transition-colors">
                              {r.label}
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </Link>
                          ) : (
                            <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:border-white/25 hover:text-white transition-colors">
                              {r.label}
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => markComplete(i)}
                      className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-5 py-2.5 rounded-full text-xs transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {i < STEPS.length - 1 ? "Got it — next step" : "Complete!"}
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => goToStep(i - 1)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 hover:text-white transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        Previous
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion state */}
      {completed.size === STEPS.length && (
        <div className="mt-6 rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <h3 className="font-bold text-lg text-white mb-2">You've been through it all</h3>
          <p className="text-sm text-white/60 mb-4">If your manuscript is ready and you're thinking about audiobook narration, I'd love to hear about your project.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="mailto:Dean@DMNarration.com"
              className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-6 py-3 rounded-full text-sm transition-colors">
              Get in touch with Dean
            </a>
            <Link href="/welcome"
              className="inline-flex items-center gap-2 border border-white/20 hover:border-white/40 text-white/80 hover:text-white font-semibold px-6 py-3 rounded-full text-sm transition-colors">
              View the process
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
