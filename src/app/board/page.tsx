"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { EmailScanSection } from "./EmailScanSection";

const COLUMNS = [
  { id: "audition",   label: "Audition",   color: "border-purple-500/40 bg-purple-900/35",  dot: "bg-purple-300",  text: "text-purple-200" },
  { id: "contracted", label: "Contracted", color: "border-blue-500/40 bg-blue-900/35",      dot: "bg-blue-300",    text: "text-blue-200" },
  { id: "recording",  label: "Recording",  color: "border-yellow-500/40 bg-yellow-900/25",  dot: "bg-yellow-300",  text: "text-yellow-200" },
  { id: "editing",    label: "Editing",    color: "border-orange-500/40 bg-orange-900/25",  dot: "bg-orange-300",  text: "text-orange-200" },
  { id: "released",   label: "Released",   color: "border-emerald-500/40 bg-emerald-900/35",dot: "bg-emerald-300", text: "text-emerald-200" },
];

interface Link { label: string; url: string; }
interface BoardCard {
  id: string; title: string; author: string; cover_url: string;
  status: string; deadline?: string; notes: string; author_notes: string;
  links: Link[]; co_narrator: string; author_token: string; sort_order: number;
  subtitle: string; tags: string[]; description: string; audible_link: string; ar_link: string; spotify_link: string;
  chapters: { status: string }[];
  word_count: number;
  first15_due: string;
  pfh_rate: number;
  payment_type: string; // pfh | rs | rs_plus
  first_15_complete: boolean;
  updated_at?: string;
  author_email?: string;
  dean_message?: string;
  slug?: string;
  email_updates_enabled?: boolean;
}

const EMPTY: Omit<BoardCard, "id"|"author_token"|"sort_order"> = {
  title:"", author:"", cover_url:"", status:"contracted", deadline:"",
  notes:"", author_notes:"", links:[], co_narrator:"",
  subtitle:"", tags:[], description:"", audible_link:"", ar_link:"", spotify_link:"", chapters:[], word_count:0, first15_due:"", pfh_rate:0, payment_type:"pfh", first_15_complete:false, slug:"",
};

// ─── Timeline view ────────────────────────────────────────────────────────────

const STATUS_BAR: Record<string, { bg: string; border: string; text: string }> = {
  audition:   { bg: "bg-purple-500", border: "border-purple-400/60",  text: "text-white" },
  contracted: { bg: "bg-blue-500",   border: "border-blue-400/60",    text: "text-white" },
  recording:  { bg: "bg-yellow-500", border: "border-yellow-400/60",  text: "text-white" },
  editing:    { bg: "bg-orange-500", border: "border-orange-400/60",  text: "text-white" },
  released:   { bg: "bg-emerald-500",border: "border-emerald-400/60", text: "text-white" },
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ─── Dashboard view ───────────────────────────────────────────────────────────

const IP_STYLE: Record<string, { bg: string; dot: string; label: string }> = {
  contracted: { bg: "bg-blue-500",   dot: "bg-blue-400",   label: "Contracted" },
  recording:  { bg: "bg-yellow-500", dot: "bg-yellow-400", label: "Recording"  },
  editing:    { bg: "bg-orange-500", dot: "bg-orange-400", label: "Editing"    },
};

type DescResult = { id: string; title: string; desc: string | null; error?: boolean };
type DescBulkState = {
  phase: "idle" | "fetching" | "review" | "saving" | "done";
  results: DescResult[];
};

function DashboardView({ cards, onSwitchToBoard }: { cards: BoardCard[]; onSwitchToBoard: () => void }) {
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [descBulk, setDescBulk] = useState<DescBulkState>({ phase: "idle", results: [] });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("dashCollapsed") ?? "{}"); } catch { return {}; }
  });

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("dashCollapsed", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const cardsNeedingDesc = cards.filter(c => !c.description?.trim() && c.status !== "released");
  const cardsNeedingEnrich = cards.filter(c => c.status !== "released" && (!c.description?.trim() || !c.tags?.length));
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  const enrichAll = async () => {
    if (!cardsNeedingEnrich.length || enriching) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: cardsNeedingEnrich.length });
    for (const card of cardsNeedingEnrich) {
      await fetch("/api/enrich-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, title: card.title, author: card.author }),
      }).catch(() => {});
      setEnrichProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setEnriching(false);
  };

  const fetchAllDescriptions = async () => {
    if (!cardsNeedingDesc.length) return;
    setDescBulk({ phase: "fetching", results: [] });
    const results: DescResult[] = [];
    for (const card of cardsNeedingDesc) {
      try {
        const res = await fetch(
          `/api/fetch-description?title=${encodeURIComponent(card.title)}&author=${encodeURIComponent(card.author || "")}`
        );
        const d = await res.json();
        results.push({ id: card.id, title: card.title, desc: d.description ?? null });
      } catch {
        results.push({ id: card.id, title: card.title, desc: null, error: true });
      }
      setDescBulk({ phase: "fetching", results: [...results] });
    }
    setDescBulk({ phase: "review", results });
  };

  const saveAllDescriptions = async () => {
    const toSave = descBulk.results.filter(r => r.desc);
    if (!toSave.length) { setDescBulk({ phase: "idle", results: [] }); return; }
    setDescBulk(p => ({ ...p, phase: "saving" }));
    for (const item of toSave) {
      await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, description: item.desc }),
      });
    }
    setDescBulk({ phase: "done", results: descBulk.results });
    setTimeout(() => setDescBulk({ phase: "idle", results: [] }), 3000);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setSearchFocused(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const in7Days   = useMemo(() => new Date(today.getTime() + 7  * 86400000), [today]);
  const in30Days  = useMemo(() => new Date(today.getTime() + 30 * 86400000), [today]);
  const ago30Days = useMemo(() => new Date(today.getTime() - 30 * 86400000), [today]);

  const activeCards = useMemo(() => cards.filter(c => c.status !== "audition"), [cards]);

  const relDays = (dateStr: string): string => {
    const diff = Math.round((parseDate(dateStr).getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "today";
    return diff > 0 ? `in ${diff} day${diff === 1 ? "" : "s"}` : `overdue ${-diff} day${-diff === 1 ? "" : "s"}`;
  };

  const fmtWords = (n: number): string =>
    n >= 1000 ? `${Math.round(n / 1000)}k words` : `${n} words`;

  const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const dueThisWeek = useMemo(() =>
    activeCards
      .filter(c => {
        if (c.status === "released") return false;
        return [c.deadline, c.first15_due].filter(Boolean).some(d => {
          const dt = parseDate(d!);
          return dt >= today && dt <= in7Days;
        });
      })
      .sort((a, b) => {
        const earliest = (c: BoardCard) => Math.min(
          ...[c.deadline, c.first15_due].filter(Boolean).map(d => parseDate(d!).getTime())
        );
        return earliest(a) - earliest(b);
      }),
    [activeCards, today, in7Days]
  );

  const overdueFirst15 = useMemo(() =>
    activeCards
      .filter(c => c.first15_due && !c.first_15_complete && c.status !== "released" && parseDate(c.first15_due) < today)
      .sort((a, b) => parseDate(a.first15_due).getTime() - parseDate(b.first15_due).getTime()),
    [activeCards, today]
  );

  const recentlyCompleted = useMemo(() =>
    cards
      .filter(c => c.status === "released" && c.updated_at && new Date(c.updated_at) >= ago30Days)
      .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime()),
    [cards, ago30Days]
  );

  const upcomingDeadlines = useMemo(() =>
    activeCards
      .filter(c => c.status !== "released" && c.deadline && (() => { const dt = parseDate(c.deadline!); return dt >= today && dt <= in30Days; })())
      .sort((a, b) => parseDate(a.deadline!).getTime() - parseDate(b.deadline!).getTime()),
    [activeCards, today, in30Days]
  );

  const inProgress = useMemo(() => {
    const counts = Object.fromEntries(
      (["contracted", "recording", "editing"] as const).map(s => [s, activeCards.filter(c => c.status === s).length])
    );
    return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }, [activeCards]);

  const statusSections = useMemo(() =>
    (["contracted", "recording", "editing"] as const)
      .map(s => ({
        status: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
        col: COLUMNS.find(c => c.id === s)!,
        cards: activeCards.filter(c => c.status === s).sort((a, b) => a.sort_order - b.sort_order),
      }))
      .filter(sec => sec.cards.length > 0),
    [activeCards]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return cards.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.author?.toLowerCase().includes(q)) ||
      (c.co_narrator?.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [search, cards]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-8">

      {/* ── Global search ── */}
      <div ref={searchRef} className="relative">
        <div className="flex items-center gap-3 bg-[#0A0D3A] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#D4AF37]/40 transition-colors">
          <svg className="h-4 w-4 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)}
            placeholder="Search by title, author, or co-narrator…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none"/>
          {search && (
            <button onClick={() => setSearch("")} className="text-white/25 hover:text-white/60 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        {searchFocused && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#0D1050] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            {searchResults.map(card => (
              <Link key={card.id} href={`/board/card/${card.id}`}
                onClick={() => { setSearchFocused(false); setSearch(""); }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                {card.cover_url
                  ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                  : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                  {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                </div>
                <span className={`text-[10px] font-bold uppercase shrink-0 ${COLUMNS.find(c => c.id === card.status)?.text ?? "text-white/30"}`}>{card.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Due this week ── */}
      {dueThisWeek.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mb-3">Due This Week</h2>
          <div className="space-y-2">
            {dueThisWeek.map(card => {
              const soonest = [
                card.deadline    ? { label: "Deadline", date: parseDate(card.deadline) }    : null,
                card.first15_due ? { label: "First 15", date: parseDate(card.first15_due) } : null,
              ]
                .filter((x): x is { label: string; date: Date } => x !== null && x.date >= today && x.date <= in7Days)
                .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
              const daysLeft = soonest ? Math.ceil((soonest.date.getTime() - today.getTime()) / 86400000) : 1;
              const isToday  = daysLeft === 0;
              return (
                <Link key={card.id} href={`/board/card/${card.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0A0D3A] px-4 py-3 hover:border-[#D4AF37]/30 hover:bg-[#D4AF37]/5 transition-all">
                  {card.cover_url
                    ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                    : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                    {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                    {soonest && <p className="text-[10px] text-white/35 mt-0.5">{soonest.label}: {soonest.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${isToday ? "bg-red-500/20 text-red-300" : daysLeft === 1 ? "bg-orange-500/20 text-orange-300" : "bg-[#D4AF37]/15 text-[#D4AF37]"}`}>
                    {isToday ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Overdue First 15 ── */}
      {overdueFirst15.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400/80 mb-3 flex items-center gap-2">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            Overdue First 15
          </h2>
          <div className="space-y-2">
            {overdueFirst15.map(card => {
              const date = parseDate(card.first15_due);
              const daysOver = Math.floor((today.getTime() - date.getTime()) / 86400000);
              return (
                <Link key={card.id} href={`/board/card/${card.id}`}
                  className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 hover:border-red-500/40 transition-all">
                  {card.cover_url
                    ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                    : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                    {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                    <p className="text-[10px] text-red-400/60 mt-0.5">First 15 was due {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <span className="text-xs font-bold text-red-300 bg-red-500/15 px-2.5 py-1 rounded-full shrink-0">{daysOver}d overdue</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Status sections: Contracted / Recording / Editing ── */}
      {statusSections.map(({ status, label, col, cards: secCards }) => (
        <section key={status}>
          <button type="button" onClick={() => toggleCollapse(status)}
            className="w-full flex items-center gap-2 mb-3 group">
            <div className={`h-2 w-2 rounded-full ${col.dot} shrink-0`}/>
            <h2 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${col.text}`}>{label}</h2>
            <span className="text-[10px] text-white/30 ml-1">({secCards.length})</span>
            <svg className={`h-3 w-3 text-white/30 ml-auto transition-transform ${collapsed[status] ? "-rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {!collapsed[status] && (
            <div className="space-y-2">
              {secCards.map(card => {
                const isOverdue = card.deadline && parseDate(card.deadline) < today;
                return (
                  <Link key={card.id} href={`/board/card/${card.id}`}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:border-[#D4AF37]/30 hover:bg-[#D4AF37]/5 ${
                      status === "contracted" ? "border-blue-500/20 bg-blue-500/5" :
                      status === "recording"  ? "border-yellow-500/20 bg-yellow-500/5" :
                                               "border-orange-500/20 bg-orange-500/5"
                    }`}>
                    {card.cover_url
                      ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                      : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                      {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                      <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                        {card.deadline && (
                          <p className={`text-[10px] ${isOverdue ? "text-red-400/80" : "text-white/35"}`}>{relDays(card.deadline)}</p>
                        )}
                        {card.word_count > 0 && (
                          <p className="text-[10px] text-white/25">{fmtWords(card.word_count)}</p>
                        )}
                      </div>
                    </div>
                    {card.first15_due && (
                      <div className="shrink-0" title={card.first_15_complete ? "First 15 complete" : "First 15 pending"}>
                        {card.first_15_complete
                          ? <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          : <div className="h-2 w-2 rounded-full bg-white/20"/>
                        }
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {/* ── Lower three-col grid ── */}
      <div className="grid sm:grid-cols-3 gap-6">

        {/* In Progress summary */}
        <section className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">In Progress</h2>
          {inProgress.total === 0 ? (
            <p className="text-sm text-white/25">No active projects</p>
          ) : (
            <div className="space-y-3">
              {(["contracted", "recording", "editing"] as const).map(s => {
                const count = (inProgress.counts as Record<string, number>)[s];
                if (!count) return null;
                const st = IP_STYLE[s];
                return (
                  <button key={s} type="button" onClick={onSwitchToBoard}
                    className="w-full text-left hover:opacity-80 transition-opacity">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${st.dot}`}/>
                        <span className="text-xs text-white/60">{st.label}</span>
                      </div>
                      <span className="text-xs font-bold text-white">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full rounded-full ${st.bg}/60`} style={{ width: `${(count / inProgress.total) * 100}%` }}/>
                    </div>
                  </button>
                );
              })}
              <p className="text-[10px] text-white/25 pt-1">{inProgress.total} total active</p>
            </div>
          )}
        </section>

        {/* Recently Completed */}
        <section className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Recently Completed</h2>
          {recentlyCompleted.length === 0 ? (
            <p className="text-sm text-white/25">None in the last 30 days</p>
          ) : (
            <div className="space-y-2">
              {recentlyCompleted.slice(0, 5).map(card => (
                <Link key={card.id} href={`/board/card/${card.id}`}
                  className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  {card.cover_url
                    ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                    : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-300/80 truncate">{card.title}</p>
                    {card.author && <p className="text-[10px] text-white/30 truncate">{card.author}</p>}
                    {card.updated_at && <p className="text-[10px] text-white/25">{fmtDate(card.updated_at)}</p>}
                  </div>
                  <svg className="h-3.5 w-3.5 text-emerald-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Deadlines */}
        <section className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Upcoming Deadlines</h2>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-white/25">None in the next 30 days</p>
          ) : (
            <div className="space-y-2">
              {upcomingDeadlines.slice(0, 5).map(card => {
                const diff = Math.round((parseDate(card.deadline!).getTime() - today.getTime()) / 86400000);
                return (
                  <Link key={card.id} href={`/board/card/${card.id}`}
                    className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    {card.cover_url
                      ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                      : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{card.title}</p>
                      {card.author && <p className="text-[10px] text-white/30 truncate">{card.author}</p>}
                    </div>
                    <span className={`text-[10px] font-bold shrink-0 whitespace-nowrap ${diff <= 7 ? "text-orange-300" : "text-[#D4AF37]/70"}`}>
                      {diff === 0 ? "today" : `${diff}d`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Fetch missing descriptions ── */}
      {(cardsNeedingDesc.length > 0 || descBulk.phase !== "idle") && (
        <section className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
                Missing Descriptions
              </h2>
              {descBulk.phase === "idle" && (
                <span className="text-[10px] text-white/30 border border-white/10 px-1.5 py-0.5 rounded-full">
                  {cardsNeedingDesc.length} book{cardsNeedingDesc.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {descBulk.phase === "idle" && (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={fetchAllDescriptions}
                  disabled={descBulk.phase !== "idle"}
                  className="text-xs font-semibold text-white/70 border border-white/15 hover:border-white/35 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Fetch all descriptions
                </button>
                {cardsNeedingEnrich.length > 0 && (
                  <button
                    type="button"
                    onClick={enrichAll}
                    disabled={enriching}
                    className="text-xs font-semibold text-[#D4AF37]/70 border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 hover:text-[#D4AF37] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {enriching
                      ? `Enriching ${enrichProgress.done}/${enrichProgress.total}…`
                      : `Enrich metadata (${cardsNeedingEnrich.length})`}
                  </button>
                )}
              </div>
            )}
            {descBulk.phase === "done" && (
              <span className="text-xs text-emerald-400 font-semibold">✓ All saved</span>
            )}
          </div>

          {/* Fetching progress */}
          {descBulk.phase === "fetching" && (
            <div className="space-y-1.5">
              <p className="text-xs text-white/35 animate-pulse">
                Fetching {descBulk.results.length} / {cardsNeedingDesc.length}…
              </p>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#D4AF37] transition-all duration-300"
                  style={{ width: `${Math.round((descBulk.results.length / cardsNeedingDesc.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Review results */}
          {(descBulk.phase === "review" || descBulk.phase === "saving") && (
            <div className="space-y-3">
              <div className="text-xs text-white/40">
                Found descriptions for{" "}
                <span className="text-white font-semibold">
                  {descBulk.results.filter(r => r.desc).length}
                </span>{" "}
                of {descBulk.results.length} books
                {descBulk.results.some(r => !r.desc) && (
                  <> · <span className="text-white/30">{descBulk.results.filter(r => !r.desc).length} not found</span></>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {descBulk.results.map(r => (
                  <div key={r.id}
                    className={`rounded-xl px-3 py-2.5 border text-xs ${r.desc ? "border-white/8 bg-white/[0.03]" : "border-white/5 opacity-50"}`}>
                    <p className="font-semibold text-white/70 truncate mb-0.5">{r.title}</p>
                    {r.desc
                      ? <p className="text-white/40 leading-relaxed line-clamp-2">{r.desc}</p>
                      : <p className="text-white/25 italic">{r.error ? "Fetch error" : "No description found"}</p>
                    }
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveAllDescriptions}
                  disabled={descBulk.phase === "saving" || !descBulk.results.some(r => r.desc)}
                  className="text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {descBulk.phase === "saving"
                    ? "Saving…"
                    : `Save ${descBulk.results.filter(r => r.desc).length} description${descBulk.results.filter(r => r.desc).length !== 1 ? "s" : ""}`
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setDescBulk({ phase: "idle", results: [] })}
                  disabled={descBulk.phase === "saving"}
                  className="text-xs text-white/35 hover:text-white/60 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Email scan */}
      <EmailScanSection />

      {/* Empty state */}
      {dueThisWeek.length === 0 && overdueFirst15.length === 0 && inProgress.total === 0 && (
        <div className="py-20 text-center">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-white/25 text-sm">Nothing urgent — you&apos;re all caught up.</p>
        </div>
      )}
    </div>
  );
}

const LABEL_W = 240;
const ROW_H   = 52;
const BAR_INSET = 7; // px top/bottom inside the 52px row

function TimelineView({
  cards,
  onStatusChange,
  onCardUpdate,
}: {
  cards: BoardCard[];
  onStatusChange: (id: string, status: string) => void;
  onCardUpdate: (id: string, updates: { deadline?: string; first15_due?: string }) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [noDatesOpen, setNoDatesOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inlineDates, setInlineDates] = useState({ deadline: "", first15_due: "" });
  const [savingInline, setSavingInline] = useState(false);
  const [tooltipState, setTooltipState] = useState<{ card: BoardCard; x: number; y: number } | null>(null);

  const openInline = (card: BoardCard) => {
    setInlineDates({ deadline: card.deadline ?? "", first15_due: card.first15_due ?? "" });
    setEditingId(card.id);
  };

  const cancelInline = () => setEditingId(null);

  const saveInline = async () => {
    if (!editingId) return;
    setSavingInline(true);
    const updates: { deadline?: string; first15_due?: string } = {};
    if (inlineDates.deadline)    updates.deadline    = inlineDates.deadline;
    if (inlineDates.first15_due) updates.first15_due = inlineDates.first15_due;
    await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...updates }),
    });
    onCardUpdate(editingId, updates);
    setEditingId(null);
    setSavingInline(false);
  };

  // ── Card partitions ─────────────────────────────────────────────────────────
  const barCards = useMemo(() =>
    cards
      .filter(c => c.status !== "released" && (c.first15_due || c.deadline))
      .sort((a, b) => (a.deadline || a.first15_due || "").localeCompare(b.deadline || b.first15_due || "")),
    [cards]);

  const noDates = useMemo(() =>
    cards.filter(c => c.status !== "released" && !c.first15_due && !c.deadline),
    [cards]);

  const completed = useMemo(() =>
    cards
      .filter(c => c.status === "released")
      .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "")),
    [cards]);

  // ── Window — fixed 3-month view centered on today, navigable with offset ───
  const baseNumMonths = 3;

  const windowStart = useMemo(() => {
    const now = new Date();
    // Start one month before today so today sits in the middle of the 3-month view
    return new Date(now.getFullYear(), now.getMonth() - 1 + offset, 1);
  }, [offset]);

  const months = useMemo(() =>
    Array.from({ length: baseNumMonths }, (_, i) =>
      new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1)
    ), [windowStart, baseNumMonths]);

  const totalCols = baseNumMonths * 2;

  // ── Position helpers ────────────────────────────────────────────────────────
  const dateToPos = useCallback((dateStr: string): number => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthOffset = (y - windowStart.getFullYear()) * 12 + (m - 1 - windowStart.getMonth());
    const colInMonth = d <= 15
      ? (d - 1) / 15
      : 1 + (d - 16) / Math.max(1, daysInMonth - 15);
    return monthOffset * 2 + colInMonth;
  }, [windowStart]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayPos = dateToPos(todayStr);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">

      {/* Navigation */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => setOffset(o => o - 1)}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span className="text-sm text-white/50 font-medium text-center" style={{ minWidth: "13rem" }}>
          {months[0].toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          {" — "}
          {months[months.length - 1].toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button onClick={() => setOffset(o => o + 1)}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
        </button>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)}
            className="text-xs text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1 rounded-full hover:bg-[#D4AF37]/10 transition-colors ml-1">
            Today
          </button>
        )}
      </div>

      {/* ── Timeline grid ── */}
      {barCards.length === 0 ? (
        <div className="py-16 text-center text-white/20 text-sm">No active projects with scheduled dates</div>
      ) : (
        <div>
          <div className="pt-16 pb-40" style={{ minWidth: `${LABEL_W + 560}px` }}>

            {/* Month header */}
            <div className="flex">
              <div className="shrink-0" style={{ width: LABEL_W }} />
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
                {months.map((m, i) => (
                  <div key={i} className="col-span-2 text-center text-[10px] font-bold uppercase tracking-widest text-white/40 py-1 border-l border-white/8">
                    {m.toLocaleDateString("en-US", { month: "short" })}{" "}
                    <span className="text-white/20">{m.getFullYear()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Half-month sub-header */}
            <div className="flex mb-1">
              <div className="shrink-0 text-left pl-4 text-[10px] text-white/20 flex items-end pb-1" style={{ width: LABEL_W }}>
                Project
              </div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
                {months.map((m, i) => {
                  const endDay = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
                  return (
                    <div key={i} className="col-span-2 contents">
                      <div className="text-center text-[9px] text-white/20 border-l border-white/8 py-0.5">1–15</div>
                      <div className="text-center text-[9px] text-white/20 border-l border-white/[0.04] py-0.5">16–{endDay}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows — wrapped in a relative div for the single spanning today line */}
            <div className="relative">

              {/* Today line — one element spanning the full grid height */}
              {todayPos >= 0 && todayPos <= totalCols && (
                <div
                  className="absolute top-0 bottom-0 z-30 pointer-events-none bg-red-400 opacity-80"
                  style={{
                    left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${todayPos / totalCols})`,
                    width: 2,
                  }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-400 whitespace-nowrap">Today</span>
                </div>
              )}

              {barCards.map((card, rowIdx) => {
                const s = card.first15_due ? dateToPos(card.first15_due) : null;
                const e = card.deadline    ? dateToPos(card.deadline)    : null;
                const rawStart = s ?? (e !== null ? e - 0.25 : null);
                const rawEnd   = e ?? (s !== null ? s + 0.25 : null);
                if (rawStart === null || rawEnd === null) return null;
                if (rawEnd <= 0 || rawStart >= totalCols) return null;

                const cStart   = Math.max(0, rawStart);
                const cEnd     = Math.min(totalCols, rawEnd);
                if (cEnd <= cStart) return null;

                const leftPct  = cStart / totalCols * 100;
                const widthPct = (cEnd - cStart) / totalCols * 100;
                const bar      = STATUS_BAR[card.status] ?? STATUS_BAR.contracted;

                return (
                  <div
                    key={card.id}
                    className={`flex items-center group/row mb-px ${rowIdx % 2 === 1 ? "bg-white/[0.025]" : ""} ${tooltipState?.card.id === card.id ? "relative z-[100]" : ""}`}
                    style={{ height: ROW_H }}
                  >
                    {/* Label */}
                    <div className="shrink-0 pl-4 pr-3" style={{ width: LABEL_W }}>
                      <p className="text-sm font-semibold text-white truncate leading-tight">{card.title}</p>
                      {card.author && <p className="text-xs text-white/40 truncate leading-tight">{card.author}</p>}
                    </div>

                    {/* Grid area */}
                    <div className="flex-1 relative h-full">
                      {/* Column lines — no per-row today highlight (single line above) */}
                      <div className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>
                        {Array.from({ length: totalCols }).map((_, ci) => (
                          <div key={ci} className={`h-full ${ci % 2 === 0 ? "border-l border-white/8" : "border-l border-white/[0.04]"}`} />
                        ))}
                      </div>

                      {/* Bar — 80px minimum width, 6px border-radius */}
                      <div
                        className={`absolute z-10 flex items-center overflow-visible hover:brightness-125 transition-all group/bar border ${bar.bg} ${bar.border}`}
                        style={{
                          top: BAR_INSET,
                          bottom: BAR_INSET,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          minWidth: "80px",
                          borderRadius: "6px",
                        }}
                        onMouseEnter={e => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setTooltipState({ card, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
                        }}
                        onMouseLeave={() => setTooltipState(null)}
                      >
                        <Link
                          href={`/board/card/${card.id}`}
                          className={`flex-1 min-w-0 flex items-center justify-center h-full px-2 ${bar.text}`}
                        >
                          <span className="text-[10px] font-semibold truncate text-center leading-tight">{card.title}</span>
                        </Link>

                        {/* Complete button — revealed on hover */}
                        <button
                          type="button"
                          title="Mark as released"
                          onClick={ev => { ev.stopPropagation(); onStatusChange(card.id, "released"); }}
                          className="shrink-0 mr-1.5 h-5 w-5 rounded-full flex items-center justify-center opacity-0 group-hover/bar:opacity-100 bg-white/20 hover:bg-emerald-500/90 transition-all"
                        >
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        </button>
                      </div>

                      {/* first15_due diamond marker */}
                      {s !== null && s >= 0 && s <= totalCols && (
                        <div
                          className="absolute z-20 pointer-events-none bg-white/90 border border-white/40"
                          style={{
                            width: 8, height: 8,
                            left: `calc(${s / totalCols * 100}% - 4px)`,
                            top: "calc(50% - 4px)",
                            transform: "rotate(45deg)",
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-4">
        {(["contracted","recording","editing"] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-5 border ${STATUS_BAR[s].bg} ${STATUS_BAR[s].border}`} style={{ borderRadius: 3 }} />
            <span className="text-[10px] text-white/30 capitalize">{s}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 bg-white/80 border border-white/40" style={{ transform: "rotate(45deg)", borderRadius: 1 }} />
          <span className="text-[10px] text-white/30">First 15 due</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-0.5 bg-red-500/70" />
          <span className="text-[10px] text-white/30">Today</span>
        </div>
      </div>

      {/* ── No dates section ── */}
      {noDates.length > 0 && (
        <div className="mt-8 border-t border-white/6 pt-6">
          <button type="button" onClick={() => setNoDatesOpen(v => !v)}
            className="flex items-center gap-2 w-full text-left mb-3 group/nd-toggle">
            <svg className={`h-3 w-3 text-white/25 transition-transform ${noDatesOpen ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium group-hover/nd-toggle:text-white/45 transition-colors">
              No dates set ({noDates.length})
            </span>
          </button>
          {noDatesOpen && <div className="space-y-1">
            {noDates.map(card => (
              editingId === card.id ? (
                /* ── Inline date picker ── */
                <div key={card.id} className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 p-3 my-1">
                  {/* Card identity + close */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {card.cover_url
                      ? <img src={card.cover_url} alt={card.title} className="h-9 w-6 object-cover rounded shrink-0"/>
                      : <div className="h-9 w-6 bg-white/5 rounded shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white/80 truncate leading-tight">{card.title}</p>
                      {card.author && <p className="text-[10px] text-white/40 truncate">{card.author}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={cancelInline}
                      className="text-white/30 hover:text-white/60 transition-colors p-1"
                      aria-label="Cancel"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  {/* Date fields */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 block mb-1">
                        Deadline
                      </label>
                      <input
                        type="date"
                        value={inlineDates.deadline}
                        onChange={e => setInlineDates(p => ({ ...p, deadline: e.target.value }))}
                        className="w-full bg-[#06082E] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35 block mb-1">
                        First 15 Due
                      </label>
                      <input
                        type="date"
                        value={inlineDates.first15_due}
                        onChange={e => setInlineDates(p => ({ ...p, first15_due: e.target.value }))}
                        className="w-full bg-[#06082E] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveInline}
                      disabled={savingInline || (!inlineDates.deadline && !inlineDates.first15_due)}
                      className="text-xs font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {savingInline ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelInline}
                      className="text-xs text-white/40 hover:text-white/70 px-4 py-1.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal row ── */
                <div key={card.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group/nd">
                  {card.cover_url
                    ? <img src={card.cover_url} alt={card.title} className="h-8 w-6 object-cover rounded shrink-0 opacity-60"/>
                    : <div className="h-8 w-6 bg-white/5 rounded shrink-0"/>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white/50 truncate leading-tight">{card.title}</p>
                      <button
                        type="button"
                        onClick={() => openInline(card)}
                        className="text-[10px] text-white/20 hover:text-[#D4AF37] transition-colors shrink-0 opacity-0 group-hover/nd:opacity-100 whitespace-nowrap"
                      >
                        Add deadline →
                      </button>
                    </div>
                    {card.author && <p className="text-[10px] text-white/25 truncate leading-tight">{card.author}</p>}
                  </div>
                </div>
              )
            ))}
          </div>}
        </div>
      )}

      {/* ── Completed section (collapsible grid) ── */}
      {completed.length > 0 && (
        <div className="mt-6 border-t border-white/6 pt-6">
          <button type="button" onClick={() => setCompletedOpen(v => !v)}
            className="flex items-center gap-2 w-full text-left mb-4 group/toggle">
            <svg className={`h-3.5 w-3.5 text-white/30 transition-transform ${completedOpen ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/30 font-medium group-hover/toggle:text-white/50 transition-colors">
              Completed ({completed.length})
            </span>
          </button>

          {completedOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {completed.map(card => (
                <Link
                  key={card.id}
                  href={`/board/card/${card.id}`}
                  className="rounded-xl border border-white/8 bg-[#0A0D3A] overflow-hidden hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors"
                >
                  {card.cover_url
                    ? <img src={card.cover_url} alt={card.title} className="w-full aspect-[2/3] object-cover"/>
                    : <div className="w-full aspect-[2/3] bg-white/5 flex items-center justify-center">
                        <svg className="h-6 w-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </div>
                  }
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-emerald-300/80 truncate leading-tight">{card.title}</p>
                    {card.author && <p className="text-[10px] text-white/35 truncate mt-0.5">{card.author}</p>}
                    {card.deadline && (
                      <p className="text-[9px] text-white/20 mt-1">
                        {new Date(card.deadline + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Portal tooltip — escapes all overflow constraints */}
      {tooltipState && typeof document !== "undefined" && ReactDOM.createPortal(
        (() => {
          const { card: tc, x, y } = tooltipState;
          const daysLeft = tc.deadline
            ? Math.round((new Date(tc.deadline + "T12:00:00").getTime() - Date.now()) / 86400000)
            : null;
          return (
            <div
              className="z-[9999] fixed bg-[#0D1050] border border-white/15 rounded-xl px-3 py-2.5 shadow-2xl pointer-events-none min-w-[160px] max-w-[220px]"
              style={{ top: y, left: x, transform: "translateX(-50%)" }}
            >
              <p className="text-xs font-bold text-white truncate">{tc.title}</p>
              {tc.author && <p className="text-[10px] text-[#D4AF37]/80 mt-0.5 truncate">{tc.author}</p>}
              {tc.deadline && (
                <p className="text-[10px] text-white/50 mt-1">
                  Due {new Date(tc.deadline + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
              {tc.word_count > 0 && (
                <p className="text-[10px] text-white/40">{tc.word_count.toLocaleString()} words</p>
              )}
              {daysLeft !== null && (
                <p className={`text-[10px] font-semibold mt-1 ${daysLeft < 0 ? "text-red-400" : daysLeft <= 14 ? "text-orange-300" : "text-emerald-400"}`}>
                  {daysLeft === 0 ? "Due today" : daysLeft > 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`}
                </p>
              )}
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

export default function BoardPage() {
  const [view, setView] = useState<"board"|"timeline"|"dashboard">("dashboard");
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCard, setEditCard] = useState<BoardCard|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({...EMPTY});
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState<string|null>(null);
  const [copied, setCopied] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [linkLabel, setLinkLabel] = useState(""); const [linkUrl, setLinkUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [syncing, setSyncing] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{id:string;title:string}|null>(null);
  const [coNarratorNames, setCoNarratorNames] = useState<string[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importBooks, setImportBooks] = useState<{id:string;title:string;author:string;cover_url:string;link:string;ar_link?:string;subtitle?:string;tags?:string[];description?:string;co_narrator?:string[];category:string}[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importingId, setImportingId] = useState<string|null>(null);
  const [inlineEdit, setInlineEdit] = useState<{cardId:string;field:"deadline"|"first15_due"|"co_narrator"|"payment";strVal:string;numVal?:number}|null>(null);
  const inlineRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cnr, ar] = await Promise.all([fetch("/api/board"), fetch("/api/co-narrators"), fetch("/api/authors")]);
      const d = await r.json();
      const authorsData = await ar.json();
      const emailByName = new Map<string, string>(
        (authorsData.authors || [])
          .filter((a: { name: string; email?: string }) => a.email)
          .map((a: { name: string; email: string }) => [a.name.trim().toLowerCase(), a.email])
      );
      setCards((d.cards || []).map((c: BoardCard) => ({
        ...c,
        author_email: c.author_email || (c.author ? emailByName.get(c.author.trim().toLowerCase()) || "" : ""),
      })));
      const cn = await cnr.json(); setCoNarratorNames((cn.co_narrators||[]).map((n:{name:string})=>n.name).sort());
    } catch { setError("Failed to load."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const saved = localStorage.getItem("boardView");
    if (saved === "board" || saved === "timeline" || saved === "dashboard") setView(saved);
  }, []);
  useEffect(() => {
    if (!inlineEdit) return;
    const onMouse = (e: MouseEvent) => { if (inlineRef.current && !inlineRef.current.contains(e.target as Node)) setInlineEdit(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setInlineEdit(null); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onMouse); document.removeEventListener("keydown", onKey); };
  }, [inlineEdit]);
  useEffect(() => {
    fetch("/api/board-messages?summary=true")
      .then(r => r.json())
      .then(d => { if (d.counts) setUnreadCounts(d.counts); })
      .catch(() => {});
  }, []);

  const switchView = (v: "board"|"timeline"|"dashboard") => {
    setView(v);
    localStorage.setItem("boardView", v);
  };

  const getEarliestDate = (card: BoardCard) => {
    // Once First 15 is done its due date no longer drives sort priority
    const dates = [card.first_15_complete ? null : card.first15_due, card.deadline]
      .filter(Boolean).map(d => {
        const [y,m,dy] = d!.split("-"); return new Date(+y,+m-1,+dy).getTime();
      });
    return dates.length ? Math.min(...dates) : Infinity;
  };

  const sortCards = (a: BoardCard, b: BoardCard) => {
    const diff = getEarliestDate(a) - getEarliestDate(b);
    return diff !== 0 ? diff : a.sort_order - b.sort_order;
  };

  const col = (id: string) => cards.filter(c=>c.status===id).sort(sortCards);

  const drop = async (e: React.DragEvent, status: string) => {
    e.preventDefault(); setDragOver(null);
    if (!dragId) return;
    const card = cards.find(c=>c.id===dragId);
    if (!card || card.status===status) return;
    setCards(p=>p.map(c=>c.id===dragId?{...c,status}:c));
    await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:dragId,status})});
    setDragId(null);
    // If moved to released, sync to public books table
    if (status==="released") await syncToBooks({...card,status});
  };

  const syncToBooks = async (card: BoardCard) => {
    setSyncing(card.id);
    try {
      await fetch("/api/books",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:card.title, subtitle:card.subtitle||"", author:card.author,
        link:card.audible_link||"", ar_link:card.ar_link||"", cover_url:card.cover_url,
        tags:card.tags||[], description:card.description||"",
        category:"completed", co_narrator:card.co_narrator?[card.co_narrator]:[], sort_order:0,
      })});
    } catch { setError("Sync to public books failed."); }
    setSyncing(null);
  };

  const cleanForm = (f: typeof form) => ({
    ...f,
    // Only save deadline/first15 if all parts are present
    deadline: f.deadline && f.deadline.split("-").filter(Boolean).length === 3 && !f.deadline.startsWith("-") ? f.deadline : "",
    first15_due: f.first15_due && f.first15_due.split("-").filter(Boolean).length === 3 && !f.first15_due.startsWith("-") ? f.first15_due : "",
  });

  const save = async () => {
    setSaving(true);
    try {
      if (editCard) {
        const r = await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editCard.id,...cleanForm(form)})});
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Failed to save changes."); setSaving(false); return; }
        const updatedCard = d.card || {...editCard, ...cleanForm(form)};
        setCards(p=>p.map(c=>c.id===editCard.id ? updatedCard : c));
        setEditCard(null);
      } else {
        const r = await fetch("/api/board",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...cleanForm(form),sort_order:col(form.status).length})});
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Failed to create project."); setSaving(false); return; }
        if (d.card) {
          setCards(p=>[...p,d.card]);
          // Fire-and-forget enrichment for new cards missing description/tags
          if (!d.card.description || !d.card.tags?.length) {
            fetch("/api/enrich-book", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: d.card.id, title: d.card.title, author: d.card.author }),
            }).catch(() => {});
          }
        }
        setShowForm(false);
      }
      setForm({...EMPTY}); setTagInput("");
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed — check connection."); }
    setSaving(false);
  };

  const del = (id: string, title = "this project") => {
    setDeleteConfirm({ id, title });
  };

  const confirmDel = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    await fetch("/api/board",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    setCards(p=>p.filter(c=>c.id!==id));
  };

  const handleDragStart = (e: React.DragEvent, card: BoardCard) => {
    setDragId(card.id);
    const ghost = document.createElement("div");
    ghost.style.cssText = "width:120px;border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.5);position:fixed;top:-1000px;";
    if (card.cover_url) {
      const img = document.createElement("img");
      img.src = card.cover_url;
      img.style.cssText = "width:100%;display:block;";
      ghost.appendChild(img);
    }
    const label = document.createElement("div");
    label.textContent = card.title;
    label.style.cssText = "background:#0A0D3A;color:white;font-size:10px;font-weight:bold;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    ghost.appendChild(label);
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 60, 20);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const saveInline = async () => {
    if (!inlineEdit) return;
    const { cardId, field, strVal, numVal } = inlineEdit;
    const update: Record<string, unknown> = {};
    if (field === "deadline") update.deadline = strVal || null;
    else if (field === "first15_due") update.first15_due = strVal || null;
    else if (field === "co_narrator") update.co_narrator = strVal;
    else if (field === "payment") { update.payment_type = strVal; update.pfh_rate = numVal ?? 0; }
    setCards(p => p.map(c => c.id === cardId ? { ...c, ...update } : c));
    setInlineEdit(null);
    await fetch("/api/board", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, ...update }) });
  };

  const startEdit = (card: BoardCard) => {
    setEditCard(card);
    setForm({title:card.title,author:card.author,cover_url:card.cover_url,status:card.status,
      deadline:card.deadline||"",notes:card.notes,author_notes:card.author_notes,
      links:card.links,co_narrator:card.co_narrator,subtitle:card.subtitle||"",
      tags:card.tags||[],description:card.description||"",
      audible_link:card.audible_link||"",ar_link:card.ar_link||"",spotify_link:card.spotify_link||"",chapters:card.chapters||[],
      word_count:card.word_count||0,first15_due:card.first15_due||"",pfh_rate:card.pfh_rate||0,payment_type:card.payment_type||"pfh",first_15_complete:card.first_15_complete||false,slug:card.slug||""});
    setShowForm(false);
  };

  const loadImportBooks = async () => {
    setImportLoading(true);
    try {
      const r = await fetch("/api/books");
      const d = await r.json();
      // Filter out books already on the board
      const boardTitles = new Set(cards.map(c => c.title.toLowerCase()));
      setImportBooks((d.books || []).filter((b:{title:string}) => !boardTitles.has(b.title.toLowerCase())));
    } catch { setError("Failed to load books."); }
    setImportLoading(false);
  };

  const importBook = async (book: typeof importBooks[0]) => {
    setImportingId(book.id);
    const statusMap: Record<string,string> = { "coming-soon": "contracted", "in-progress": "recording", "completed": "released" };
    try {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: book.title,
          subtitle: book.subtitle || "",
          author: book.author,
          cover_url: book.cover_url || "",
          audible_link: book.link || "",
          ar_link: book.ar_link || "",
          tags: book.tags || [],
          description: book.description || "",
          co_narrator: Array.isArray(book.co_narrator) ? (book.co_narrator[0] || "") : "",
          status: statusMap[book.category] || "contracted",
          sort_order: col(statusMap[book.category] || "contracted").length,
        }),
      });
      const d = await r.json();
      if (d.card) {
        setCards(p => [...p, d.card]);
        setImportBooks(p => p.filter(b => b.id !== book.id));
      }
    } catch { setError("Import failed."); }
    setImportingId(null);
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-cover", { method: "POST", body: fd });
      const data = await res.json();
      if (data.coverUrl) setForm(p => ({ ...p, cover_url: data.coverUrl }));
      else setError(data.error || "Cover upload failed.");
    } catch { setError("Cover upload failed."); }
    setUploadingCover(false);
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/board/${token}`);
    setCopied(token); setTimeout(()=>setCopied(null),2000);
  };

  const addLink = () => { if(linkLabel&&linkUrl){setForm(f=>({...f,links:[...f.links,{label:linkLabel,url:linkUrl}]}));setLinkLabel("");setLinkUrl("");} };
  const removeLink = (i:number) => setForm(f=>({...f,links:f.links.filter((_,idx)=>idx!==i)}));
  const addTag = () => { const t=tagInput.trim(); if(t&&!form.tags.includes(t)){setForm(f=>({...f,tags:[...f.tags,t]}));setTagInput("");} };
  const removeTag = (t:string) => setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}));

  const F = ({label,k,placeholder,type="text"}:{label:string;k:string;placeholder?:string;type?:string}) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">{label}</span>
      <input type={type} value={(form as unknown as Record<string,string>)[k]}
        onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
    </label>
  );

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-14 sm:pt-16"
      style={{ "--board-max-w": "144rem" } as React.CSSProperties}>
      {/* Sticky header */}
      <div className="sticky top-14 sm:top-16 z-40 bg-[#06082E]/95 backdrop-blur border-b border-white/8 px-5 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/stats" className="text-xs text-white/40 hover:text-[#D4AF37] transition-colors">← Admin</Link>
          <span className="text-white/20">/</span>
          <h1 className="text-sm font-bold text-white">Production Board</h1>
          <span className="text-xs text-white/25">{cards.length} projects</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Dashboard / Board / Timeline tabs */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
            <button
              onClick={() => switchView("dashboard")}
              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-full transition-colors ${view==="dashboard" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
              title="Dashboard"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => switchView("board")}
              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-full transition-colors ${view==="board" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
              title="Board"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
              <span className="hidden sm:inline">Board</span>
            </button>
            <button
              onClick={() => switchView("timeline")}
              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-full transition-colors ${view==="timeline" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
              title="Timeline"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span className="hidden sm:inline">Timeline</span>
            </button>
          </div>

          <button onClick={()=>{setShowForm(true);setEditCard(null);setForm({...EMPTY});setTagInput("");}}
            className="inline-flex items-center gap-1.5 bg-[#D4AF37] text-black text-xs font-bold px-3 sm:px-4 py-2 rounded-full hover:bg-[#E0C15A] transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            <span className="hidden sm:inline">New project</span>
          </button>
        </div>
      </div>

      {/* Import modal */}
      {/* ── Delete confirmation dialog ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4"
          style={{background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)"}}
          onClick={e=>{if(e.target===e.currentTarget) setDeleteConfirm(null);}}>
          <div className="w-full max-w-sm bg-[#0A0D3A] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-white text-base mb-2">Delete project?</h3>
            <p className="text-sm text-white/55 mb-6 leading-relaxed">
              <span className="text-white font-semibold">&ldquo;{deleteConfirm.title}&rdquo;</span>{" "}
              will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-full border border-white/15 text-sm text-white/70 hover:text-white transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmDel}
                className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={e=>{if(e.target===e.currentTarget) setShowImport(false);}}>
          <div className="w-full max-w-lg bg-[#0A0D3A] border border-[#1A2070] rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <div>
                <h2 className="font-bold text-white text-lg">Import from books</h2>
                <p className="text-xs text-white/40 mt-0.5">Add existing books to the production board</p>
              </div>
              <button onClick={()=>setShowImport(false)} className="text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-4">
              {importLoading ? (
                <div className="py-10 flex justify-center"><div className="h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/></div>
              ) : importBooks.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-white/30 text-sm">All books are already on the board.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {importBooks.map(book => (
                    <div key={book.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#06082E] p-3 hover:border-white/15 transition-colors">
                      {book.cover_url && <img src={book.cover_url} alt={book.title} className="h-12 w-8 object-cover rounded shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{book.title}</p>
                        <p className="text-xs text-[#D4AF37]/70">{book.author}</p>
                        <p className="text-[10px] text-white/30 capitalize">{book.category?.replace("-"," ")}</p>
                      </div>
                      <button type="button" onClick={()=>importBook(book)} disabled={importingId===book.id}
                        className="shrink-0 text-xs font-bold bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
                        {importingId===book.id ? "…" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="mx-5 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex justify-between"><span>{error}</span><button onClick={()=>setError(null)} className="text-red-300/50 hover:text-red-300">✕</button></div>}

      {/* Modal */}
      {(showForm||editCard) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={e=>{if(e.target===e.currentTarget){setShowForm(false);setEditCard(null);}}}>
          <div className="w-full max-w-2xl bg-[#0A0D3A] border border-[#1A2070] rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <h2 className="font-bold text-white text-lg">{editCard?"Edit project":"New project"}</h2>
              <button onClick={()=>{setShowForm(false);setEditCard(null);}} className="text-white/40 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Book title *</span><input type="text" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Whiskey &amp; Lies" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Subtitle</span><input type="text" value={form.subtitle} onChange={e=>setForm(p=>({...p,subtitle:e.target.value}))} placeholder="e.g. Sultry Secrets Book 4" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">URL slug</span><input type="text" value={form.slug||""} onChange={e=>setForm(p=>({...p,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-")}))} placeholder="e.g. whiskey-and-lies" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition font-mono"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Author</span><input type="text" value={form.author} onChange={e=>setForm(p=>({...p,author:e.target.value}))} placeholder="e.g. E.A. Harper" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Co-narrator</span>
                  <select value={form.co_narrator} onChange={e=>setForm(p=>({...p,co_narrator:e.target.value}))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    <option value="">— None —</option>
                    {coNarratorNames.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Cover image</span>
                  <div className="mt-1.5 space-y-2">
                    <label className={`flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${uploadingCover ? "border-[#D4AF37]/40 bg-[#D4AF37]/5" : "border-white/15 hover:border-[#D4AF37]/30 hover:bg-white/5"}`}>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { if(e.target.files?.[0]) uploadCover(e.target.files[0]); }} />
                      {uploadingCover ? (
                        <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
                          <div className="h-3.5 w-3.5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"/>
                          Uploading…
                        </div>
                      ) : form.cover_url ? (
                        <div className="flex items-center gap-2">
                          <img src={form.cover_url} alt="Cover" className="h-10 w-7 object-cover rounded"/>
                          <span className="text-xs text-white/50">Click to replace</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-white/35">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          Upload cover image
                        </div>
                      )}
                    </label>
                    <input value={form.cover_url} onChange={e=>setForm(p=>({...p,cover_url:e.target.value}))}
                      placeholder="Or paste image URL..."
                      className="w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white/60 placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </div>
                </label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Audible / Amazon link</span><input type="text" value={form.audible_link} onChange={e=>setForm(p=>({...p,audible_link:e.target.value}))} placeholder="https://..." className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Authors Republic link</span><input type="text" value={form.ar_link} onChange={e=>setForm(p=>({...p,ar_link:e.target.value}))} placeholder="https://..." className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block"><span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Spotify link</span><input type="text" value={form.spotify_link} onChange={e=>setForm(p=>({...p,spotify_link:e.target.value}))} placeholder="https://open.spotify.com/show/..." className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/></label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Stage</span>
                  <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}
                    className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                    {COLUMNS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1.5">Deadline</span>
                  <div className="flex gap-2">
                    <select value={form.deadline ? form.deadline.split("-")[1] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || [new Date().getFullYear().toString(),"","01"]; setForm(f=>({...f,deadline:e.target.value?`${p[0]||new Date().getFullYear()}-${e.target.value}-${p[2]||"01"}`:""}))} }
                      className="flex-1 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Month</option>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>(
                        <option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>
                      ))}
                    </select>
                    <select value={form.deadline ? form.deadline.split("-")[2] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || [new Date().getFullYear().toString(),"01",""]; setForm(f=>({...f,deadline:e.target.value?`${p[0]||new Date().getFullYear()}-${p[1]||"01"}-${e.target.value}`:""}))} }
                      className="w-20 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Day</option>
                      {Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0")).map(d=>(
                        <option key={d} value={d}>{parseInt(d)}</option>
                      ))}
                    </select>
                    <select value={form.deadline ? form.deadline.split("-")[0] : ""}
                      onChange={e => { const p = form.deadline?.split("-") || ["","01","01"]; setForm(f=>({...f,deadline:e.target.value?`${e.target.value}-${p[1]||"01"}-${p[2]||"01"}`:""}))} }
                      className="w-24 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Year</option>
                      {Array.from({length:6},(_,i)=>new Date().getFullYear()+i).map(y=>(
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Production details */}
              <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4 space-y-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 font-medium">Production details <span className="text-white/20 normal-case tracking-normal text-[10px]">— private</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Word count</span>
                    <input type="number" value={form.word_count || ""} onChange={e=>setForm(p=>({...p,word_count:parseInt(e.target.value)||0}))} placeholder="e.g. 90000" className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Payment type</span>
                    <select value={form.payment_type} onChange={e=>setForm(p=>({...p,payment_type:e.target.value}))} className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="pfh">PFH (Per Finished Hour)</option>
                      <option value="rs">Royalty Share (RS)</option>
                      <option value="rs_plus">Royalty Share Plus (RS+)</option>
                    </select>
                  </label>
                </div>
                {(form.payment_type === "pfh" || form.payment_type === "rs_plus") && (
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">{form.payment_type === "rs_plus" ? "RS+ stipend ($ PFH)" : "PFH rate ($)"}</span>
                    <input type="number" value={form.pfh_rate || ""} onChange={e=>setForm(p=>({...p,pfh_rate:parseFloat(e.target.value)||0}))} placeholder={form.payment_type === "rs_plus" ? "e.g. 100" : "e.g. 250"} className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition"/>
                  </label>
                )}
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1.5">First 15 due date</span>
                  <div className="flex gap-2">
                    <select value={form.first15_due ? form.first15_due.split("-")[1] : ""} onChange={e => { const p = form.first15_due?.split("-") || [new Date().getFullYear().toString(),"","01"]; setForm(f=>({...f,first15_due:e.target.value?`${p[0]||new Date().getFullYear()}-${e.target.value}-${p[2]||"01"}`:""}))} } className="flex-1 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Month</option>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=><option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>)}
                    </select>
                    <select value={form.first15_due ? form.first15_due.split("-")[2] : ""} onChange={e => { const p = form.first15_due?.split("-") || [new Date().getFullYear().toString(),"01",""]; setForm(f=>({...f,first15_due:e.target.value?`${p[0]||new Date().getFullYear()}-${p[1]||"01"}-${e.target.value}`:""}))} } className="w-20 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Day</option>
                      {Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0")).map(d=><option key={d} value={d}>{parseInt(d)}</option>)}
                    </select>
                    <select value={form.first15_due ? form.first15_due.split("-")[0] : ""} onChange={e => { const p = form.first15_due?.split("-") || ["","01","01"]; setForm(f=>({...f,first15_due:e.target.value?`${e.target.value}-${p[1]||"01"}-${p[2]||"01"}`:""}))} } className="w-24 rounded-lg bg-black/30 border border-white/8 px-2 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 appearance-none">
                      <option value="">Year</option>
                      {(() => { const base=Array.from({length:6},(_,i)=>new Date().getFullYear()+i); const ex=form.first15_due?parseInt(form.first15_due.split("-")[0]):null; const yrs=ex&&!base.includes(ex)?[ex,...base]:base; return yrs.map(y=><option key={y} value={String(y)}>{y}</option>); })()}
                    </select>
                  </div>
                </div>
                {form.word_count > 0 && (
                  <div className="rounded-lg bg-[#D4AF37]/5 border border-[#D4AF37]/15 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#D4AF37]/60 font-medium mb-1">{form.payment_type==="rs"?"Royalty Share":form.payment_type==="rs_plus"?"RS+ — Estimated upfront":"Estimated earnings"}</p>
                    {form.payment_type==="rs" ? <p className="text-sm text-[#D4AF37]">~{(form.word_count/9400).toFixed(1)} finished hours · earnings depend on sales</p>
                    : form.pfh_rate>0 ? <p className="text-lg font-bold text-[#D4AF37]">${((form.word_count/9400)*form.pfh_rate).toLocaleString("en-US",{maximumFractionDigits:0})} <span className="text-xs font-normal text-white/30">~{(form.word_count/9400).toFixed(1)} hrs × ${form.pfh_rate}/hr{form.payment_type==="rs_plus"?" + royalties":""}</span></p>
                    : <p className="text-sm text-[#D4AF37]/60">Enter rate to estimate</p>}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Book description (public)</span>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
                  placeholder="Shown on Narrated Works page..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              {/* Tags */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">Tags</span>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(t=>(
                    <span key={t} className="inline-flex items-center gap-1 text-xs bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/25 px-2 py-0.5 rounded-full">
                      {t}<button type="button" onClick={()=>removeTag(t)} className="text-[#D4AF37]/50 hover:text-[#D4AF37]">✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag();}}}
                    placeholder="e.g. Dark Romance" className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <button type="button" onClick={addTag} className="bg-white/8 hover:bg-white/15 text-white text-xs px-3 py-2 rounded-lg transition">Add</button>
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Private notes</span>
                <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}
                  placeholder="Internal production notes..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Note to author (on their link)</span>
                <textarea value={form.author_notes} onChange={e=>setForm(p=>({...p,author_notes:e.target.value}))} rows={2}
                  placeholder="Visible to the author on their private link..."
                  className="mt-1.5 w-full rounded-lg bg-black/30 border border-white/8 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 resize-none"/>
              </label>

              {/* Links */}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">Extra links</span>
                {form.links.map((l,i)=>(
                  <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
                    <span className="text-[#D4AF37]/70 flex-1 truncate">{l.label}: {l.url}</span>
                    <button type="button" onClick={()=>removeLink(i)} className="text-red-400/50 hover:text-red-400">✕</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="Label"
                    className="w-28 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://..."
                    className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40"/>
                  <button type="button" onClick={addLink} className="bg-white/8 hover:bg-white/15 text-white text-xs px-3 py-2 rounded-lg transition">Add</button>
                </div>
              </div>

              {/* Author link — only shown when editing existing card */}
              {editCard && (
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium mb-2">Author project link</p>
                  <p className="text-xs text-white/50 mb-3">Share this private link with the author so they can track their project status.</p>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-lg bg-black/30 border border-white/8 px-3 py-2 text-xs text-white/60 font-mono truncate">
                      {typeof window !== "undefined" ? `${window.location.origin}/board/${editCard.author_token}` : `/board/${editCard.author_token}`}
                    </div>
                    <button type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/board/${editCard.author_token}`);
                        setCopied(editCard.author_token);
                        setTimeout(() => setCopied(null), 2000);
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors shrink-0 ${copied === editCard.author_token ? "bg-emerald-500 text-white" : "bg-[#D4AF37] text-black hover:bg-[#E0C15A]"}`}>
                      {copied === editCard.author_token ? "✓ Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}

              {/* Released notice */}
              {form.status==="released" && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-300">
                  ✓ When saved as Released, this project will automatically be added to the public Narrated Works page.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving||!form.title.trim()}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold py-3 rounded-full text-sm transition disabled:opacity-50">
                  {saving?"Saving…":editCard?"Save changes":"Create project"}
                </button>
                <button onClick={()=>{setShowForm(false);setEditCard(null);}}
                  className="border border-white/20 text-white/60 hover:text-white px-6 py-3 rounded-full text-sm transition">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Views */}
      {view === "dashboard" ? (
        <DashboardView cards={cards} onSwitchToBoard={() => { setView("board"); localStorage.setItem("boardView", "board"); }} />
      ) : view === "timeline" ? (
        <>
          {/* Mobile: simple sorted list (Gantt too wide for small screens) */}
          <div className="md:hidden px-4 py-6 space-y-2">
            {cards
              .filter(c => c.status !== "released")
              .sort(sortCards)
              .map(card => {
                const col = COLUMNS.find(c => c.id === card.status);
                return (
                  <Link key={card.id} href={`/board/card/${card.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0A0D3A] px-4 py-3 hover:border-white/20 transition-colors">
                    {card.cover_url
                      ? <img src={card.cover_url} alt={card.title} className="h-12 w-8 object-cover rounded shrink-0"/>
                      : <div className="h-12 w-8 bg-white/5 rounded shrink-0"/>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{card.title}</p>
                      {card.author && <p className="text-xs text-[#D4AF37]/70 truncate">{card.author}</p>}
                      <div className="flex gap-3 mt-0.5 text-[10px] text-white/30">
                        {card.deadline    && <span>Deadline: {card.deadline}</span>}
                        {card.first15_due && <span>First 15: {card.first15_due}</span>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase shrink-0 ${col?.text ?? "text-white/30"}`}>
                      {card.status}
                    </span>
                  </Link>
                );
              })}
            {cards.filter(c => c.status !== "released").length === 0 && (
              <p className="text-sm text-white/25 text-center py-16">No active projects</p>
            )}
          </div>
          {/* Desktop: full Gantt chart */}
          <div className="hidden md:block">
            <TimelineView
              cards={cards}
              onStatusChange={async (id, status) => {
                setCards(p => p.map(c => c.id === id ? { ...c, status } : c));
                await fetch("/api/board", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
              }}
              onCardUpdate={(id, updates) => {
                setCards(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
              }}
            />
          </div>
        </>

      ) : (
      <div className="py-6 w-full">
        {/* ↓ Adjust --board-max-w to change the kanban board width */}
        <div className="mx-auto px-4 w-full" style={{ maxWidth: "var(--board-max-w, 90rem)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 w-full pb-6">
          {COLUMNS.filter(c => c.id !== "audition").map(column => (
            <div key={column.id}
              onDragOver={e=>{e.preventDefault();setDragOver(column.id);}}
              onDrop={e=>drop(e,column.id)}
              onDragLeave={()=>setDragOver(null)}
              className={`w-full min-w-0 rounded-2xl border ${column.color} transition-all duration-200 ${dragOver===column.id?"ring-2 ring-[#D4AF37]/40 scale-[1.01]":""}`}>

              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${column.dot}`}/>
                  <h2 className={`text-xs font-bold uppercase tracking-wider ${column.text}`}>{column.label}</h2>
                </div>
                <span className="text-xs text-white/25 font-mono">{cards.filter(c=>c.status===column.id).length}</span>
              </div>

              <div className="px-3 pb-3 space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {[0,1,2].map(k => (
                      <div key={k} className="animate-pulse rounded-xl border border-white/5 overflow-hidden">
                        <div className="h-28 bg-white/[0.06]" />
                        <div className="p-3 space-y-2">
                          <div className="h-3 w-3/4 rounded bg-white/8" />
                          <div className="h-2.5 w-1/2 rounded bg-white/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) :
                cards.filter(c=>c.status===column.id).sort(sortCards).map(card=>(
                  <div key={card.id} draggable onDragStart={e=>handleDragStart(e,card)}
                    className={`relative rounded-xl bg-[#0E1247] border border-white/12 hover:border-white/20 transition-all cursor-grab active:cursor-grabbing shadow-md group flex flex-row ${dragId===card.id?"opacity-30 scale-95":""} ${syncing===card.id?"opacity-60":""}`}>

                    {/* Cover — left column, fixed width, full card height */}
                    <Link href={`/board/card/${card.id}`} onClick={e=>e.stopPropagation()}
                      className="w-28 shrink-0 relative block rounded-l-xl overflow-hidden">
                      {card.cover_url ? (
                        <>
                          <img src={card.cover_url} alt={card.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"/>
                          {unreadCounts[card.id] > 0 && (
                            <div className="absolute top-1.5 left-1.5 bg-[#D4AF37] text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow z-10">
                              {unreadCounts[card.id]}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-[#080A2C] border-r border-white/5 flex items-center justify-center">
                          <svg className="h-5 w-5 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </div>
                      )}
                    </Link>

                    {/* Details column */}
                    <div className="flex-1 flex flex-col min-w-0 p-3 gap-1">
                      <Link href={`/board/card/${card.id}`} onClick={e=>e.stopPropagation()}>
                        <p className="text-sm font-bold text-white leading-snug hover:text-[#D4AF37]/90 transition-colors truncate">{card.title}</p>
                      </Link>
                      {card.author && <p className="text-xs text-[#D4AF37] font-medium truncate">{card.author}</p>}
                      {card.co_narrator && (
                        <button type="button"
                          onClick={e=>{ e.preventDefault(); e.stopPropagation(); setInlineEdit({cardId:card.id,field:"co_narrator",strVal:card.co_narrator}); }}
                          className="text-[10px] text-white/40 hover:text-white/60 text-left transition-colors truncate w-full">
                          with {(() => { try { const p = JSON.parse(card.co_narrator); return Array.isArray(p) ? p.join(", ") : card.co_narrator; } catch { return card.co_narrator; } })()}
                        </button>
                      )}

                      {/* Deadline pills */}
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <button type="button"
                          onClick={e=>{ e.preventDefault(); e.stopPropagation(); setInlineEdit({cardId:card.id,field:"deadline",strVal:card.deadline||""}); }}
                          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            card.deadline
                              ?(()=>{ const [y,m,d]=card.deadline.split("-"); return new Date(+y,+m-1,+d)<new Date()&&column.id!=="released"?"border-red-500/40 text-red-400 bg-red-500/10":"border-white/15 text-white/50 bg-white/5"; })()
                              :"border-dashed border-white/15 text-white/25 hover:border-white/30 hover:text-white/40"
                          }`}>
                          <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          {card.deadline?(()=>{ const [y,m,d]=card.deadline.split("-"); return new Date(+y,+m-1,+d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); })():"Deadline"}
                        </button>
                        <button type="button"
                          onClick={e=>{ e.preventDefault(); e.stopPropagation(); setInlineEdit({cardId:card.id,field:"first15_due",strVal:card.first15_due||""}); }}
                          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            card.first_15_complete
                              ?"border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                              :card.first15_due
                                ?(()=>{ const [y,m,d]=card.first15_due.split("-"); return new Date(+y,+m-1,+d)<new Date()&&column.id==="contracted"?"border-orange-500/40 text-orange-400 bg-orange-500/10":"border-white/15 text-white/50 bg-white/5"; })()
                                :"border-dashed border-white/15 text-white/25 hover:border-white/30 hover:text-white/40"
                          }`}>
                          {card.first_15_complete
                            ?<svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            :<svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.131a1 1 0 01-1.447.894L15 14M3 8h12a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z"/></svg>
                          }
                          {card.first15_due?(()=>{ const [y,m,d]=card.first15_due.split("-"); return new Date(+y,+m-1,+d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); })():"First 15"}
                        </button>
                      </div>

                      {/* Payment + word count */}
                      {(card.payment_type||card.pfh_rate>0||card.word_count>0) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {(card.payment_type||card.pfh_rate>0) && (
                            <button type="button"
                              onClick={e=>{ e.preventDefault(); e.stopPropagation(); setInlineEdit({cardId:card.id,field:"payment",strVal:card.payment_type||"pfh",numVal:card.pfh_rate||0}); }}
                              className="text-[10px] text-white/35 hover:text-white/60 transition-colors">
                              {card.payment_type==="pfh"&&card.pfh_rate>0?`$${card.pfh_rate}/hr`:card.payment_type==="rs_plus"?"RS+":card.payment_type==="rs"?"RS":card.payment_type==="pfh"?"PFH":""}
                            </button>
                          )}
                          {card.word_count>0 && (
                            <span className="text-[10px] text-white/35">
                              {card.word_count.toLocaleString()} words{card.pfh_rate>0?` · ~${(card.word_count/9400).toFixed(1)} hrs`:""}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer — pinned to bottom of details column */}
                      <div className="mt-3 pt-3 border-t border-white/6 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <button type="button"
                            onClick={async e=>{ e.preventDefault(); e.stopPropagation(); const v=!card.first_15_complete; setCards(p=>p.map(c=>c.id===card.id?{...c,first_15_complete:v}:c)); await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:card.id,first_15_complete:v})}); }}
                            title={card.first_15_complete?"First 15 complete":"Mark First 15 done"}
                            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${card.first_15_complete?"bg-emerald-500/20 text-emerald-300 border-emerald-500/40":"text-white/60 border-white/25 hover:border-white/50 hover:text-white/90"}`}>
                            {card.first_15_complete?<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>:<span className="h-3 w-3 rounded-sm border border-current inline-block"/>}
                            15
                          </button>
                          {card.author_email && (
                            <button type="button"
                              onClick={async e=>{ e.preventDefault(); e.stopPropagation(); const v=!(card.email_updates_enabled??false); setCards(p=>p.map(c=>c.id===card.id?{...c,email_updates_enabled:v}:c)); await fetch("/api/board",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:card.id,email_updates_enabled:v,...(card.author_email?{author_email:card.author_email}:{})})}); }}
                              title={(card.email_updates_enabled??false)?"Emails enabled — click to disable":"Emails disabled — click to enable"}
                              className={`relative p-2 rounded transition-colors ${(card.email_updates_enabled??false)?"text-emerald-300 hover:text-emerald-200":"text-red-400 hover:text-red-300"}`}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                              {(card.email_updates_enabled??false)
                                ?<svg className="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                :<svg className="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                              }
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={()=>copyLink(card.author_token)} title="Copy author link"
                            className="text-white/40 hover:text-[#D4AF37] transition-colors">
                            {copied===card.author_token
                              ?<svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                              :<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>}
                          </button>
                          {card.status==="released" && (
                            <button type="button" onClick={()=>syncToBooks(card)} title="Sync to public Narrated Works"
                              className="text-white/40 hover:text-emerald-400 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                          )}
                          <button type="button" onClick={()=>startEdit(card)} className="text-white/40 hover:text-white transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button type="button" onClick={()=>del(card.id, card.title)} className="text-white/40 hover:text-red-400 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline edit popover — below the card */}
                    {inlineEdit?.cardId === card.id && (
                      <div ref={inlineRef}
                        className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#0D1040] border border-[#D4AF37]/25 rounded-xl p-3 shadow-2xl"
                        onClick={e=>e.stopPropagation()}>
                        {(inlineEdit.field==="deadline"||inlineEdit.field==="first15_due") && (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-medium">{inlineEdit.field==="deadline"?"Deadline":"First 15 Due"}</p>
                            <input type="date" value={inlineEdit.strVal}
                              onChange={e=>setInlineEdit(p=>p?{...p,strVal:e.target.value}:p)}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]/40 [color-scheme:dark]"/>
                            <div className="flex gap-2">
                              <button type="button" onClick={saveInline} className="flex-1 text-xs font-bold bg-[#D4AF37] text-black py-1.5 rounded-lg hover:bg-[#E0C15A] transition-colors">Save</button>
                              <button type="button" onClick={()=>setInlineEdit(null)} className="px-3 text-xs text-white/40 hover:text-white transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                        {inlineEdit.field==="co_narrator" && (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-medium">Co-narrator</p>
                            <input type="text" value={inlineEdit.strVal}
                              onChange={e=>setInlineEdit(p=>p?{...p,strVal:e.target.value}:p)}
                              list={`co-narrators-${card.id}`} placeholder="Name…"
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]/40 placeholder:text-white/20"/>
                            <datalist id={`co-narrators-${card.id}`}>
                              {coNarratorNames.map(n=><option key={n} value={n}/>)}
                            </datalist>
                            <div className="flex gap-2">
                              <button type="button" onClick={saveInline} className="flex-1 text-xs font-bold bg-[#D4AF37] text-black py-1.5 rounded-lg hover:bg-[#E0C15A] transition-colors">Save</button>
                              <button type="button" onClick={()=>setInlineEdit(null)} className="px-3 text-xs text-white/40 hover:text-white transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                        {inlineEdit.field==="payment" && (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-medium">Payment</p>
                            <div className="flex gap-1.5">
                              {(["pfh","rs","rs_plus"] as const).map(t=>(
                                <button key={t} type="button"
                                  onClick={()=>setInlineEdit(p=>p?{...p,strVal:t}:p)}
                                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-colors ${inlineEdit.strVal===t?"border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#D4AF37]":"border-white/10 text-white/40 hover:border-white/25"}`}>
                                  {t==="pfh"?"PFH":t==="rs"?"RS":"RS+"}
                                </button>
                              ))}
                            </div>
                            {inlineEdit.strVal==="pfh" && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/40 shrink-0">$/hr</span>
                                <input type="number" value={inlineEdit.numVal||""}
                                  onChange={e=>setInlineEdit(p=>p?{...p,numVal:parseFloat(e.target.value)||0}:p)}
                                  min={0} step={0.01}
                                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]/40"/>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button type="button" onClick={saveInline} className="flex-1 text-xs font-bold bg-[#D4AF37] text-black py-1.5 rounded-lg hover:bg-[#E0C15A] transition-colors">Save</button>
                              <button type="button" onClick={()=>setInlineEdit(null)} className="px-3 text-xs text-white/40 hover:text-white transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}


              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
      )}
    </main>
  );
}
