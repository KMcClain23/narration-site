"use client";

import { useState } from "react";

type CardRow = { id: string; title: string; deadline: string | null; first15_due: string | null; status: string };

export default function MonthlySchedule({ cards }: { cards: CardRow[] }) {
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthSlots = Array.from({ length: 8 }, (_, i) => {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + offset + i, 1);
    const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    const isDifferentYear = monthStart.getFullYear() !== now.getFullYear();
    const label = isDifferentYear
      ? monthStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : monthStart.toLocaleDateString("en-US", { month: "short" });

    const active = cards
      .filter(c => c.deadline?.startsWith(key))
      .map(c => ({ ...c, first15Due: c.first15_due?.startsWith(key) ?? false }));

    return { key, label, active };
  });

  const MAX_BAR = 5;

  return (
    <div className="mt-4 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
      {/* Header + navigation */}
      <div className="flex items-center justify-between mb-5">
        <p className="font-semibold text-white text-sm">Monthly Schedule</p>
        <div className="flex items-center gap-2">
          {offset !== 0 && (
            <button onClick={() => setOffset(0)}
              className="text-xs text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
              Today
            </button>
          )}
          <button onClick={() => setOffset(o => o - 1)} disabled={offset <= 0}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <button onClick={() => setOffset(o => o + 1)}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {monthSlots.map(({ key, label, active }) => {
          const count = active.length;
          const isCurrent = key === todayKey;
          const cardBorder = count === 0 ? "border-white/5"
            : count <= 2 ? "border-emerald-500/20"
            : count <= 4 ? "border-orange-500/25"
            : "border-red-500/30";
          const cardBg = count === 0 ? "bg-[#0A0D3A]/40"
            : count <= 2 ? "bg-emerald-950/25"
            : count <= 4 ? "bg-orange-950/20"
            : "bg-red-950/20";
          const countColor = count === 0 ? "text-white/15"
            : count <= 2 ? "text-emerald-400"
            : count <= 4 ? "text-orange-400"
            : "text-red-400";
          const barColor = count === 0 ? ""
            : count <= 2 ? "bg-emerald-500/50"
            : count <= 4 ? "bg-orange-500/50"
            : "bg-red-500/60";

          return (
            <div key={key} className={`rounded-xl border p-4 ${cardBorder} ${cardBg}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? "text-[#D4AF37]" : "text-white/45"}`}>{label}</p>
                  <p className={`text-[10px] mt-0.5 ${count === 0 ? "text-emerald-400/60" : count <= 2 ? "text-emerald-400/50" : count <= 4 ? "text-orange-400/50" : "text-red-400/50"}`}>
                    {count === 0 ? "Open" : count <= 2 ? "Light" : count <= 4 ? "Busy" : "Full"}
                  </p>
                </div>
                <span className={`text-3xl font-bold tabular-nums leading-none ${countColor}`}>{count}</span>
              </div>

              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: MAX_BAR }).map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i < count ? barColor : "bg-white/8"}`} />
                ))}
                {count > MAX_BAR && <div className="h-1 w-1.5 rounded-full bg-red-500/60" />}
              </div>

              <div className="space-y-1">
                {active.slice(0, 5).map(c => (
                  <a key={c.id} href={`/board/card/${c.id}`}
                    className="flex items-center gap-1.5 text-[11px] hover:text-white transition-colors truncate group/card">
                    <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-white/50 group-hover/card:bg-white" />
                    <span className="truncate text-white/75">{c.title}</span>
                  </a>
                ))}
                {active.length > 5 && (
                  <p className="text-[10px] text-white/25 pl-3">+{active.length - 5} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500/50" /><span className="text-[10px] text-emerald-400/70">Open</span></span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500/50" /><span className="text-[10px] text-orange-400/70">Busy</span></span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500/60" /><span className="text-[10px] text-red-400/70">Full</span></span>
        </div>
      </div>
    </div>
  );
}
