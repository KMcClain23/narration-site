import { adminType } from "@/lib/design-tokens";
import type { VercelAnalyticsResult, VisitRow } from "@/lib/vercel-analytics";
import { VerticalBarChart } from "./VerticalBarChart";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { OwnTrafficToggle, OwnTrafficNote } from "./OwnTrafficToggle";
import type { ChartDatum } from "./lib";
import { formatDayLabel } from "./timezone";

// Traffic as Vercel measures it, alongside the career metrics and the
// self-hosted event tracking already on this page. Three sources, three
// different things: board_cards is the work, analytics_events is what visitors
// clicked, and this is who arrived and from where.

const card = "rounded-2xl border border-surface-border bg-surface p-5";

/** Country codes are what the API returns; names are what people read. */
const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryLabel(code: string): string {
  if (!code || code === "(none)" || code.length !== 2) return code || "Unknown";
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function toChart(rows: VisitRow[], label: (s: string) => string = (s) => s): ChartDatum[] {
  return rows.map((r) => ({ label: label(r.label), value: r.pageviews }));
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6">
      <p className={adminType.titleLg}>{value}</p>
      <p className={`${adminType.small} mt-1`}>{label}</p>
    </div>
  );
}

/**
 * A breakdown, or nothing at all.
 *
 * An empty panel is not information — it is a card saying "no data" in a grid
 * of them, and on a site with modest traffic that is most of the section. Rows
 * only exist for values Vercel actually recorded, so a panel with none has
 * nothing to tell you and does not appear.
 */
function Panel({ title, rows, label }: { title: string; rows: VisitRow[]; label?: (s: string) => string }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className={`${adminType.label} mb-3`}>{title}</h3>
      <div className={card}>
        <HorizontalBarChart data={toChart(rows, label)} />
      </div>
    </div>
  );
}

export function VercelAnalyticsSection({
  result,
  activeDays,
}: {
  result: VercelAnalyticsResult;
  activeDays: number;
}) {
  const heading = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className={adminType.label}>Site Traffic (Vercel)</h2>
      <OwnTrafficToggle />
    </div>
  );

  if (result.status === "unconfigured") {
    return (
      <section>
        {heading}
        <div className={card}>
          <p className={adminType.small}>
            The site already sends Web Analytics to Vercel — this panel just needs read access to show
            them here. Create a Vercel access token with access to this project, then add it as{" "}
            <code className="text-text-primary">VERCEL_ANALYTICS_TOKEN</code> in the project&apos;s
            environment variables and redeploy. Nothing else needs configuring.
          </p>
        </div>
      </section>
    );
  }

  if (result.status === "error") {
    return (
      <section>
        {heading}
        <div className={`${card} border-red-500/40`}>
          <p className={`${adminType.small} text-red-400`}>{result.message}</p>
        </div>
      </section>
    );
  }

  const a = result.data;
  const rangeLabel = activeDays === 0 ? `since ${a.since}` : `last ${activeDays} days`;
  const perVisitor = a.range.visitors ? a.range.pageviews / a.range.visitors : 0;

  const daily: ChartDatum[] = a.daily.map((d) => ({
    // Vercel returns a UTC calendar date; noon avoids the label slipping a
    // day when it is rendered in Pacific.
    label: formatDayLabel(`${d.date}T12:00:00Z`),
    value: d.pageviews,
  }));

  const hasBreakdowns = [
    a.countries, a.devices, a.operatingSystems, a.browsers,
    a.pages, a.routes, a.referrers,
    a.sources, a.mediums, a.campaigns, a.events,
  ].some((rows) => rows.length > 0);

  // Nothing recorded at all is one sentence, not a page of empty cards.
  if (!a.range.pageviews && !hasBreakdowns) {
    return (
      <section>
        {heading}
        <div className={card}>
          <p className={adminType.small}>
            No traffic recorded in the {rangeLabel}. Vercel aggregates hourly, so a very recent visit
            may not have landed yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      {heading}

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={a.range.pageviews.toLocaleString()} label={`Page views (${rangeLabel})`} />
        <Stat value={a.range.visitors.toLocaleString()} label={`Visitors (${rangeLabel})`} />
        <Stat
          value={perVisitor ? perVisitor.toFixed(1) : "—"}
          label="Pages per visitor"
        />
        <Stat
          value={a.lifetime ? a.lifetime.pageviews.toLocaleString() : "—"}
          label="Page views (all time)"
        />
      </div>

      {daily.length > 0 && (
        <div className="mt-5">
          <h3 className={`${adminType.label} mb-3`}>Daily page views</h3>
          <div className={card}>
            <VerticalBarChart data={daily} height={200} unit="views" sparseLabels={daily.length > 21} />
          </div>
        </div>
      )}

      {/* One grid, every panel self-hiding. Audience first, because countries,
          devices and operating systems are the three the Vercel dashboard leads
          with; then where they came from; then the UTM breakdowns, which stay
          empty until links are tagged, and custom events, which stay empty
          until something calls @vercel/analytics' track(). */}
      {hasBreakdowns && (
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Countries" rows={a.countries} label={countryLabel} />
          <Panel title="Devices" rows={a.devices} />
          <Panel title="Operating systems" rows={a.operatingSystems} />
          <Panel title="Browsers" rows={a.browsers} />
          <Panel title="Top pages" rows={a.pages} />
          <Panel title="Top routes" rows={a.routes} />
          <Panel title="Referrers" rows={a.referrers} />
          <Panel title="UTM sources" rows={a.sources} />
          <Panel title="UTM mediums" rows={a.mediums} />
          <Panel title="UTM campaigns" rows={a.campaigns} />
          <Panel title="Custom events" rows={a.events} />
        </div>
      )}

      {/* Plan-gated dimensions are deliberately not mentioned — they answer 402
          every time and will until the plan changes, so a line naming them is a
          standing complaint about something that cannot be fixed from here. It
          is logged server-side instead. This only fires for real faults. */}
      {a.unavailable.length > 0 && (
        <p className={`${adminType.small} mt-4`}>
          Vercel did not return: {a.unavailable.join(", ")}. The server log has the exact response.
        </p>
      )}

      <OwnTrafficNote />
    </section>
  );
}
