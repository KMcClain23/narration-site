import "server-only";

/**
 * Read-side client for Vercel Web Analytics.
 *
 * The site already *sends* Web Analytics (`<Analytics />` in layout.tsx), but
 * the numbers only existed in Vercel's dashboard. This queries them back out
 * through the public API so they sit next to the career and marketing metrics
 * on one page instead of in a second tab.
 *
 * Docs: https://vercel.com/docs/analytics/web-analytics-api
 */

const API = "https://api.vercel.com/v1/query/web-analytics";

/**
 * Identifiers, not secrets — they appear in every dashboard URL and in
 * .vercel/project.json. Kept here so the only thing that has to be configured
 * is the token, and overridable for anyone running this against another
 * project.
 */
const PROJECT_ID = process.env.VERCEL_ANALYTICS_PROJECT_ID || "prj_4yZon00RxoUxZ0yHG9dDE2MZIKwy";
const TEAM_ID = process.env.VERCEL_ANALYTICS_TEAM_ID || "team_HPZbgequydaxWwpjAByCfjkO";

/**
 * How long a set of numbers is reused before being fetched again.
 *
 * The analytics page is force-dynamic, so without this every load — including
 * every switch between date ranges — would fire nine API calls. Web Analytics
 * is aggregated hourly at best; five minutes of staleness is invisible and
 * keeps a page refresh from being an API burst.
 */
const REVALIDATE_SECONDS = 300;

/** Vercel's aggregate endpoints only reach back as far as the plan allows. */
const MAX_LOOKBACK_DAYS = 365;

export type VisitRow = { label: string; pageviews: number; visitors: number };
export type DailyRow = { date: string; pageviews: number; visitors: number };

export type VercelAnalytics = {
  /** Lifetime production totals, independent of the selected range. */
  lifetime: { pageviews: number; visitors: number } | null;
  /** Totals for the selected range, summed from the daily series. */
  range: { pageviews: number; visitors: number };
  daily: DailyRow[];
  routes: VisitRow[];
  pages: VisitRow[];
  countries: VisitRow[];
  referrers: VisitRow[];
  devices: VisitRow[];
  browsers: VisitRow[];
  operatingSystems: VisitRow[];
  sources: VisitRow[];
  mediums: VisitRow[];
  campaigns: VisitRow[];
  events: VisitRow[];
  /** Dimensions the API rejected, so a partial page can say what is missing. */
  unavailable: string[];
  /** The window actually queried, which "All" clamps. */
  since: string;
  until: string;
};

export type VercelAnalyticsResult =
  | { status: "ok"; data: VercelAnalytics }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

function token(): string | undefined {
  return process.env.VERCEL_ANALYTICS_TOKEN || process.env.VERCEL_API_TOKEN;
}

export function isVercelAnalyticsConfigured(): boolean {
  return Boolean(token() && PROJECT_ID);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One API call. Returns null rather than throwing so one bad dimension
 *  cannot take down the other eight panels. */
async function query<T>(
  path: "visits/count" | "visits/aggregate" | "events/count" | "events/aggregate",
  params: Record<string, string | number | undefined>,
  onFail: (reason: string) => void
): Promise<T | null> {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("projectId", PROJECT_ID);
  if (TEAM_ID) url.searchParams.set("teamId", TEAM_ID);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      onFail(`${res.status} ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { data?: T };
    return (json.data ?? null) as T | null;
  } catch (e) {
    onFail(e instanceof Error ? e.message : "request failed");
    return null;
  }
}

/**
 * Turn one aggregate response into chartable rows.
 *
 * The grouped key comes back under the dimension's own name — `country` for a
 * country grouping, `eventData` for an event-data grouping — so the key is
 * taken from whichever property is not a metric rather than assumed.
 */
function toRows(raw: Array<Record<string, unknown>> | null): VisitRow[] {
  if (!raw) return [];
  return raw
    .map((row) => {
      const key = Object.keys(row).find(
        (k) => !["pageviews", "visitors", "count", "timestamp"].includes(k)
      );
      const rawLabel = key ? row[key] : undefined;
      const label = rawLabel == null || rawLabel === "" ? "(none)" : String(rawLabel);
      return {
        label,
        pageviews: Number(row.pageviews ?? row.count ?? 0),
        visitors: Number(row.visitors ?? 0),
      };
    })
    .filter((r) => r.pageviews > 0 || r.visitors > 0);
}

/**
 * Every Web Analytics figure the API exposes for this project, for one window.
 *
 * `days === 0` means "all" on the page's range selector; the API needs real
 * dates, so it is clamped to the longest window a plan is likely to retain.
 * Every panel is fetched independently and a failure degrades that panel only —
 * a dimension this plan does not support should cost one card, not the page.
 */
export async function getVercelAnalytics(days: number): Promise<VercelAnalyticsResult> {
  if (!isVercelAnalyticsConfigured()) return { status: "unconfigured" };

  const span = days === 0 ? MAX_LOOKBACK_DAYS : days;
  const until = new Date();
  const since = new Date(until.getTime() - span * 86_400_000);
  const window = { since: ymd(since), until: ymd(until) };

  const unavailable: string[] = [];
  const fail = (name: string) => (reason: string) => {
    unavailable.push(name);
    console.warn(`[vercel-analytics] ${name} unavailable: ${reason}`);
  };

  const dim = (name: string, by: string, limit: number) =>
    query<Array<Record<string, unknown>>>("visits/aggregate", { ...window, by, limit }, fail(name));

  const [
    lifetime,
    daily,
    routes,
    pages,
    countries,
    referrers,
    devices,
    browsers,
    operatingSystems,
    sources,
    mediums,
    campaigns,
    events,
  ] = await Promise.all([
    query<{ pageviews: number; visitors: number }>("visits/count", {}, fail("lifetime totals")),
    query<Array<Record<string, unknown>>>("visits/aggregate", { ...window, by: "day" }, fail("daily trend")),
    dim("top routes", "route", 10),
    dim("top pages", "requestPath", 10),
    dim("countries", "country", 10),
    dim("referrers", "referrerHostname", 10),
    dim("devices", "deviceType", 6),
    dim("browsers", "browserName", 8),
    dim("operating systems", "osName", 8),
    dim("UTM sources", "utmSource", 6),
    dim("UTM mediums", "utmMedium", 6),
    dim("UTM campaigns", "utmCampaign", 6),
    query<Array<Record<string, unknown>>>(
      "events/aggregate",
      { ...window, by: "eventName", limit: 10 },
      fail("custom events")
    ),
  ]);

  // A single 401 means the token is wrong, not that every dimension is
  // individually unsupported — worth saying plainly rather than as a dozen rows.
  if (unavailable.length >= 12) {
    return {
      status: "error",
      message:
        "Vercel rejected every Web Analytics request. The usual causes are a token without access to " +
        "this project, or Web Analytics not being enabled on it. See the server log for the exact response.",
    };
  }

  // One line per fetch saying what came back. Whether this panel is working
  // cannot be seen from outside — the page is behind admin auth, and the
  // unconfigured path makes no API calls, so silence in the log means either
  // "fine" or "never ran". This makes the difference visible.
  console.log(
    `[vercel-analytics] ${window.since}..${window.until} — ` +
      `${(daily ?? []).length} days, lifetime ${lifetime ? lifetime.pageviews : "n/a"}, ` +
      `${unavailable.length} dimension(s) unavailable`
  );

  const dailyRows: DailyRow[] = (daily ?? []).map((r) => ({
    date: String(r.timestamp ?? "").slice(0, 10),
    pageviews: Number(r.pageviews ?? 0),
    visitors: Number(r.visitors ?? 0),
  }));

  return {
    status: "ok",
    data: {
      lifetime: lifetime ?? null,
      // Summed from the daily series rather than fetched separately: one fewer
      // call, and it cannot disagree with the chart drawn beside it.
      range: {
        pageviews: dailyRows.reduce((n, r) => n + r.pageviews, 0),
        visitors: dailyRows.reduce((n, r) => n + r.visitors, 0),
      },
      daily: dailyRows,
      routes: toRows(routes),
      pages: toRows(pages),
      countries: toRows(countries),
      referrers: toRows(referrers),
      devices: toRows(devices),
      browsers: toRows(browsers),
      operatingSystems: toRows(operatingSystems),
      sources: toRows(sources),
      mediums: toRows(mediums),
      campaigns: toRows(campaigns),
      events: toRows(events),
      unavailable,
      ...window,
    },
  };
}
