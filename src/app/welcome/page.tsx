import type { Metadata } from "next";
import Link from "next/link";
import WelcomeSectionNav from "../components/WelcomeSectionNav";

export const metadata: Metadata = {
  title: "Working Together | Dean Miller Narration",
  description:
    "Everything you need to know about working with Dean Miller: manuscript prep, character approvals, the First 15 review, delivery, and payment — from inquiry to ACX-ready master.",
  alternates: {
    canonical: "https://www.dmnarration.com/welcome",
  },
  openGraph: {
    title: "Working Together | Dean Miller Narration",
    description:
      "A clear guide to Dean Miller's audiobook narration process — from manuscript handoff through final delivery.",
    url: "https://www.dmnarration.com/welcome",
    type: "website",
  },
};

const helpfulLinks = [
  {
    title: "ACX: Dual and Duet Narration Overview",
    href: "https://www.acx.com/mp/blog/it-takes-two-dual-and-duet-narrations-are-spicing-up-romance",
    description:
      "ACX's explanation of dual and duet production, including how multi-narrator projects are commonly structured on the platform.",
  },
  {
    title: "ACX: Independent Contractor Agreements",
    href: "https://www.acx.com/mp/blog/the-four-agreements",
    description:
      "Helpful when additional narrators, editors, or engineers need separate off-platform agreements.",
  },
  {
    title: "ACX: How It Works for Authors",
    href: "https://www.acx.com/help/authors-as-narrators/200626860",
    description:
      "Overview of ACX workflow, approvals, and the production process from the rights holder side.",
  },
  {
    title: "ACX: How It Works for Narrators & Studios",
    href: "https://www.acx.com/mp/how-it-works/narrators-and-studios",
    description:
      "Helpful for understanding producer responsibilities and what retail-ready delivery includes.",
  },
];

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:p-8"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {title}
      </h2>
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

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-[#050814] text-white">

      {/* Hero */}
      <section className="bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.15),transparent_35%)]">
        <div className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:px-6 sm:pt-12 sm:pb-20">
          <p className="text-xs uppercase tracking-[0.24em] text-[#D4AF37]">
            Dean Miller Narration
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Working together
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/70">
            What to expect, what you'll need to provide, and how your manuscript
            becomes a finished audiobook — step by step.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="mailto:Dean@DMNarration.com"
              className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E0C15A]"
            >
              Email Dean
            </a>
            <Link
              href="/#contact"
              className="inline-flex items-center justify-center rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-[#D4AF37]/60 hover:text-white"
            >
              Contact & booking
            </Link>
          </div>

          {/* Quick-reference strip */}
          <div className="mt-10 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:grid-cols-4 text-sm">
            {[
              { label: "Email", value: "Dean@DMNarration.com" },
              { label: "Response time", value: "24–48 hours" },
              { label: "Time zone", value: "Pacific Time" },
              { label: "Platform", value: "ACX · Off-platform" },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                  {item.label}
                </p>
                <p className="mt-2 text-white/90">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_270px]">
          <div className="grid gap-6">

            {/* What I handle */}
            <Section id="what-i-handle" title="What I handle for you">
              <p>
                You focus on the story. I take care of the production end to end:
              </p>
              <BulletList
                items={[
                  "Full narration performance",
                  "Character voice development and consistency",
                  "Editing and mastering to ACX and platform standards",
                  "Proofing and error correction",
                  "Final delivery of retail-ready audio files",
                ]}
              />
            </Section>

            {/* Process */}
            <Section id="process" title="The process, start to finish">
              <p>
                Every project follows the same structure so you always know where
                things stand.
              </p>

              <div className="space-y-5 pt-1">
                {[
                  {
                    n: 1,
                    title: "Manuscript & notes",
                    body: "You send the final, locked manuscript (PDF or Word) along with character notes and any pronunciation guide. Changes after recording begins cause delays — the locked version matters.",
                  },
                  {
                    n: 2,
                    title: "Character voice list",
                    body: "I compile a character list with notes on age, background, accent, personality, and vocal qualities — based on your input and my read of the text. You review and confirm before recording starts.",
                  },
                  {
                    n: 3,
                    title: 'Production sample — "The First 15"',
                    body: "I record 15+ minutes chosen to showcase main character voices, tone, pacing, and emotional range. This is the stage to be detailed with feedback. Once approved, performance direction is locked for consistency across the full book.",
                  },
                  {
                    n: 4,
                    title: "Full recording",
                    body: "I move into production, providing milestone updates along the way. You may not hear from me daily — that means recording is moving forward.",
                  },
                  {
                    n: 5,
                    title: "Delivery & review",
                    body: "You receive all files and listen through for technical issues (glitches, noise, editing inconsistencies) and narration errors (misreads, mispronunciations). Submit notes via a shared document. I complete all corrections and prepare final files.",
                  },
                  {
                    n: 6,
                    title: "Payment & release",
                    body: "ACX projects: handled through ACX. Off-platform or duet: I provide a project estimate based on final word count. Payment via Check, Venmo, PayPal, Credit Card, or Direct Deposit.",
                  },
                ].map((step) => (
                  <div key={step.n} className="flex gap-4">
                    <StepBadge n={step.n} />
                    <div>
                      <p className="font-semibold text-white">{step.title}</p>
                      <p className="mt-1 text-sm text-white/75 leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* What you need to provide */}
            <Section id="manuscript-notes" title="What to prepare">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-5">
                  <p className="font-semibold text-white">Character notes</p>
                  <p className="mt-1 text-sm text-white/65">
                    For main and important characters:
                  </p>
                  <BulletList
                    items={[
                      "Age",
                      "Background or location",
                      "Accent (if applicable)",
                      "Personality traits",
                      "Any defining vocal qualities",
                    ]}
                  />
                </div>
                <div className="rounded-xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent p-5">
                  <p className="font-semibold text-white">Pronunciation guide</p>
                  <p className="mt-1 text-sm text-white/65">Cover anything non-obvious:</p>
                  <BulletList
                    items={[
                      "Character and place names",
                      "Unique or invented terms",
                      "Fantasy or constructed language",
                    ]}
                  />
                  <p className="mt-3 text-sm text-white/65">
                    If notes aren't provided, I make performance decisions from
                    the text — and send a recorded pronunciation list for
                    approval if anything is unclear.
                  </p>
                </div>
              </div>
            </Section>

            {/* Timeline */}
            <Section id="timeline-communication" title="Timeline & communication">
              <BulletList
                items={[
                  "Timeline is agreed upon before recording begins",
                  "I provide milestone updates throughout production",
                  "If anything affects the timeline, I communicate immediately",
                  "I prioritize quality, consistency, and reliability",
                ]}
              />
            </Section>

            {/* Live streaming — optional */}
            <Section id="live-streaming" title="Optional: live streaming">
              <p>
                I occasionally stream recording sessions on TikTok or Twitch.
                This can build audience interest, create promotional content, and
                generate early engagement around your release.
              </p>
              <p>
                You have full control over whether your project is included. Just
                let me know your preference.
              </p>
            </Section>

            {/* Promotion */}
            <Section id="promotion-support" title="Promotion support">
              <p>
                I'm happy to support the release of your audiobook with short
                promotional clips, behind-the-scenes content, social media
                collaboration, or optional podcast appearances.
              </p>
              <p>
                If you prefer limited or no promotion during production, that's
                completely fine — just say so upfront.
              </p>
            </Section>

            {/* Duet / helpful links */}
            <Section id="helpful-links" title="Duet & dual narration on ACX">
              <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-5">
                <p className="font-semibold text-white">
                  A note on multi-narrator projects
                </p>
                <p className="mt-3 text-sm text-white/80">
                  ACX currently supports one rights holder and one producer
                  directly on-platform. For duet or dual projects, the standard
                  setup is to contract with one primary narrator through ACX and
                  handle the additional narrator arrangement separately. ACX
                  independent contractor agreements can help with those
                  off-platform relationships.
                </p>
              </div>

              <div className="grid gap-4 pt-2">
                {helpfulLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#D4AF37]/35 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white transition group-hover:text-[#F1D57A]">
                          {link.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-white/70">
                          {link.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-[#D4AF37]">↗</span>
                    </div>
                  </a>
                ))}
              </div>
            </Section>

            {/* Ready to start */}
            <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-white">
                Ready to get started?
              </h2>
              <p className="mt-3 text-white/75 leading-relaxed">
                Send an inquiry with your genre, word count, and target release
                date and I'll get back to you within 24–48 hours.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="mailto:Dean@DMNarration.com"
                  className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E0C15A]"
                >
                  Email Dean
                </a>
                <Link
                  href="/#contact"
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-[#D4AF37]/60 hover:text-white"
                >
                  Use the contact form
                </Link>
              </div>
            </div>

          </div>
          <WelcomeSectionNav />
        </div>
      </div>
    </main>
  );
}
