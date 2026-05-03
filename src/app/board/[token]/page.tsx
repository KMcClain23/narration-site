import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";

// Production stages — Audition is internal-only; authors see from Contracted onward
const STAGES = [
  { id: "contracted", label: "Contracted", color: "bg-blue-500",    dot: "bg-blue-400"    },
  { id: "recording",  label: "Recording",  color: "bg-yellow-500",  dot: "bg-yellow-400"  },
  { id: "editing",    label: "Editing",    color: "bg-orange-500",  dot: "bg-orange-400"  },
  { id: "released",   label: "Released",   color: "bg-emerald-500", dot: "bg-emerald-400" },
];

const CHAPTER_STATUSES: Record<string, { label: string; color: string; dot: string }> = {
  not_started: { label: "Not Started", color: "bg-white/10 text-white/40",          dot: "bg-white/30"    },
  in_progress:  { label: "In Progress", color: "bg-blue-500/20 text-blue-300",      dot: "bg-blue-400"    },
  editing:      { label: "Editing",     color: "bg-yellow-500/20 text-yellow-300",  dot: "bg-yellow-400"  },
  submitted:    { label: "Submitted",   color: "bg-purple-500/20 text-purple-300",  dot: "bg-purple-400"  },
  live:         { label: "Live",        color: "bg-emerald-500/20 text-emerald-300",dot: "bg-emerald-400" },
};

interface Chapter {
  number: number | null;
  title: string;
  wordCount: number;
  status: string;
}

export default async function AuthorBoardView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: card } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, subtitle, author, cover_url, status, deadline, author_notes, links, co_narrator, chapters")
    .eq("author_token", token)
    .single();

  if (!card) notFound();

  // Parse co-narrator (stored as JSON string or plain string)
  let coNarrators: string[] = [];
  if (card.co_narrator) {
    try {
      const p = JSON.parse(card.co_narrator);
      coNarrators = Array.isArray(p) ? p.filter(Boolean) : p ? [String(p)] : [];
    } catch {
      coNarrators = [String(card.co_narrator)];
    }
  }

  // Chapter stats
  const chapters: Chapter[] = Array.isArray(card.chapters) ? card.chapters : [];
  const total       = chapters.length;
  const liveCount   = chapters.filter(c => c.status === "live").length;
  const pct         = total > 0 ? Math.round((liveCount / total) * 100) : 0;
  const totalWords  = chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
  const estHours    = totalWords > 0 ? (totalWords / 9400).toFixed(1) : null;
  const statusCounts = Object.fromEntries(
    Object.keys(CHAPTER_STATUSES).map(id => [id, chapters.filter(c => c.status === id).length])
  );

  // Current stage — treat "audition" as effectively "contracted" for display
  const stageIdx = Math.max(0, STAGES.findIndex(s => s.id === card.status));
  const stage    = STAGES[stageIdx] ?? STAGES[0];

  return (
    <main className="min-h-screen bg-[#06082E] text-white">

      {/* Header */}
      <div className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
            <svg className="h-4 w-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          <div>
            <p className="text-xs text-white/40">Dean Miller Narration</p>
            <p className="text-sm font-semibold text-white">Project Status</p>
          </div>
        </div>
        <Link href="/" className="text-xs text-white/30 hover:text-[#D4AF37] transition-colors">
          dmnarration.com
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-8 sm:py-12 space-y-6">

        {/* ── Hero cover ── */}
        {card.cover_url && (
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.cover_url} alt={card.title} className="w-full block" />
          </div>
        )}

        {/* ── Book info ── */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{card.title}</h1>
          {card.subtitle && <p className="text-base text-white/45 mt-1 leading-snug">{card.subtitle}</p>}
          {card.author && <p className="text-[#D4AF37] font-semibold text-lg mt-2">{card.author}</p>}
          {coNarrators.length > 0 && (
            <p className="text-sm text-white/40 mt-0.5">with {coNarrators.join(", ")}</p>
          )}
          {card.deadline && (
            <p className="text-sm text-white/35 mt-3 flex items-center gap-1.5">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              Delivery target:{" "}
              {new Date(card.deadline + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>

        {/* ── Production stage ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium mb-4">Production stage</p>
          <div className="flex items-start">
            {STAGES.map((s, i) => {
              const isActive = i === stageIdx;
              const isDone   = i < stageIdx;
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center">
                  <div className={`h-2 w-full ${i === 0 ? "rounded-l-full" : i === STAGES.length - 1 ? "rounded-r-full" : ""} transition-all ${isDone ? "bg-emerald-500" : isActive ? s.color : "bg-white/10"}`} />
                  <div className="mt-2 flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full border-2 transition-all ${isActive ? `${s.color} border-white shadow-lg` : isDone ? "bg-emerald-500 border-emerald-300" : "bg-transparent border-white/20"}`} />
                    <span className={`text-[9px] uppercase tracking-wide mt-1 font-medium text-center ${isActive ? "text-white" : isDone ? "text-white/45" : "text-white/20"}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-center">
            <span className={`inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full border border-white/10 ${stage.color}/20 text-white`}>
              <span className={`h-2 w-2 rounded-full ${stage.color}`} />
              Currently: {stage.label}
            </span>
          </div>
        </div>

        {/* ── Note from Dean ── */}
        {card.author_notes && (
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium mb-2">Note from Dean</p>
            <p className="text-sm text-white/80 leading-relaxed">{card.author_notes}</p>
          </div>
        )}

        {/* ── Progress stats ── */}
        {total > 0 && (
          <div className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium mb-4">Chapter progress</p>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-white/40 mb-1.5">
                <span>{liveCount} of {total} chapters live</span>
                <span className="font-bold text-white">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Status breakdown */}
            <div className="space-y-1.5 mb-4">
              {Object.entries(CHAPTER_STATUSES).map(([id, s]) => {
                const count = statusCounts[id] || 0;
                if (!count) return null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
                    <span className="text-xs text-white/50 flex-1">{s.label}</span>
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            {(totalWords > 0 || estHours) && (
              <div className="border-t border-white/6 pt-4 grid grid-cols-2 gap-4 text-center">
                {totalWords > 0 && (
                  <div>
                    <p className="text-lg font-bold text-white">{totalWords.toLocaleString()}</p>
                    <p className="text-[10px] text-white/35 uppercase tracking-wide">words</p>
                  </div>
                )}
                {estHours && (
                  <div>
                    <p className="text-lg font-bold text-[#D4AF37]">~{estHours} hrs</p>
                    <p className="text-[10px] text-white/35 uppercase tracking-wide">est. finished audio</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Chapter list ── */}
        {total > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium mb-3">
              Chapters <span className="text-white/20 font-normal normal-case tracking-normal">({total})</span>
            </p>
            <div className="space-y-1.5">
              {chapters.map((ch, i) => {
                const st = CHAPTER_STATUSES[ch.status] ?? CHAPTER_STATUSES.not_started;
                return (
                  <div key={i} className="rounded-xl border border-white/8 bg-[#0A0D3A] px-4 py-3 flex items-center gap-3">

                    {/* Number badge */}
                    {ch.number != null ? (
                      <div className="h-7 w-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 shrink-0">
                        {ch.number}
                      </div>
                    ) : (
                      <div className="h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/50 shrink-0 px-2">
                        {ch.title.slice(0, 3)}
                      </div>
                    )}

                    {/* Title + word count */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate leading-tight">{ch.title}</p>
                      {ch.wordCount > 0 && (
                        <p className="text-[10px] text-white/30 mt-0.5">{ch.wordCount.toLocaleString()} words</p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-current/20 shrink-0 ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Project links ── */}
        {Array.isArray(card.links) && card.links.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium mb-3">Project links</p>
            <div className="space-y-2">
              {(card.links as { label: string; url: string }[]).map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#E0C15A] transition-colors">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer notice ── */}
        <p className="text-center text-xs text-white/20 pb-4">
          This is your private project link. Please don&apos;t share it publicly.
        </p>

      </div>
    </main>
  );
}
