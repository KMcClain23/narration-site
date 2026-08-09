import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { VerticalBarChart } from "./VerticalBarChart";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { FrequentCollaborators } from "./FrequentCollaborators";
import { SiteAnalyticsSection, type AnalyticsEvent } from "./SiteAnalyticsSection";
import { VercelAnalyticsSection } from "./VercelAnalyticsSection";
import { getVercelAnalytics } from "@/lib/vercel-analytics";
import { assertAdmin } from "@/lib/require-admin";
import {
  computeCareerTotals,
  computeEarnings,
  computeFrequentCollaborators,
  computeGenreBreakdown,
  computeReleasePace,
  getTrailing5Quarters,
  type AnalyticsCard,
  type AuthorRow,
} from "./lib";

export const dynamic = "force-dynamic";

function sinceDate(days: number): string | null {
  if (days === 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const currency = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const numberFmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default async function ToolsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await assertAdmin();
  const sp = await searchParams;
  const rawDays = parseInt(sp.days ?? "30", 10);
  const activeDays = [7, 30, 90, 0].includes(rawDays) ? rawDays : 30;
  const since = sinceDate(activeDays);

  const [cardsRes, authorsRes, eventsRes, vercel] = await Promise.all([
    supabaseAdmin
      .from("board_cards")
      .select("status, released_at, word_count, payment_type, pfh_rate, narration_format, narrator_share_percent, tags, author"),
    supabaseAdmin.from("authors").select("id, name, photo_url"),
    (async () => {
      let q = supabaseAdmin
        .from("analytics_events")
        .select("event, page, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (since) q = q.gte("created_at", since);
      return q;
    })(),
    // Never allowed to break the page: the career metrics below do not depend
    // on Vercel being reachable, and an outage there should not blank them.
    getVercelAnalytics(activeDays).catch((e) => ({
      status: "error" as const,
      message: e instanceof Error ? e.message : "Vercel Analytics request failed",
    })),
  ]);

  const cards = (cardsRes.data ?? []) as AnalyticsCard[];
  const authors = (authorsRes.data ?? []) as AuthorRow[];
  const events = (eventsRes.data ?? []) as AnalyticsEvent[];

  const quarters = getTrailing5Quarters();
  const careerTotals = computeCareerTotals(cards);
  const releasePace = computeReleasePace(cards, quarters);
  const earnings = computeEarnings(cards, quarters);
  const genres = computeGenreBreakdown(cards);
  const collaborators = computeFrequentCollaborators(cards, authors);

  return (
    <AdminLayout>
      {/* Full width, no max-w: the shell already pads, and on a wide monitor a
          fixed column meant most of the screen was empty while the page ran to
          several times its own height. Everything below is laid out in rows
          that fill across rather than sections stacked one per screenful. */}
      <div className="space-y-10">
        <h1 className={adminType.titleLg}>Analytics</h1>

        {/* Career and earnings headline figures share one strip — four numbers
            with no chart between them do not need three separate sections. */}
        <section>
          <h2 className={`${adminType.label} mb-4`}>Career &amp; Earnings</h2>
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            <div className="rounded-2xl border border-surface-border bg-surface p-6">
              <p className={adminType.titleLg}>{careerTotals.booksReleased.toLocaleString()}</p>
              <p className={`${adminType.small} mt-1`}>Books released</p>
            </div>
            <div className="rounded-2xl border border-surface-border bg-surface p-6">
              <p className={adminType.titleLg}>{numberFmt(careerTotals.hoursNarrated)}</p>
              <p className={`${adminType.small} mt-1`}>Hours narrated (share-adjusted)</p>
            </div>
            <div className="rounded-2xl border border-surface-border bg-surface p-6">
              <p className={adminType.titleLg}>{earnings.avgPerBook != null ? currency(earnings.avgPerBook) : "—"}</p>
              <p className={`${adminType.small} mt-1`}>Average earnings per book</p>
            </div>
            <div className="rounded-2xl border border-surface-border bg-surface p-6">
              <p className={adminType.titleLg}>{currency(earnings.thisQuarterTotal)}</p>
              <p className={`${adminType.small} mt-1`}>Earnings this quarter</p>
            </div>
          </div>
        </section>

        {/* The two quarterly charts are the same shape and read naturally side
            by side — pace against the money it produced. */}
        <section className="grid gap-6 xl:grid-cols-2">
          <div>
            <h2 className={`${adminType.label} mb-4`}>Release Pace</h2>
            <div className="rounded-2xl border border-surface-border bg-surface p-5">
              <VerticalBarChart data={releasePace} height={220} unit="released" />
            </div>
          </div>
          <div>
            <h2 className={`${adminType.label} mb-4`}>Earnings by Quarter</h2>
            <div className="rounded-2xl border border-surface-border bg-surface p-5">
              <VerticalBarChart data={earnings.quarterly} height={220} format="currency" />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div>
            <h2 className={`${adminType.label} mb-4`}>Genres</h2>
            <div className="rounded-2xl border border-surface-border bg-surface p-5">
              {genres.length > 0 ? (
                <HorizontalBarChart data={genres} />
              ) : (
                <p className={adminType.small}>No genre tags recorded on released books yet.</p>
              )}
            </div>
          </div>
          <div>
            <h2 className={`${adminType.label} mb-4`}>Frequent Collaborators</h2>
            <FrequentCollaborators collaborators={collaborators} />
          </div>
        </section>

        {/* Traffic as Vercel measures it — who arrived, from where, on what */}
        <VercelAnalyticsSection result={vercel} activeDays={activeDays} />

        {/* Site Analytics — preserved marketing/traffic dashboard */}
        <SiteAnalyticsSection events={events} activeDays={activeDays} />
      </div>
    </AdminLayout>
  );
}
