import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";

const COLUMNS = [
  { id: "audition",   label: "Audition" },
  { id: "contracted", label: "Contracted" },
  { id: "recording",  label: "Recording" },
  { id: "editing",    label: "Editing" },
  { id: "released",   label: "Released" },
];

const COLUMN_COLORS: Record<string, string> = {
  audition:   "bg-purple-500",
  contracted: "bg-blue-500",
  recording:  "bg-yellow-500",
  editing:    "bg-orange-500",
  released:   "bg-emerald-500",
};

export default async function AuthorBoardView({ params }: { params: { token: string } }) {
  const { data: card } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, author, cover_url, status, deadline, author_notes, links")
    .eq("author_token", params.token)
    .single();

  if (!card) notFound();

  const currentIndex = COLUMNS.findIndex(c => c.id === card.status);

  return (
    <main className="min-h-screen bg-[#06082E] text-white">
      {/* Simple header */}
      <div className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
            <svg className="h-4 w-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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

      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
        {/* Book card */}
        <div className="rounded-2xl border border-white/10 bg-[#0A0D3A] overflow-hidden mb-8 shadow-xl">
          {card.cover_url && (
            <div className="h-48 sm:h-64 overflow-hidden">
              <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover object-top" />
            </div>
          )}
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white">{card.title}</h1>
            {card.author && <p className="text-[#D4AF37] font-medium mt-1">{card.author}</p>}
            {card.deadline && (
              <p className="text-sm text-white/40 mt-2 flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Deadline: {new Date(card.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
        </div>

        {/* Progress pipeline */}
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-medium mb-4">Production progress</p>
          <div className="flex items-center gap-0">
            {COLUMNS.map((col, i) => {
              const isActive = i === currentIndex;
              const isDone = i < currentIndex;
              return (
                <div key={col.id} className="flex-1 flex flex-col items-center gap-2">
                  <div className={`relative h-2 w-full ${i === 0 ? "rounded-l-full" : i === COLUMNS.length - 1 ? "rounded-r-full" : ""} ${isDone || isActive ? COLUMN_COLORS[col.id] : "bg-white/10"} transition-all`} />
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full border-2 ${isActive ? `${COLUMN_COLORS[col.id]} border-white shadow-lg` : isDone ? "bg-white/40 border-white/40" : "bg-transparent border-white/20"} transition-all`} />
                    <span className={`text-[9px] uppercase tracking-wide mt-1 font-medium ${isActive ? "text-white" : "text-white/30"}`}>
                      {col.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-center">
            <span className={`inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full ${COLUMN_COLORS[card.status]}/20 text-white border border-white/10`}>
              <span className={`h-2 w-2 rounded-full ${COLUMN_COLORS[card.status]}`} />
              Currently: {COLUMNS.find(c => c.id === card.status)?.label}
            </span>
          </div>
        </div>

        {/* Note from Dean */}
        {card.author_notes && (
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-5 mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] font-medium mb-2">Note from Dean</p>
            <p className="text-sm text-white/80 leading-relaxed">{card.author_notes}</p>
          </div>
        )}

        {/* Links */}
        {card.links?.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-medium mb-3">Project links</p>
            <div className="space-y-2">
              {card.links.map((link: { label: string; url: string }, i: number) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#E0C15A] transition-colors">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-white/20">
          This is your private project link. Please don&apos;t share it publicly.
        </p>
      </div>
    </main>
  );
}
