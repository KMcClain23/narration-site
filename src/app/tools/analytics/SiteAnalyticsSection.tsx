import Link from "next/link";
import { adminType } from "@/lib/design-tokens";
import { VerticalBarChart } from "./VerticalBarChart";
import type { ChartDatum } from "./lib";

// Preserved from the retired /admin/analytics — website engagement/marketing
// tracking (analytics_events table), a completely separate data domain from
// the career metrics above it on this page. Kept as its own section rather
// than dropped, per explicit decision when the new page was scoped.

export type AnalyticsEvent = {
  event: string;
  page: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const DATE_RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All", days: 0 },
] as const;

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function bucketDaily(events: AnalyticsEvent[], days: number): ChartDatum[] {
  const bucketDays = days === 0 ? 90 : days;
  const now = Date.now();
  const buckets: Record<string, number> = {};
  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const e of events) {
    const key = e.created_at.slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([key, value]) => {
    const d = new Date(key + "T00:00:00");
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value };
  });
}

const labelFor: Record<string, string> = {
  book_page_viewed: "📖 Book viewed",
  author_token_viewed: "🔑 Author portal",
  demo_played: "🎧 Demo played",
  audible_link_clicked: "🔊 Audible click",
  spotify_link_clicked: "🎵 Spotify click",
  ar_link_clicked: "🎙 AR click",
  contact_form_submitted: "✉️ Contact form",
  quote_requested: "💬 Quote request",
};

export function SiteAnalyticsSection({ events, activeDays }: { events: AnalyticsEvent[]; activeDays: number }) {
  const countBy = (evt: string) => events.filter(e => e.event === evt).length;

  const bookViews = events
    .filter(e => e.event === "book_page_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const slug = (e.metadata?.slug as string) ?? e.page ?? "unknown";
      const title = (e.metadata?.title as string) ?? slug;
      if (!acc[slug]) acc[slug] = { title, count: 0 };
      acc[slug].count++;
      return acc;
    }, {});

  const authorViews = events
    .filter(e => e.event === "author_token_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const id = (e.metadata?.card_id as string) ?? "unknown";
      const title = (e.metadata?.title as string) ?? id;
      if (!acc[id]) acc[id] = { title, count: 0 };
      acc[id].count++;
      return acc;
    }, {});

  const demosPlayed = events
    .filter(e => e.event === "demo_played")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const title = (e.metadata?.title as string) ?? "Unknown";
      if (!acc[title]) acc[title] = { title, count: 0 };
      acc[title].count++;
      return acc;
    }, {});

  const sortedBooks = Object.values(bookViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedAuthors = Object.values(authorViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedDemos = Object.values(demosPlayed).sort((a, b) => b.count - a.count).slice(0, 8);
  const maxBookViews = sortedBooks[0]?.count ?? 1;
  const maxDemoPlays = sortedDemos[0]?.count ?? 1;

  const audibleClicks = countBy("audible_link_clicked");
  const spotifyClicks = countBy("spotify_link_clicked");
  const arClicks = countBy("ar_link_clicked");
  const platformTotal = audibleClicks + spotifyClicks + arClicks || 1;

  const stats = [
    { label: "Book pages viewed", value: countBy("book_page_viewed") },
    { label: "Author portals visited", value: countBy("author_token_viewed") },
    { label: "Demo plays", value: countBy("demo_played") },
    { label: "Audible clicks", value: audibleClicks },
    { label: "Spotify clicks", value: spotifyClicks },
    { label: "Authors Republic clicks", value: arClicks },
    { label: "Contact form submits", value: countBy("contact_form_submitted") },
    { label: "Quote requests", value: countBy("quote_requested") },
  ];

  const recentEvents = events.slice(0, 20);
  const dailyData = bucketDaily(events, activeDays);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className={adminType.titleLg}>Site Analytics</h2>
          <p className={`${adminType.small} mt-1`}>{events.length.toLocaleString()} events in range</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {DATE_RANGES.map(r => {
            const active = r.days === activeDays;
            return (
              <Link
                key={r.days}
                href={`/tools/analytics?days=${r.days}`}
                className={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-accent-amber text-background border-accent-amber"
                    : "text-text-muted border-surface-border hover:bg-surface-raised"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Daily activity chart */}
      <div className="mb-8 rounded-2xl border border-surface-border bg-surface p-5">
        <p className={`${adminType.label} mb-2`}>Daily activity{activeDays === 0 ? " (last 90 days)" : ""}</p>
        <VerticalBarChart data={dailyData} height={140} sparseLabels highlightLast unit="events" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl border border-surface-border bg-surface p-5">
            <p className={adminType.titleLg}>{s.value.toLocaleString()}</p>
            <p className={`${adminType.small} mt-1 leading-snug`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Platform breakdown */}
      {audibleClicks + spotifyClicks + arClicks > 0 && (
        <div className="mb-8 rounded-2xl border border-surface-border bg-surface p-6">
          <h3 className={`${adminType.label} mb-5`}>Platform breakdown</h3>
          <div className="space-y-3">
            {[
              { label: "Audible", count: audibleClicks, opacity: 1 },
              { label: "Spotify", count: spotifyClicks, opacity: 0.7 },
              { label: "Authors Republic", count: arClicks, opacity: 0.4 },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-4">
                <span className={`${adminType.small} w-32 shrink-0`}>{p.label}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-amber transition-all"
                    style={{ width: `${Math.round((p.count / platformTotal) * 100)}%`, opacity: p.opacity }}
                  />
                </div>
                <span className="text-sm font-bold text-text-primary w-8 text-right shrink-0">{p.count}</span>
                <span className={`${adminType.small} w-8 shrink-0`}>{Math.round((p.count / platformTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        {sortedBooks.length > 0 && (
          <div>
            <h3 className={`${adminType.label} mb-5`}>Most viewed books</h3>
            <div className="space-y-3">
              {sortedBooks.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`${adminType.small} w-4 shrink-0 text-right`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-body truncate">{b.title}</p>
                    <div className="mt-1 h-1 rounded-full bg-surface-raised overflow-hidden">
                      <div className="h-full rounded-full bg-accent-amber" style={{ width: `${Math.round((b.count / maxBookViews) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-text-primary shrink-0">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedDemos.length > 0 && (
          <div>
            <h3 className={`${adminType.label} mb-5`}>Top demos played</h3>
            <div className="space-y-3">
              {sortedDemos.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`${adminType.small} w-4 shrink-0 text-right`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-body truncate">{d.title}</p>
                    <div className="mt-1 h-1 rounded-full bg-surface-raised overflow-hidden">
                      <div className="h-full rounded-full bg-accent-amber" style={{ width: `${Math.round((d.count / maxDemoPlays) * 100)}%`, opacity: 0.7 }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-text-primary shrink-0">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {sortedAuthors.length > 0 && (
        <div className="mb-8">
          <h3 className={`${adminType.label} mb-5`}>Author portal views</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {sortedAuthors.map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-4 py-2.5">
                <span className={`${adminType.small} w-4 shrink-0`}>{i + 1}</span>
                <p className="flex-1 text-sm text-text-body truncate">{a.title}</p>
                <span className="text-sm font-bold text-text-primary shrink-0">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div>
          <h3 className={`${adminType.label} mb-5`}>Recent events</h3>
          <div className="rounded-2xl border border-surface-border bg-surface divide-y divide-surface-border">
            {recentEvents.map((e, i) => {
              const detail = (e.metadata?.title as string) ?? (e.metadata?.slug as string) ?? e.page ?? "";
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-xs font-medium text-text-body min-w-[140px]">{labelFor[e.event] ?? e.event}</span>
                  <span className={`${adminType.small} flex-1 truncate`}>{detail}</span>
                  <span className="text-[10px] text-text-faint shrink-0 whitespace-nowrap">{fmtTime(e.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="py-20 text-center">
          <p className={adminType.small}>No events recorded in this date range.</p>
        </div>
      )}
    </section>
  );
}
