import { adminType } from "@/lib/design-tokens";
import type { VercelAnalyticsResult, VisitRow } from "@/lib/vercel-analytics";
import { VerticalBarChart } from "./VerticalBarChart";
import { HorizontalBarChart } from "./HorizontalBarChart";
import type { ChartDatum } from "./lib";

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

function Panel({ title, rows, label }: { title: string; rows: VisitRow[]; label?: (s: string) => string }) {
  return (
    <div>
      <h3 className={`${adminType.label} mb-3`}>{title}</h3>
      <div className={card}>
        {rows.length ? (
          <HorizontalBarChart data={toChart(rows, label)} />
        ) : (
          <p className={adminType.small}>No data in this range.</p>
        )}
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
  const heading = <h2 className={`${adminType.label} mb-4`}>Site Traffic (Vercel)</h2>;

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
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: d.pageviews,
  }));

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

      <div className="mt-5">
        <h3 className={`${adminType.label} mb-3`}>Daily page views</h3>
        <div className={card}>
          {daily.length ? (
            <VerticalBarChart data={daily} height={200} unit="views" sparseLabels={daily.length > 21} />
          ) : (
            <p className={adminType.small}>No traffic recorded in this range.</p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Panel title="Top routes" rows={a.routes} />
        <Panel title="Top pages" rows={a.pages} />
        <Panel title="Referrers" rows={a.referrers} />
        <Panel title="Countries" rows={a.countries} label={countryLabel} />
        <Panel title="Devices" rows={a.devices} />
        <Panel title="Browsers" rows={a.browsers} />
      </div>

      {/* Shown only when there is something in them. Campaign traffic needs
          UTM-tagged links, and custom events need @vercel/analytics' track() —
          this site's own track() writes to Supabase instead — so an empty card
          for either would be permanent furniture rather than information. */}
      {(a.campaigns.length > 0 || a.events.length > 0) && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {a.campaigns.length > 0 && <Panel title="UTM campaigns" rows={a.campaigns} />}
          {a.events.length > 0 && <Panel title="Custom events" rows={a.events} />}
        </div>
      )}

      {a.unavailable.length > 0 && (
        <p className={`${adminType.small} mt-4`}>
          Vercel did not return: {a.unavailable.join(", ")}. These are usually dimensions the current
          plan does not expose; the server log has the exact response.
        </p>
      )}
    </section>
  );
}
