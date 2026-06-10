import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";

const DATE_RANGES = [
  { label: "7 days",  days: 7   },
  { label: "30 days", days: 30  },
  { label: "90 days", days: 90  },
  { label: "All",     days: 0   },
] as const;

function sinceDate(days: number): string | null {
  if (days === 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function DailyChart({ events, days }: { events: { created_at: string }[]; days: number }) {
  const bucketDays = days === 0 ? 90 : days;
  const now = Date.now();
  const buckets: Record<string, number> = {};
  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const e of events) {
    const key = e.created_at.slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  const values = Object.values(buckets);
  const max = Math.max(...values, 1);
  const keys = Object.keys(buckets);
  const W = 800;
  const H = 80;
  const barW = W / values.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => {
        const barH = Math.max((v / max) * H, v > 0 ? 2 : 0);
        const isToday = keys[i] === new Date().toISOString().slice(0, 10);
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={H - barH}
            width={Math.max(barW - 2, 1)}
            height={barH}
            fill={isToday ? "#D4AF37" : v > 0 ? "#4A6CF7" : "#1E2660"}
            rx="1"
          />
        );
      })}
    </svg>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const cookieStore = await cookies();
  const cookieKey = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  if (!cookieKey || cookieKey !== secret) return notFound();

  const sp = await searchParams;
  const rawDays = parseInt(sp.days ?? "30", 10);
  const activeDays = [7, 30, 90, 0].includes(rawDays) ? rawDays : 30;
  const since = sinceDate(activeDays);

  let query = supabaseAdmin
    .from("analytics_events")
    .select("event, page, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (since) query = query.gte("created_at", since);

  const { data: events } = await query;
  const all = events ?? [];

  // ── aggregation helpers ───────────────────────────────────────────────────
  const countBy = (evt: string) => all.filter(e => e.event === evt).length;

  const bookViews = all
    .filter(e => e.event === "book_page_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const slug  = (e.metadata as Record<string, unknown>)?.slug as string ?? e.page ?? "unknown";
      const title = (e.metadata as Record<string, unknown>)?.title as string ?? slug;
      if (!acc[slug]) acc[slug] = { title, count: 0 };
      acc[slug].count++;
      return acc;
    }, {});

  const authorViews = all
    .filter(e => e.event === "author_token_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const id    = (e.metadata as Record<string, unknown>)?.card_id as string ?? "unknown";
      const title = (e.metadata as Record<string, unknown>)?.title   as string ?? id;
      if (!acc[id]) acc[id] = { title, count: 0 };
      acc[id].count++;
      return acc;
    }, {});

  const demosPlayed = all
    .filter(e => e.event === "demo_played")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const title = (e.metadata as Record<string, unknown>)?.title as string ?? "Unknown";
      if (!acc[title]) acc[title] = { title, count: 0 };
      acc[title].count++;
      return acc;
    }, {});

  const sortedBooks   = Object.values(bookViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedAuthors = Object.values(authorViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedDemos   = Object.values(demosPlayed).sort((a, b) => b.count - a.count).slice(0, 8);
  const maxBookViews  = sortedBooks[0]?.count  ?? 1;
  const maxDemoPlays  = sortedDemos[0]?.count  ?? 1;

  const audibleClicks  = countBy("audible_link_clicked");
  const spotifyClicks  = countBy("spotify_link_clicked");
  const arClicks       = countBy("ar_link_clicked");
  const platformTotal  = audibleClicks + spotifyClicks + arClicks || 1;

  const stats = [
    { label: "Book pages viewed",      value: countBy("book_page_viewed"),       color: "bg-[#D4AF37]" },
    { label: "Author portals visited",  value: countBy("author_token_viewed"),    color: "bg-blue-500"   },
    { label: "Demo plays",              value: countBy("demo_played"),            color: "bg-emerald-500"},
    { label: "Audible clicks",          value: audibleClicks,                     color: "bg-amber-400"  },
    { label: "Spotify clicks",          value: spotifyClicks,                     color: "bg-green-500"  },
    { label: "Authors Republic clicks", value: arClicks,                          color: "bg-slate-400"  },
    { label: "Contact form submits",    value: countBy("contact_form_submitted"), color: "bg-orange-500" },
    { label: "Quote requests",          value: countBy("quote_requested"),        color: "bg-purple-500" },
  ];

  const recentEvents = all.slice(0, 20);

  const labelFor: Record<string, string> = {
    book_page_viewed:       "📖 Book viewed",
    author_token_viewed:    "🔑 Author portal",
    demo_played:            "🎧 Demo played",
    audible_link_clicked:   "🔊 Audible click",
    spotify_link_clicked:   "🎵 Spotify click",
    ar_link_clicked:        "🎙 AR click",
    contact_form_submitted: "✉️ Contact form",
    quote_requested:        "💬 Quote request",
  };

  return (
    <main className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-5xl mx-auto">

        {/* Nav */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <Link href="/admin/stats"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
            ← Admin
          </Link>
          <Link href="/admin/contacts"
            className="inline-flex items-center gap-2 text-sm font-bold text-white/60 border border-white/15 px-4 py-2 rounded-full hover:bg-white/5 transition-colors">
            Contacts
          </Link>
        </div>

        {/* Header + date range tabs */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#D4AF37]">Analytics</h1>
            <p className="text-white/40 text-sm mt-1">{all.length.toLocaleString()} events in range</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {DATE_RANGES.map(r => {
              const active = r.days === activeDays;
              return (
                <Link key={r.days} href={`/admin/analytics?days=${r.days}`}
                  className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-[#D4AF37] text-black border-[#D4AF37]"
                      : "text-white/50 border-white/15 hover:bg-white/5"
                  }`}>
                  {r.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Daily activity chart */}
        <section className="mb-10 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-white/35 mb-4">
            Daily activity{activeDays === 0 ? " (last 90 days)" : ""}
          </p>
          <DailyChart events={all} days={activeDays} />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-white/25">older</span>
            <span className="text-[10px] text-white/25">today</span>
          </div>
        </section>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5">
              <p className="text-3xl font-bold text-white">{s.value.toLocaleString()}</p>
              <p className="text-xs text-white/45 mt-1 leading-snug">{s.label}</p>
              <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${s.color}`}
                  style={{ width: s.value > 0 ? "100%" : "0" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Platform breakdown */}
        {(audibleClicks + spotifyClicks + arClicks) > 0 && (
          <section className="mb-12 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Platform breakdown</h2>
            <div className="space-y-3">
              {[
                { label: "Audible",          count: audibleClicks,  color: "bg-amber-400" },
                { label: "Spotify",          count: spotifyClicks,  color: "bg-green-500" },
                { label: "Authors Republic", count: arClicks,       color: "bg-slate-400" },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-4">
                  <span className="text-xs text-white/50 w-32 shrink-0">{p.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${p.color} transition-all`}
                      style={{ width: `${Math.round((p.count / platformTotal) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-bold text-white w-8 text-right shrink-0">{p.count}</span>
                  <span className="text-xs text-white/30 w-8 shrink-0">
                    {Math.round((p.count / platformTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Most viewed books */}
          {sortedBooks.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Most viewed books</h2>
              <div className="space-y-3">
                {sortedBooks.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-white/30 w-4 shrink-0 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{b.title}</p>
                      <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-[#D4AF37]"
                          style={{ width: `${Math.round((b.count / maxBookViews) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white shrink-0">{b.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top demos played */}
          {sortedDemos.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Top demos played</h2>
              <div className="space-y-3">
                {sortedDemos.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-white/30 w-4 shrink-0 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{d.title}</p>
                      <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.round((d.count / maxDemoPlays) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white shrink-0">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Author portal views */}
        {sortedAuthors.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Author portal views</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {sortedAuthors.map((a, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1A2550] bg-[#0B1224] px-4 py-2.5">
                  <span className="text-xs text-white/30 w-4 shrink-0">{i + 1}</span>
                  <p className="flex-1 text-sm text-white/80 truncate">{a.title}</p>
                  <span className="text-sm font-bold text-white shrink-0">{a.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent events feed */}
        {recentEvents.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Recent events</h2>
            <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] divide-y divide-white/5">
              {recentEvents.map((e, i) => {
                const meta = e.metadata as Record<string, unknown> | null;
                const detail = meta?.title as string
                  ?? meta?.slug as string
                  ?? e.page
                  ?? "";
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-xs font-medium text-white/70 min-w-[140px]">
                      {labelFor[e.event] ?? e.event}
                    </span>
                    <span className="flex-1 text-xs text-white/35 truncate">{detail}</span>
                    <span className="text-[10px] text-white/25 shrink-0 whitespace-nowrap">
                      {fmtTime(e.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {all.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-white/25 text-sm">No events recorded in this date range.</p>
          </div>
        )}
      </div>
    </main>
  );
}
