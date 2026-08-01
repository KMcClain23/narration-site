"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type ArchivedCard = {
  id: string;
  title: string;
  author: string;
  cover_url: string;
  archived_at: string | null;
  archived_reason: "recasted" | "canceled" | "other" | null;
  archived_notes: string | null;
};

const REASON_LABEL: Record<string, string> = { recasted: "Recasted", canceled: "Canceled", other: "Other" };
const REASON_STYLE: Record<string, string> = {
  recasted: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  canceled: "bg-red-500/15 text-red-300 border-red-500/25",
  other:    "bg-white/8 text-white/50 border-white/15",
};

function firstLine(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes.split("\n")[0].trim();
  if (!line) return null;
  return line.length > 120 ? line.slice(0, 120) + "…" : line;
}

export default function ArchivePage() {
  const [cards, setCards] = useState<ArchivedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/board?archived=1");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load archive.");
      setCards(d.cards || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load archive.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-14 sm:pt-16">
      {/* Sticky header */}
      <div className="sticky top-14 sm:top-16 z-40 bg-[#06082E]/95 backdrop-blur border-b border-white/8 px-5 sm:px-8 py-3 flex items-center gap-3">
        <Link href="/board-v2" className="text-xs text-white/40 hover:text-[#D4AF37] transition-colors shrink-0">← Board</Link>
        <span className="text-white/20">/</span>
        <h1 className="text-sm font-bold text-white">Archive</h1>
        <span className="text-xs text-white/25">{cards.length} project{cards.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
        <p className="text-xs text-white/30 mb-6">
          Projects that are no longer active — recasted, canceled, or otherwise removed from the pipeline.
          Click a project to view details or restore it.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400/60 hover:text-red-300">✕</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <p className="text-white/25 text-sm">No archived projects.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map(card => (
              <Link
                key={card.id}
                href={`/board-v2?editCard=${card.id}`}
                className="flex items-center gap-4 rounded-xl border border-white/8 bg-[#0A0D3A] hover:border-white/20 transition-colors px-4 py-3"
              >
                {/* Cover thumbnail */}
                <div className="h-14 w-10 shrink-0 rounded-md overflow-hidden bg-black/30 border border-white/8">
                  {card.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.cover_url} alt={card.title} className="h-full w-full object-cover" />
                  )}
                </div>

                {/* Title + author */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                  {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                  {firstLine(card.archived_notes) && (
                    <p className="text-xs text-white/30 truncate mt-0.5">{firstLine(card.archived_notes)}</p>
                  )}
                </div>

                {/* Reason pill */}
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${REASON_STYLE[card.archived_reason ?? "other"]}`}>
                  {REASON_LABEL[card.archived_reason ?? "other"]}
                </span>

                {/* Archived date */}
                <span className="shrink-0 text-xs text-white/30 w-24 text-right">
                  {card.archived_at
                    ? new Date(card.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
