import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";

export default async function AnalyticsPage() {
  const secret    = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const cookieStore = await cookies();
  const cookieKey = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  if (!cookieKey || cookieKey !== secret) return notFound();

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch event counts
  const { data: events } = await supabaseAdmin
    .from("analytics_events")
    .select("event, page, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  const all = events ?? [];

  // Aggregate helpers
  const countBy = (evt: string) => all.filter(e => e.event === evt).length;

  const bookViews = all
    .filter(e => e.event === "book_page_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const slug  = e.metadata?.slug as string ?? e.page ?? "unknown";
      const title = e.metadata?.title as string ?? slug;
      if (!acc[slug]) acc[slug] = { title, count: 0 };
      acc[slug].count++;
      return acc;
    }, {});

  const authorViews = all
    .filter(e => e.event === "author_token_viewed")
    .reduce<Record<string, { title: string; count: number }>>((acc, e) => {
      const id    = e.metadata?.card_id as string ?? "unknown";
      const title = e.metadata?.title   as string ?? id;
      if (!acc[id]) acc[id] = { title, count: 0 };
      acc[id].count++;
      return acc;
    }, {});

  const sortedBooks   = Object.values(bookViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const sortedAuthors = Object.values(authorViews).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxBookViews  = sortedBooks[0]?.count ?? 1;

  const stats = [
    { label: "Book pages viewed",     value: countBy("book_page_viewed"),      color: "bg-[#D4AF37]" },
    { label: "Author portals visited", value: countBy("author_token_viewed"),  color: "bg-blue-500"   },
    { label: "Demo plays",             value: countBy("demo_played"),           color: "bg-emerald-500"},
    { label: "Quote requests",         value: countBy("quote_requested"),       color: "bg-purple-500" },
    { label: "Contact form submits",   value: countBy("contact_form_submitted"),color: "bg-orange-500" },
    { label: "Audible link clicks",    value: countBy("audible_link_clicked"),  color: "bg-red-400"    },
  ];

  return (
    <main className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <Link href="/admin/stats"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
            ← Admin
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-[#D4AF37] mb-2">Analytics</h1>
        <p className="text-white/40 text-sm mb-10">Last 30 days · {all.length.toLocaleString()} events tracked</p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5">
              <p className="text-3xl font-bold text-white">{s.value.toLocaleString()}</p>
              <p className="text-xs text-white/45 mt-1">{s.label}</p>
              <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${s.color}`}
                  style={{ width: s.value > 0 ? "100%" : "0" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Most viewed books */}
        {sortedBooks.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Most viewed books</h2>
            <div className="space-y-3">
              {sortedBooks.map((b, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-xs text-white/30 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{b.title}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
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

        {/* Author portal views */}
        {sortedAuthors.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-5">Author portal views</h2>
            <div className="space-y-3">
              {sortedAuthors.map((a, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-xs text-white/30 w-4 shrink-0">{i + 1}</span>
                  <p className="flex-1 text-sm text-white/80 truncate">{a.title}</p>
                  <span className="text-sm font-bold text-white shrink-0">{a.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {all.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-white/25 text-sm">No events yet — run the Supabase migration to create the analytics_events table.</p>
          </div>
        )}
      </div>
    </main>
  );
}
