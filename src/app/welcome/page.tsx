"use client";

import Link from "next/link";
import { useState } from "react";
import WelcomeSectionNav from "../components/WelcomeSectionNav";
import AuthorGuide from "../components/AuthorGuide";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-5 leading-7 text-white/80">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-xs font-bold text-[#D4AF37]">
      {n}
    </span>
  );
}

function ResourceLink({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#D4AF37]/35 hover:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white transition group-hover:text-[#F1D57A]">{title}</p>
          <p className="mt-2 text-sm leading-6 text-white/70">{description}</p>
        </div>
        <span className="shrink-0 text-[#D4AF37]">↗</span>
      </div>
    </a>
  );
}

export default function WelcomePage() {
  const [platform, setPlatform] = useState<"acx" | "ar">("acx");
  const isACX = platform === "acx";

  const acxSteps = [
    { n: 1, title: "Manuscript & notes", body: "You send the final, locked manuscript (PDF or Word) along with character notes and any pronunciation guide. Changes after recording begins cause delays — the locked version matters." },
    { n: 2, title: "Character voice list", body: "I compile a character list with notes on age, background, accent, personality, and vocal qualities — based on your input and my read of the text. You review and confirm before recording starts." },
    { n: 3, title: 'Production sample — "The First 15"', body: "I record 15+ minutes chosen to showcase main character voices, tone, pacing, and emotional range. This is the stage to be detailed with feedback. Once approved, performance direction is locked for consistency." },
    { n: 4, title: "Full recording", body: "I move into production, providing milestone updates along the way. You may not hear from me daily — that means recording is moving forward." },
    { n: 5, title: "Delivery & review via ACX", body: "Completed audio is uploaded to ACX for your review. You listen through for technical issues and narration errors, then approve or submit revision notes directly through ACX. I complete all corrections promptly." },
    { n: 6, title: "Payment & release", body: "ACX handles payment directly between rights holder and producer based on your agreed terms (per-finished-hour or royalty share). Once approved on ACX, your audiobook goes to retail on Audible and Amazon." },
  ];

  const arSteps = [
    { n: 1, title: "Manuscript & notes", body: "You send the final, locked manuscript (PDF or Word) along with character notes and any pronunciation guide. Since Authors Republic is off-platform, we handle everything directly — a clear, complete manuscript is essential from the start." },
    { n: 2, title: "Character voice list", body: "I compile a character list with notes on age, background, accent, personality, and vocal qualities. You review and confirm before recording starts. This step is identical regardless of platform." },
    { n: 3, title: 'Production sample — "The First 15"', body: "I record 15+ minutes to showcase character voices, tone, and pacing. We review together via email or a call. Once approved, performance direction is locked for the full recording." },
    { n: 4, title: "Direct contract", body: "Since Authors Republic doesn't manage the narrator-author relationship on-platform, we sign a simple off-platform agreement covering deliverables, timeline, payment terms, and usage rights. I can provide a standard template." },
    { n: 5, title: "Full recording & delivery", body: "I record, edit, and master to Authors Republic's technical specifications. Files are delivered to you directly (via Google Drive, Dropbox, or your preferred method) for your review. You upload to Authors Republic yourself." },
    { n: 6, title: "Payment", body: "Payment is handled directly between us — not through the platform. I provide an invoice based on final word count (per-finished-hour rate). Payment via Check, Venmo, PayPal, Credit Card, or Direct Deposit. No royalty share option on AR." },
  ];

  const acxLinks = [
    { title: "ACX: Dual and Duet Narration Overview", href: "https://www.acx.com/mp/blog/it-takes-two-dual-and-duet-narrations-are-spicing-up-romance", description: "ACX's explanation of dual and duet production, including how multi-narrator projects are commonly structured on the platform." },
    { title: "ACX: Independent Contractor Agreements", href: "https://www.acx.com/mp/blog/the-four-agreements", description: "Helpful when additional narrators, editors, or engineers need separate off-platform agreements." },
    { title: "ACX: How It Works for Authors", href: "https://www.acx.com/help/authors-as-narrators/200626860", description: "Overview of ACX workflow, approvals, and the production process from the rights holder side." },
    { title: "ACX: How It Works for Narrators & Studios", href: "https://www.acx.com/mp/how-it-works/narrators-and-studios", description: "Helpful for understanding producer responsibilities and what retail-ready delivery includes." },
  ];

  const arLinks = [
    { title: "Author's Republic: How It Works", href: "https://www.authorsrepublic.com/how-it-works", description: "Overview of the full platform — how to produce your audiobook, submit for distribution, and sell to 50+ retail, library, and streaming channels worldwide." },
    { title: "Author's Republic: Create an Audiobook — The AR Studio", href: "https://www.authorsrepublic.com/learn/blog/69/create-an-audiobook-the-authors-republic-stud", description: "How the narrator marketplace works on Authors Republic — audition process, per-finished-hour rates, file approval, and delivery to the platform." },
    { title: "Author's Republic: Distribution Partners", href: "https://www.authorsrepublic.com/our-partners", description: "The complete list of 50+ retail, library, and streaming partners AR distributes to — including Audible, Apple Books, Spotify, Google Play, Hoopla, Scribd, Chirp, and more." },
    { title: "Author's Republic: FAQ", href: "https://www.authorsrepublic.com/learn/faqs", description: "Answers to common questions about production, distribution, payments, audio requirements, exclusivity, and working with narrators through the platform." },
  ];

  const activeSteps = isACX ? acxSteps : arSteps;
  const activeLinks = isACX ? acxLinks : arLinks;

  return (
    <main className="min-h-screen bg-[#06082E] text-white">

      {/* Hero */}
      <section className="bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.15),transparent_35%)]">
        <div className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:px-6 sm:pt-12 sm:pb-20">
          <p className="text-xs uppercase tracking-[0.24em] text-[#D4AF37]">Dean Miller Narration</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Working together</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">
            What to expect, what you need to provide, and how your manuscript becomes a finished audiobook — step by step.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="mailto:Dean@DMNarration.com"
              className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E0C15A]">
              Email Dean
            </a>
            <Link href="/#contact"
              className="inline-flex items-center justify-center rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-[#D4AF37]/60 hover:text-white">
              Contact & booking
            </Link>
          </div>

          {/* Quick-reference strip */}
          <div className="mt-10 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:grid-cols-4 text-sm">
            {[
              { label: "Email", value: "Dean@DMNarration.com" },
              { label: "Response time", value: "24–48 hours" },
              { label: "Time zone", value: "Pacific Time" },
              { label: "Platform", value: isACX ? "ACX / Audible" : "Authors Republic" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">{item.label}</p>
                <p className="mt-2 text-white/90">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Platform toggle */}
          <div className="mt-6 flex items-center gap-3">
            <span className="text-sm text-white/50">Platform:</span>
            <div className="flex rounded-full border border-white/15 overflow-hidden text-sm font-bold">
              <button type="button" onClick={() => setPlatform("acx")}
                className={`px-5 py-2 transition-colors ${isACX ? "bg-[#D4AF37] text-black" : "text-white/50 hover:text-white"}`}>
                ACX / Audible
              </button>
              <button type="button" onClick={() => setPlatform("ar")}
                className={`px-5 py-2 transition-colors ${!isACX ? "bg-[#D4AF37] text-black" : "text-white/50 hover:text-white"}`}>
                Authors Republic
              </button>
            </div>
          </div>

          {/* Platform context note */}
          {isACX ? (
            <div className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-5 py-4 text-sm text-white/75 leading-relaxed">
              <span className="text-[#D4AF37] font-semibold">ACX (Audiobook Creation Exchange)</span> is Amazon&apos;s audiobook production platform, connecting authors with narrators and distributing finished titles to Audible, Amazon, and iTunes. It supports both per-finished-hour and royalty share payment structures, and manages the full production workflow — auditions, file review, and approval — on-platform. Finished audiobooks distributed through ACX are exclusive to Audible and Amazon by default, though a non-exclusive option is available at a lower royalty rate.
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-5 py-4 text-sm text-white/75 leading-relaxed">
              <span className="text-[#D4AF37] font-semibold">Authors Republic</span> distributes to 40+ platforms including Apple Books, Spotify, Scribd, and Hoopla. It is non-exclusive — you keep full control and can distribute elsewhere simultaneously. Production is handled directly between us, off-platform.
            </div>
          )}
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_270px]">
          <div className="grid gap-6">

            {/* What I handle */}
            <Section id="what-i-handle" title="What I handle for you">
              <p>You focus on the story. I take care of the production end to end:</p>
              <BulletList items={[
                "Full narration performance",
                "Character voice development and consistency",
                `Editing and mastering to ${isACX ? "ACX" : "Authors Republic"} technical standards`,
                "Proofing and error correction",
                `Final delivery of retail-ready audio files${isACX ? "" : " — direct to you"}`,
              ]} />
              {!isACX && (
                <p className="text-sm text-white/65 italic">
                  For Authors Republic projects, files are delivered directly to you for upload. I do not upload on your behalf since you hold the account.
                </p>
              )}
            </Section>

            {/* Process */}
            <Section id="process" title="The process, start to finish">
              <p>Every project follows the same structure so you always know where things stand.</p>
              <div className="space-y-5 pt-1">
                {activeSteps.map((step) => (
                  <div key={step.n} className="flex gap-4">
                    <StepBadge n={step.n} />
                    <div>
                      <p className="font-semibold text-white">{step.title}</p>
                      <p className="mt-1 text-sm text-white/75 leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* What to prepare */}
            <Section id="manuscript-notes" title="What to prepare">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-5">
                  <p className="font-semibold text-white">Character notes</p>
                  <p className="mt-1 text-sm text-white/65">For main and important characters:</p>
                  <BulletList items={["Age", "Background or location", "Accent (if applicable)", "Personality traits", "Any defining vocal qualities"]} />
                </div>
                <div className="rounded-xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent p-5">
                  <p className="font-semibold text-white">Pronunciation guide</p>
                  <p className="mt-1 text-sm text-white/65">Cover anything non-obvious:</p>
                  <BulletList items={["Character and place names", "Unique or invented terms", "Fantasy or constructed language"]} />
                  <p className="mt-3 text-sm text-white/65">
                    If notes are not provided, I make performance decisions from the text — and send a recorded pronunciation list for approval if anything is unclear.
                  </p>
                </div>
              </div>
              {!isACX && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-semibold text-white">Metadata for Authors Republic</p>
                  <p className="mt-2 text-sm text-white/70 leading-relaxed">
                    Authors Republic requires full metadata at submission: title, subtitle, author name, series info, categories, keywords, and a book description. Having this ready before delivery speeds up the upload process on your end.
                  </p>
                </div>
              )}
            </Section>

            {/* Timeline */}
            <Section id="timeline-communication" title="Timeline & communication">
              <BulletList items={[
                "Timeline is agreed upon before recording begins",
                "I provide milestone updates throughout production",
                "If anything affects the timeline, I communicate immediately",
                "I prioritize quality, consistency, and reliability",
                ...(!isACX ? ["Direct file delivery means no platform upload queue — faster access to your finished files"] : []),
              ]} />
            </Section>

            {/* Live streaming */}
            <Section id="live-streaming" title="Optional: live streaming">
              <p>
                I occasionally stream recording sessions on TikTok or Twitch. This can build audience interest, create promotional content, and generate early engagement around your release.
              </p>
              <p>You have full control over whether your project is included. Just let me know your preference.</p>
            </Section>

            {/* Promotion */}
            <Section id="promotion-support" title="Promotion support">
              <p>
                I am happy to support the release of your audiobook with short promotional clips, behind-the-scenes content, social media collaboration, or optional podcast appearances.
              </p>
              {!isACX && (
                <p>
                  Authors Republic distributes to Spotify, Apple Books, Scribd, Hoopla, and more — your audiobook reaches listeners across many platforms. I can help promote across all of them, not just Audible.
                </p>
              )}
              <p>If you prefer limited or no promotion during production, that is completely fine — just say so upfront.</p>
            </Section>

            {/* Platform-specific section */}
            <Section id="helpful-links" title={isACX ? "Duet & dual narration on ACX" : "Working with Authors Republic"}>
              <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-5">
                <p className="font-semibold text-white">
                  {isACX ? "A note on multi-narrator projects" : "Why Authors Republic?"}
                </p>
                <p className="mt-3 text-sm text-white/80">
                  {isACX
                    ? "ACX currently supports one rights holder and one producer directly on-platform. For duet or dual projects, the standard setup is to contract with one primary narrator through ACX and handle the additional narrator arrangement separately. ACX independent contractor agreements can help with those off-platform relationships."
                    : "Authors Republic is ideal if you want your audiobook on Spotify, Apple Books, Scribd, Hoopla, and more without exclusivity. You keep 70% of net sales and can distribute to other platforms simultaneously. There is no exclusivity requirement, making it a strong choice alongside or instead of Audible."
                  }
                </p>
              </div>

              {!isACX && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-semibold text-white">Royalties & pricing</p>
                  <p className="mt-3 text-sm text-white/80 leading-relaxed">
                    Authors Republic pays 70% of net sales monthly with no minimum threshold. There are no upfront distribution fees and you set your own retail price. Since there is no royalty-share option (unlike ACX), production costs are paid directly — we agree on a per-finished-hour rate before work begins.
                  </p>
                </div>
              )}

              <div className="grid gap-4 pt-2">
                {activeLinks.map((link) => (
                  <ResourceLink key={link.href} {...link} />
                ))}
              </div>
            </Section>

            {/* Ready to start */}
            <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-white">Ready to get started?</h2>
              <p className="mt-3 text-white/75 leading-relaxed">
                {isACX
                  ? "Send an inquiry with your genre, word count, target release date, and whether you are using ACX royalty share or per-finished-hour."
                  : "Send an inquiry with your genre, word count, target release date, and whether you plan to distribute exclusively through Authors Republic or go wide across platforms."
                }
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="mailto:Dean@DMNarration.com"
                  className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E0C15A]">
                  Email Dean
                </a>
                <Link href="/#contact"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-[#D4AF37]/60 hover:text-white">
                  Use the contact form
                </Link>
              </div>
            </div>

            {/* Author guide */}
            <div id="author-guide" className="scroll-mt-24">
              <div className="mb-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/40 mb-1">Free resource</p>
                <h2 className="text-2xl font-bold text-white">What comes next?</h2>
                <p className="mt-1 text-sm text-white/55">A step-by-step walkthrough for authors — from final edits to launch day.</p>
              </div>
              <AuthorGuide />
            </div>

          </div>
          <WelcomeSectionNav />
        </div>
      </div>
    </main>
  );
}
