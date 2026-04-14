import type { Metadata } from "next";
import Link from "next/link";
import WelcomeSectionNav from "../components/WelcomeSectionNav";
import BackToTopButton from "../components/BackToTopButton";

export const metadata: Metadata = {
  title: "Welcome Packet | Dean Miller Narration",
  description:
    "Learn what it is like to work with Dean Miller Narration, from manuscript prep through final audiobook delivery.",
  alternates: {
    canonical: "https://dmnarration.com/welcome",
  },
  openGraph: {
    title: "Welcome Packet | Dean Miller Narration",
    description:
      "A complete guide to Dean Miller's audiobook narration process, expectations, and delivery workflow.",
    url: "https://dmnarration.com/welcome",
    type: "website",
  },
};

const processSteps = [
  { label: "Manuscript & notes received", href: "#manuscript-notes" },
  { label: "Manuscript prep", href: "#manuscript-notes" },
  { label: 'Production sample ("First 15")', href: "#production-sample" },
  { label: "Full narration and recording", href: "#recording-process" },
  { label: "Proofing, editing, mastering", href: "#delivery-review" },
  { label: "Delivery and review", href: "#delivery-review" },
  { label: "Final corrections", href: "#delivery-review" },
  { label: "Payment and release", href: "#payment" },
];

const handledItems = [
  "Full narration performance",
  "Character voice development and consistency",
  "Editing and mastering to platform standards (ACX and others)",
  "Proofing and error correction",
  "Final delivery of retail-ready audio files",
];

const characterNotes = [
  "Age",
  "Background or location",
  "Accent (if applicable)",
  "Personality traits",
  "Any defining vocal qualities",
];

const pronunciationNotes = [
  "Names",
  "Unique terms",
  "Fantasy or invented language",
];

const characterApprovalSteps = [
  "I will compile a character list",
  "Add notes based on your input and my interpretation",
  "Send it to you for confirmation",
];

const first15Focus = [
  "Main character voices",
  "Tone and pacing",
  "Emotional range",
];

const recordingPhaseItems = [
  "I focus on consistent, high-quality recording",
  "Updates are provided at key milestones",
  "I work toward our agreed timeline",
];

const liveStreamingBenefits = [
  "Build audience interest",
  "Create promotional content",
  "Generate early engagement",
];

const technicalIssues = [
  "Audio glitches",
  "Background noise",
  "Editing inconsistencies",
];

const narrationErrors = [
  "Misreads",
  "Mispronunciations",
];

const correctionSteps = [
  "Review all notes",
  "Complete final corrections",
  "Prepare files for submission",
];

const timelineItems = [
  "Timeline is agreed upon before recording begins",
  "I provide updates at key stages",
  "I prioritize quality, consistency, and reliability",
];

const paymentMethods = [
  "Check",
  "Venmo",
  "PayPal",
  "Credit Card",
  "Direct Deposit",
];

const promoSupport = [
  "Short promotional audio clips",
  "Behind-the-scenes content",
  "Social media collaboration",
  "Optional podcast appearances",
];

const helpfulLinks = [
  {
    title: "ACX: Dual and Duet Narration Overview",
    href: "https://www.acx.com/mp/blog/it-takes-two-dual-and-duet-narrations-are-spicing-up-romance",
    description:
      "ACX’s explanation of dual and duet production, including how multi-narrator projects are commonly structured on the platform.",
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

function BulletList({
  items,
}: {
  items: Array<string | { label: string; href: string }>;
}) {
  const hasLinkItems = items.some((item) => typeof item !== "string");

  if (hasLinkItems) {
    return (
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          if (typeof item === "string") {
            return (
              <li key={item}>
                <span className="inline-flex items-center text-white/85">
                  {item}
                </span>
              </li>
            );
          }

          return (
            <li key={`${item.href}-${item.label}`}>
              <a
                href={item.href}
                className={[
                  "inline-flex items-center",
                  "rounded-md border border-white/15",
                  "bg-white/[0.03]",
                  "px-3 py-1.5 text-sm font-medium",
                  "text-white/85",
                  "transition-all duration-200",
                  "hover:border-[#D4AF37]/50",
                  "hover:bg-[#D4AF37]/10",
                  "hover:text-white",
                  "focus-visible:outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
                ].join(" ")}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item as string} className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
          <span>{item as string}</span>
        </li>
      ))}
    </ul>
  );
}

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <section className="bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(122,92,255,0.10),transparent_30%)]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <p className="text-sm uppercase tracking-[0.24em] text-[#D4AF37]">
            Dean Miller Narration
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Welcome Packet
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/75">
            A clear guide to what it is like to work together, what I will need
            from you, and how your audiobook moves from manuscript to finished
            delivery.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="mailto:Dean@DMNarration.com"
              className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#E0C15A]"
            >
              Email Dean
            </a>

            <Link
              href="/#contact"
              className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-[#D4AF37]/60 hover:text-white"
            >
              Contact Page
            </Link>
          </div>

          <div className="mt-10 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Email
              </p>
              <p className="mt-2 text-sm text-white/90">Dean@DMNarration.com</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                TikTok
              </p>
              <p className="mt-2 text-sm text-white/90">@deanmillernarration</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Instagram
              </p>
              <p className="mt-2 text-sm text-white/90">@deanmillernarrator</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Phone / Text
              </p>
              <p className="mt-2 text-sm text-white/90">(503) 862-8856</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-white/50">Time Zone: Pacific Time</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-6">
            <Section id="welcome" title="Welcome">
              <p>
                I’m glad you’re here. This page gives you a clear picture of what
                it is like to work with me and how I approach audiobook production
                from start to finish.
              </p>

              <p>
                You’ll find an overview of my process, what I’ll need from you,
                how reviews and approvals work, and a few helpful resources for
                navigating production decisions.
              </p>

              <p>
                If you have questions at any point, you can always reach out
                directly.
              </p>
            </Section>

            <Section id="process-overview" title="Process Overview">
              <p>
                Every audiobook follows a structured process to ensure quality,
                consistency, and a smooth experience.
              </p>

              <p>Here’s how I run my projects:</p>

              <BulletList items={processSteps} />
            </Section>

            <Section id="what-i-handle" title="What I Handle For You">
              <p>
                My role is to take your story and deliver a finished,
                professional audiobook ready for distribution.
              </p>

              <p>I handle:</p>

              <BulletList items={handledItems} />

              <p>
                My goal is simple. You focus on the story. I handle the
                production.
              </p>
            </Section>

            <Section id="manuscript-notes" title="Manuscript & Notes">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">
                  Manuscript Format
                </h3>

                <p>Please provide the final version of your manuscript in:</p>

                <BulletList items={["PDF (preferred)", "Word document"]} />

                <p>
                  This must be the locked version of the book. Changes after
                  recording begins can create delays and additional work.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-lg font-semibold text-white">
                  Character & Pronunciation Notes
                </h3>

                <p>
                  To deliver the performance you envision, I need upfront clarity
                  on:
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-4">
                    <p className="font-medium text-white">
                      Character notes for main or important characters
                    </p>
                    <div className="mt-3">
                      <BulletList items={characterNotes} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent p-4">
                    <p className="font-medium text-white">Pronunciations</p>
                    <div className="mt-3">
                      <BulletList items={pronunciationNotes} />
                    </div>
                  </div>
                </div>

                <p>
                  If notes are not provided, I will make performance decisions
                  based on the text.
                </p>

                <p>
                  If pronunciations are unclear, I will send you a recorded list
                  for approval before proceeding.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-lg font-semibold text-white">
                  Character Approval Process
                </h3>

                <p>After reviewing the manuscript:</p>

                <BulletList items={characterApprovalSteps} />

                <p>
                  You can adjust or expand anything before recording begins.
                </p>
              </div>
            </Section>

            <Section
              id="production-sample"
              title='Production Sample: "The First 15"'
            >
              <p>Before full production, I record a performance sample.</p>

              <p>
                This is typically 15 minutes or more and is selected to capture:
              </p>

              <BulletList items={first15Focus} />

              <p>This is the stage where we lock in the performance.</p>

              <p>
                You are encouraged to be detailed and specific with feedback here.
                I will make adjustments until everything feels right.
              </p>

              <p>
                Once approved, performance direction is considered final so we can
                maintain consistency across the entire audiobook.
              </p>
            </Section>

            <Section id="recording-process" title="Recording Process">
              <p>Once the sample is approved, I move into full production.</p>

              <p>During this phase:</p>

              <BulletList items={recordingPhaseItems} />

              <p>
                You may not hear from me daily, but progress is always moving
                forward.
              </p>
            </Section>

            <Section id="live-streaming" title="Optional: Live Streaming">
              <p>
                I occasionally stream portions of my recording sessions on TikTok
                or Twitch.
              </p>

              <p>This can:</p>

              <BulletList items={liveStreamingBenefits} />

              <p>
                You will have full control over whether your project is included
                in this.
              </p>
            </Section>

            <Section id="delivery-review" title="Delivery & Review">
              <p>
                Once production is complete, you will receive all audiobook files
                for review.
              </p>

              <p>
                You will need to listen through the full audiobook and note:
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-4">
                  <p className="font-medium text-white">Technical issues</p>
                  <div className="mt-3">
                    <BulletList items={technicalIssues} />
                  </div>
                </div>

                <div className="rounded-xl border border-[#8B5CF6]/20 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent p-4">
                  <p className="font-medium text-white">Narration errors</p>
                  <div className="mt-3">
                    <BulletList items={narrationErrors} />
                  </div>
                </div>
              </div>

              <p>
                At this stage, corrections are focused on accuracy and technical
                quality.
              </p>

              <p>
                Performance direction is finalized during the production sample
                phase.
              </p>

              <div className="space-y-3 pt-2">
                <h3 className="text-lg font-semibold text-white">Corrections</h3>

                <p>
                  You will submit your notes using a shared document or
                  spreadsheet.
                </p>

                <p>I will:</p>

                <BulletList items={correctionSteps} />
              </div>
            </Section>

            <Section id="timeline-communication" title="Timeline & Communication">
              <BulletList items={timelineItems} />

              <p>
                If anything affects timeline or delivery, I will communicate
                immediately.
              </p>
            </Section>

            <Section id="payment" title="Payment">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">ACX Projects</h3>

                <p>
                  All payments and agreements are handled directly through ACX.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-lg font-semibold text-white">
                  PFH Projects (Off Platform or Duet)
                </h3>

                <BulletList
                  items={[
                    "A project estimate is provided based on final word count",
                  ]}
                />

                <p>Payment methods accepted:</p>

                <BulletList items={paymentMethods} />

                <p>
                  For duet projects, one contract is typically managed through
                  ACX, with additional agreements handled separately as needed.
                </p>
              </div>
            </Section>

            <Section id="helpful-links" title="Helpful Links">
              <p>
                If you are considering duet, dual, or multi-narrator production
                on ACX, these are a few useful places to start.
              </p>

              <div className="rounded-xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-5">
                <p className="font-medium text-white">
                  A quick note on duet and dual projects on ACX
                </p>

                <p className="mt-3 text-white/80">
                  ACX currently supports one rights holder and one producer
                  directly on-platform. For duet or dual projects, the most common
                  setup is to contract with one primary narrator or producer
                  through ACX and handle the additional narrator arrangement
                  separately. ACX also offers independent contractor agreements
                  that can help with those off-platform relationships.
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

            <Section id="promotion-support" title="Promotion Support">
              <p>I’m happy to support promotion of your audiobook.</p>

              <p>This can include:</p>

              <BulletList items={promoSupport} />

              <p>
                If you prefer limited or no promotion during production, just let
                me know.
              </p>
            </Section>

            <Section id="about" title="About Your Narrator">
              <p>
                I’m Dean Miller, a professional audiobook narrator focused on
                immersive, character-driven storytelling.
              </p>

              <p>
                My background combines performance, voice work, and years of
                experience communicating emotion through sound. From early work in
                theater and music to professional narration, everything I do is
                centered on one goal:
              </p>

              <p className="text-lg font-medium text-white">
                Making the listener forget there’s a narrator at all.
              </p>

              <p>
                I record from a professional home studio using a Shure MV7+
                microphone and a punch-and-roll workflow for clean, efficient
                production.
              </p>

              <p>
                Every project is approached with intention, precision, and respect
                for the story.
              </p>

              <p className="text-lg font-medium text-white">
                Because at the end of the day, narration isn’t just performance.
                It’s connection.
              </p>
            </Section>

            <Section id="final-note" title="Final Note">
              <p>
                I know this process can feel like a lot, especially if this is
                your first audiobook.
              </p>

              <p className="font-medium text-white">You’re not doing it alone.</p>

              <p>
                I’ll guide you through each step and make sure the process stays
                clear, smooth, and collaborative from start to finish.
              </p>

              <p>I’m looking forward to working with you.</p>

              <p className="pt-2 text-white">Dean Miller</p>
            </Section>
          </div>

          <WelcomeSectionNav />
        </div>
      </div>

      <BackToTopButton />
    </main>
  );
}