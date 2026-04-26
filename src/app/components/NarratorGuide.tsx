"use client";

import { useState, useRef } from "react";

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
    id: "voice-assessment",
    phase: "Foundation",
    title: "Assess your voice & skills",
    duration: "1–4 weeks",
    summary: "Before investing in equipment, honestly evaluate your voice, range, and current skill level.",
    detail: "Not everyone who loves audiobooks is ready to narrate them professionally — and that's okay. Start by recording yourself reading aloud for 30 minutes straight. Listen back critically: Is your diction clear? Do you drop energy toward the end of sentences? Can you sustain character voices consistently? Do you have a regional accent that might limit your market? None of these are disqualifying — but knowing where you stand shapes everything that comes next. Audiobook narration is a performance craft as much as a vocal one.",
    tips: [
      "Record 30 minutes of unedited reading and listen back — most people are surprised by what they hear",
      "A light regional accent can be an asset in some genres; a heavy one may need coaching to neutralise for ACX",
      "Theatre, voiceover, or performance training translates directly — leverage it if you have it",
      "Listen to 5–10 professional audiobooks in your target genre with headphones — study the pacing, breath control, and character differentiation",
      "Consider hiring a voiceover coach for even 2–3 sessions before investing in a studio",
      "When new, expect 8–12 hours of total work per finished hour of audio — recording, editing, proofing, corrections. Experienced narrators get this down to 3–6 hours",
    ],
    resources: [
      { label: "Narrators Roadmap: Start here", href: "https://www.narratorsroadmap.com" },
      { label: "Narrator Self-Assessment Quiz — Karen Commins", href: "https://www.narratorsroadmap.com/audiobook-narrator-self-assessment-quiz/" },
      { label: "narrator.life: Free intro courses", href: "https://www.narrator.life" },
      { label: "Gravy For The Brain: VO training", href: "https://www.gravyforthebrain.com" },
    ],
  },
  {
    id: "home-studio",
    phase: "Foundation",
    title: "Build your home studio",
    duration: "2–6 weeks",
    summary: "ACX and Authors Republic have strict technical requirements. Your recordings must meet them before you can work professionally.",
    detail: "You don't need a professional studio — but you do need a quiet, acoustically treated space and quality equipment. The most important factor is room treatment, not microphone price. A closet full of clothes can outperform a bare room with an expensive mic. ACX requires: -23dB to -18dB RMS, -3dB peak max, noise floor below -60dB, MP3 format at 192kbps. Authors Republic has similar specs. Get your room right first, then choose your mic.",
    tips: [
      "A walk-in closet with hanging clothes is one of the best free acoustic treatments available",
      "The Shure MV7+ is an excellent USB/XLR mic for narrators at a professional price point",
      "Audacity is free and capable — but Reaper ($60 one-time) or Adobe Audition are worth the upgrade",
      "Use ACX Check (a free Audacity plugin) to verify your files meet spec before submitting",
      "Record a 5-minute test, run it through ACX Check, and fix your room before buying more gear",
      "A reflection filter on a mic stand is a cheap first step — not a substitute for room treatment",
    ],
    resources: [
      { label: "ACX: Audio submission requirements", href: "https://www.acx.com/help/narrator-requirements/201456300" },
      { label: "Narrators Roadmap: Production workflow", href: "https://www.narratorsroadmap.com/audiobook-production-workflow/" },
      { label: "ACX Check plugin (free)", href: "https://www.acxcheck.com" },
      { label: "Reaper DAW ($60)", href: "https://www.reaper.fm" },
    ],
  },
  {
    id: "training-performance",
    phase: "Foundation",
    title: "Performance training",
    duration: "Ongoing",
    summary: "Technical quality gets you in the door. Performance keeps you working.",
    detail: "Audiobook narration is acting with your voice. The narrators who build long careers are the ones who can inhabit characters, sustain emotional truth over hours of recording, and differentiate between 8 characters in the same scene without losing the listener. Study acting technique — even basic scene analysis, objective/motivation work, and emotional memory will elevate your narration. For romance and dark romance specifically, the ability to perform intimate scenes with authenticity and without awkwardness is a genuine skill worth developing deliberately.",
    tips: [
      "Read the full book before recording a single word — you need to know where the story goes",
      "Build a character voice chart: age, background, accent, emotional register, vocal quality for each character",
      "Record your First 15 as if it's the final product — that's what the author is approving",
      "Practise cold reading regularly — auditions often require you to perform unrehearsed passages",
      "Dark romance, romantasy, and intimate scenes require comfort and commitment — practise reading these aloud privately until they feel natural",
      "Take acting or improv classes — even one term will change how you approach character work",
    ],
    resources: [
      { label: "narrator.life: Launching for New Narrators course", href: "https://www.narrator.life" },
      { label: "Narrators Roadmap: Knowledge base", href: "https://www.narratorsroadmap.com/knowledge-base/" },
      { label: "narrator.life: Community for working narrators", href: "https://www.narrator.life/community" },
      { label: "Sean Allen Pratt: Narration coaching", href: "https://www.seanallenpratt.com" },
    ],
  },
  {
    id: "demo-production",
    phase: "Getting Work",
    title: "Produce your demo reel",
    duration: "2–4 weeks",
    summary: "Your demos are your audition. They need to show range, genre fluency, and professional audio quality.",
    detail: "A narrator demo is typically 1–3 minutes of your best work, edited to showcase different genres, tones, and character types. You need at least one demo per genre you want to work in. For romance and dark romance specifically, include a scene with emotional tension and distinct male/female voices if you can perform both. Use excerpts from published books you haven't narrated (for demo purposes only — not for distribution). Your demo should sound identical to a finished, retail-ready audiobook.",
    tips: [
      "Produce one strong demo per genre — a generic 'all-purpose' demo is less effective than targeted ones",
      "Use passages from published books that showcase your strengths, not your average work",
      "Edit ruthlessly — 90 seconds of your best work beats 3 minutes of mixed quality",
      "Have a professional or experienced narrator listen before you publish — you're too close to it",
      "Your demo audio must meet ACX spec — if your demo doesn't meet spec, neither will your work",
      "Update your demos as your skills improve — old demos can hurt you if they no longer represent your current quality",
    ],
    resources: [
      { label: "ACX: Creating a profile & demos", href: "https://www.acx.com/help/getting-started/200484540" },
      { label: "Voice123: Demo advice", href: "https://voice123.com/blog/how-to-make-a-voice-over-demo" },
    ],
  },
  {
    id: "platform-registration",
    phase: "Getting Work",
    title: "Register on platforms",
    duration: "1–3 days",
    summary: "Get your profiles live on ACX and Authors Republic so authors can find you.",
    detail: "ACX is Amazon's platform — creating a profile and uploading demos lets rights holders audition you for their projects. You can also browse open projects and self-submit auditions. Authors Republic has a narrator marketplace called The AR Studio where you can apply to be listed. Both platforms are free to join. Beyond these, Voices.com and Voice123 are broader voiceover marketplaces where audiobook work is listed alongside other VO work.",
    tips: [
      "Your ACX profile is searchable — use descriptive language about your voice type, accents, and genres",
      "Upload demos for every genre you can perform — authors filter by genre when browsing narrators",
      "Applying to the AR Studio requires an approved application — apply early as it can take time",
      "Keep your profile photo professional — authors do look at it",
      "List your turnaround time accurately — overpromising and underdelivering damages your reputation fast",
      "AHAB (run by Penguin Random House) is the big-publisher casting platform — worth creating a profile early even if you focus on indie work first",
      "Pozotron is an AI-powered proofing tool that catches misreads against the script — used by many professional narrators to speed up QC",
    ],
    resources: [
      { label: "ACX: Create narrator profile", href: "https://www.acx.com/narrator" },
      { label: "Author's Republic Studio: Apply", href: "https://www.authorsrepublic.com/how-it-works" },
      { label: "AHAB Talent (Penguin Random House)", href: "https://www.ahabtalent.com" },
      { label: "Pozotron: AI proofing tool", href: "https://www.pozotron.com" },
    ],
  },
  {
    id: "auditioning",
    phase: "Getting Work",
    title: "Auditioning & landing projects",
    duration: "Ongoing",
    summary: "Auditioning is a numbers game at first — but quality and targeted submissions beat volume.",
    detail: "On ACX, rights holders post projects and narrators self-submit auditions. Read the full project listing before recording — many narrators skip the details and submit generic auditions that clearly weren't tailored to the project. Use the author's own excerpt, read it the way the book sounds (check their other titles for tone clues), and follow any specific instructions exactly. Your audition audio must meet ACX spec. Authors Republic works differently — authors invite narrators from the marketplace, so a strong profile is your audition.",
    tips: [
      "Read the project listing completely — casting notes, character descriptions, and tone guidance are often included",
      "Audition for projects in your genre first — a romance specialist beats a generalist for romance projects",
      "Keep auditions under 5 minutes — longer isn't better",
      "Follow up with a brief, professional message if you don't hear back within 2 weeks",
      "Don't accept royalty share projects until you have a track record — PFH protects you as a newcomer",
      "Your first few projects matter most for reviews — prioritise authors who communicate clearly",
    ],
    resources: [
      { label: "ACX: Browse open projects", href: "https://www.acx.com/auditions" },
      { label: "Narrators Roadmap: Auditioning tips", href: "https://www.narratorsroadmap.com/knowledge-base/" },
      { label: "Findaway Voices: Additional platform", href: "https://www.findawayvoices.com" },
    ],
  },
  {
    id: "working-with-authors",
    phase: "Craft",
    title: "Working with authors",
    duration: "Per project",
    summary: "The author relationship is a collaboration. Clear communication and professionalism are as important as performance.",
    detail: "Most authors — especially indie romance authors — are not audio production experts. They need guidance, reassurance, and clear milestones. Send a character voice list for approval before you record. Deliver the First 15 on time and invite specific feedback. Be explicit about your revision policy upfront. Respond to messages within 24–48 hours. One excellent author experience generates referrals; one poor experience generates warnings in author Facebook groups and Discord servers. The romance author community is small and tightly networked.",
    tips: [
      "Send a character voice list with audio samples before starting — it prevents costly re-records",
      "The First 15 is your opportunity to lock performance direction — treat it as seriously as the final product",
      "Be specific about your revision policy in writing before the project begins",
      "Offer milestone updates proactively — authors who don't hear from you assume something is wrong",
      "Ask if the author wants to be involved in or notified about any live streaming of sessions",
      "Never start full recording without an approved First 15 — it's your protection as much as theirs",
    ],
    resources: [],
    deanNote: "The character voice list, First 15 process, and milestone communication are the core of how I work with every author. These habits build trust and generate repeat bookings. If you're interested in how I structure projects, the Working Together section above covers my full process.",
    resources: [
      { label: "Narrators Roadmap: Working with indie authors", href: "https://www.narratorsroadmap.com/audiobook-production-workflow/" },
    ],,
  },
  {
    id: "editing-mastering",
    phase: "Craft",
    title: "Editing & mastering",
    duration: "Per project",
    summary: "ACX-ready audio requires more than a clean recording — editing and mastering are a craft of their own.",
    detail: "Raw recordings need editing (removing mouth noise, breath sounds, stumbles, and room noise), followed by mastering (RMS normalisation, peak limiting, noise floor reduction, and format export). Many new narrators underestimate how long this takes — editing typically takes 2–3x the recording time. Learn to do this yourself initially so you understand the process, even if you later outsource it. Never outsource mastering to someone who doesn't understand ACX spec — a rejected file wastes everyone's time.",
    tips: [
      "Learn to edit your own audio first — outsourcing before you understand the process means you can't QC it",
      "Mouth noise (clicks, lip smacks) is the most common complaint from authors — address it in your recording environment and in post",
      "Use a noise reduction plugin carefully — too much degrades voice quality",
      "Always run your final file through ACX Check before delivering",
      "Batch processing similar files saves significant time on longer projects",
      "Keep your raw recordings — you may need to re-edit if there's a dispute",
    ],
    resources: [
      { label: "ACX: Audio requirements checklist", href: "https://www.acx.com/help/narrator-requirements/201456300" },
      { label: "iZotope RX: Audio repair (industry standard)", href: "https://www.izotope.com/en/products/rx.html" },
    ],
  },
  {
    id: "rates-contracts",
    phase: "Business",
    title: "Rates, contracts & payment",
    duration: "Ongoing",
    summary: "Know your worth, price your work correctly, and protect yourself with clear agreements.",
    detail: "ACX offers two payment models: Per Finished Hour (PFH) where you're paid a flat rate per hour of finished audio, and Royalty Share where you receive 20% of net sales in exchange for no upfront payment — but you're locked into 7-year exclusivity with Audible. For new narrators, royalty share can feel like a safe entry point but often results in earning very little. PFH rates on ACX typically range from $100–$400+ per finished hour depending on experience. Off-platform work (Authors Republic, direct author contracts) is always PFH and typically commands higher rates.",
    tips: [
      "Don't accept PFH rates below $100 — it devalues the market for everyone and rarely reflects the true time invested",
      "A 90,000-word book = roughly 10 finished hours = 30+ hours of total work (recording + editing + mastering)",
      "Royalty share locks you to Audible for 7 years — read the contract before accepting",
      "Off-platform contracts should specify: deliverables, timeline, revision rounds, payment schedule, and usage rights",
      "Get 50% payment upfront for off-platform projects from authors you haven't worked with before",
      "Keep records of every payment, contract, and delivery — you're a business",
    ],
    resources: [
      { label: "ACX: Payment & royalty information", href: "https://www.acx.com/help/payment/201370340" },
      { label: "Audio Publishers Association: Industry rates", href: "https://www.audiopub.org" },
    ],
  },
  {
    id: "building-brand",
    phase: "Growth",
    title: "Building your brand & online presence",
    duration: "Ongoing",
    summary: "Authors need to find you. A professional online presence — website, social media, and platform profiles — makes that possible.",
    detail: "Your website is your home base. It should include your demos, your genres, your process, and a way to contact you. Social media — particularly TikTok and Instagram — is where romance and dark romance authors spend time. Posting behind-the-scenes content, character voice reveals, and recording process videos builds an audience of both readers and authors. The romance narrator community on BookTok is growing fast. Authors who find you through social media are often more invested, better communicators, and more likely to become repeat clients.",
    tips: [
      "Your website should load fast, feature your demos prominently, and make it easy to contact you",
      "TikTok is the highest-ROI platform for romance narrators right now — short clips of character voices perform well",
      "Post consistently rather than perfectly — 3 times a week of decent content beats once a week of perfect content",
      "Tag authors when you post about their books — they often share it, exposing you to their audience",
      "Consider offering to livestream recording sessions — it's promotional content for both you and the author",
      "Your ACX profile, Authors Republic profile, and website should all have consistent branding and current demos",
    ],
    resources: [
      { label: "Narrators Roadmap: Website & branding", href: "https://www.narratorsroadmap.com/knowledge-base/" },
      { label: "narrator.life: Community & ongoing growth", href: "https://www.narrator.life/community" },
      { label: "Squarespace: Website builder", href: "https://www.squarespace.com" },
      { label: "Later: Social media scheduling", href: "https://later.com" },
    ],
  },
  {
    id: "growing-roster",
    phase: "Growth",
    title: "Growing your roster & going full-time",
    duration: "6 months–3 years",
    summary: "Sustainable narrator income comes from repeat clients, referrals, and a growing backlist of royalty-earning titles.",
    detail: "Most full-time audiobook narrators earn income from a combination of active work (current projects) and passive income (royalties from a growing catalogue). Building a roster of 3–5 authors who book you repeatedly is more valuable than constantly auditioning for new projects. Deliver exceptional work, communicate clearly, and make each author feel like their project is your priority — because it is. The romance author community refers narrators constantly in private groups. One glowing recommendation from a well-connected author can fill your calendar for months.",
    tips: [
      "Treat every project as an audition for the next one — repeat bookings are your most efficient source of income",
      "Ask satisfied authors for referrals explicitly — most are happy to recommend but won't think to do it unprompted",
      "Build a project pipeline so you're never scrambling — ideally have the next 2–3 projects confirmed before finishing the current one",
      "Track your PFH rate over time and raise it as your experience grows — don't stay at entry rates once you have a track record",
      "A catalogue of 20+ titles with even modest royalty share can become meaningful passive income over years",
      "Consider specialising deeply in one genre — being known as 'the' dark romance narrator is more valuable than being a generalist",
    ],
    resources: [
      { label: "Narrators Roadmap: Full career resource hub", href: "https://www.narratorsroadmap.com" },
      { label: "narrator.life 365: Community for working narrators", href: "https://www.narrator.life/community" },
      { label: "APA: Audio Publishers Association", href: "https://www.audiopub.org" },
      { label: "Narrator Facebook groups (search 'ACX narrators')", href: "https://www.facebook.com/groups/search/results/?q=acx%20narrators" },
    ],
  },
];

const PHASE_COLORS: Record<string, string> = {
  "Foundation":   "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Getting Work": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Craft":        "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Business":     "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Growth":       "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30",
};

export default function NarratorGuide() {
  const [active, setActive] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollToStep = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const goToStep = (index: number) => {
    setActive(index);
    setTimeout(() => scrollToStep(index), 50);
  };

  const markComplete = (index: number) => {
    setCompleted(prev => { const n = new Set(prev); n.add(index); return n; });
    if (index < STEPS.length - 1) goToStep(index + 1);
  };

  if (!started) {
    return (
      <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/8 to-transparent p-8">
        <div className="max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37] mb-4">Narrator resource</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
            So you want to narrate<br />audiobooks.
          </h2>
          <p className="text-xl text-[#D4AF37] font-semibold mb-5">Where do you start?</p>
          <div className="space-y-3 text-sm text-white/65 leading-relaxed mb-6">
            <p>
              Audiobook narration is one of the most rewarding careers in voice work — but breaking in requires more than a good voice. You need a professional studio, performance craft, platform knowledge, business sense, and the ability to sustain a character for 10+ hours of recording.
            </p>
            <p>
              This guide covers the full journey: from assessing your voice and building a home studio, to landing your first projects, working with authors, and growing a sustainable full-time career.
            </p>
            <p className="text-white/40 italic text-xs">
              Already working? Jump to whichever phase is most relevant to where you are now.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-8">
            {["Foundation", "Getting Work", "Craft", "Business", "Growth"].map((phase, i) => (
              <div key={phase} className="text-center">
                <div className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1.5 rounded-lg border mb-1 ${PHASE_COLORS[phase]}`}>
                  {phase}
                </div>
                <p className="text-[9px] text-white/25">
                  {i === 0 ? "Steps 1–3" : i === 1 ? "Steps 4–6" : i === 2 ? "Steps 7–8" : i === 3 ? "Step 9" : "Steps 10–11"}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={() => { setStarted(true); setActive(0); setTimeout(() => scrollToStep(0), 100); }}
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
    );
  }

  return (
    <div>
      {/* Pinned resource banner */}
      <div className="mb-6 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-bold mb-2">Two sites every narrator should bookmark</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a href="https://www.narratorsroadmap.com" target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 group">
            <div className="mt-0.5 h-6 w-6 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
              <svg className="h-3 w-3 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-[#D4AF37] transition-colors">Narrators Roadmap</p>
              <p className="text-xs text-white/50 leading-snug">The most comprehensive free resource hub for audiobook narrators at every level — built by Karen Commins, an award-winning narrator with 80+ titles.</p>
            </div>
          </a>
          <a href="https://www.narrator.life" target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 group">
            <div className="mt-0.5 h-6 w-6 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
              <svg className="h-3 w-3 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-[#D4AF37] transition-colors">narrator.life</p>
              <p className="text-xs text-white/50 leading-snug">Courses, coaching, and a focused community for working narrators — built by Andi Arndt, Audie award-winning narrator and Golden Voice actor.</p>
            </div>
          </a>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-white/40 mb-2">
          <span>{completed.size} of {STEPS.length} steps reviewed</span>
          <button onClick={() => { setStarted(false); setActive(null); setCompleted(new Set()); }} className="hover:text-white transition-colors">Reset guide</button>
        </div>
        <div className="h-1 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#D4AF37] transition-all duration-500" style={{ width: `${(completed.size / STEPS.length) * 100}%` }} />
        </div>
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((step, i) => (
            <button key={step.id} onClick={() => goToStep(i)} title={step.title}
              className={`flex-1 h-1.5 rounded-full transition-all ${completed.has(i) ? "bg-[#D4AF37]" : active === i ? "bg-white/60" : "bg-white/15 hover:bg-white/30"}`} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isOpen = active === i;
          const isDone = completed.has(i);
          return (
            <div key={step.id} ref={el => { stepRefs.current[i] = el; }}
              className={`rounded-2xl border transition-all duration-300 ${isOpen ? "border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/5 to-white/[0.02]" : isDone ? "border-white/8 bg-white/[0.02] opacity-70" : "border-white/8 bg-white/[0.02] hover:border-white/15"}`}>

              <button type="button" onClick={() => goToStep(isOpen ? -1 : i)} className="w-full text-left px-5 py-4 flex items-center gap-4">
                <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${isDone ? "bg-[#D4AF37] border-[#D4AF37] text-black" : isOpen ? "border-[#D4AF37]/60 text-[#D4AF37] bg-[#D4AF37]/10" : "border-white/20 text-white/40 bg-white/5"}`}>
                  {isDone
                    ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PHASE_COLORS[step.phase]}`}>{step.phase}</span>
                    <span className="text-[10px] text-white/30">{step.duration}</span>
                  </div>
                  <p className={`font-semibold text-sm sm:text-base leading-snug ${isOpen ? "text-white" : isDone ? "text-white/50 line-through decoration-white/20" : "text-white/80"}`}>{step.title}</p>
                </div>
                <svg className={`h-4 w-4 shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-white/6 pt-4">
                  <p className="text-white/80 text-sm leading-relaxed font-medium mb-3">{step.summary}</p>
                  <p className="text-white/60 text-sm leading-relaxed">{step.detail}</p>

                  {step.deanNote && (
                    <div className="mt-4 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-bold mb-2">From Dean</p>
                      <p className="text-sm text-white/80 leading-relaxed">{step.deanNote}</p>
                      <a href="#process" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37] hover:text-[#E0C15A] transition-colors">
                        See the full process
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </a>
                    </div>
                  )}

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

                  {step.resources.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold mb-2">Resources</p>
                      <div className="flex flex-wrap gap-2">
                        {step.resources.map(r => (
                          <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full hover:border-white/25 hover:text-white transition-colors">
                            {r.label}
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => markComplete(i)}
                      className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-5 py-2.5 rounded-full text-xs transition-colors">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {i < STEPS.length - 1 ? "Got it — next step" : "Complete!"}
                    </button>
                    {i > 0 && (
                      <button type="button" onClick={() => goToStep(i - 1)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/40 hover:text-white transition-colors">
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

      {completed.size === STEPS.length && (
        <div className="mt-6 rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-6 text-center">
          <p className="text-2xl mb-2">🎙️</p>
          <h3 className="font-bold text-lg text-white mb-2">You know what it takes.</h3>
          <p className="text-sm text-white/60 mb-4">If you're building your narration career and want to understand how experienced narrators approach author relationships, the Working Together section above covers the full process.</p>
          <a href="#process" className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold px-6 py-3 rounded-full text-sm transition-colors">
            Read the full process
          </a>
        </div>
      )}
    </div>
  );
}
