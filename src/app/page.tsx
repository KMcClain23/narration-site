import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { HashScroll } from "./HashScroll";
import type { SiteEvent } from "./components/UpcomingEvents";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatBookingWindow } from "@/lib/format-booking-window";
import { pacificToday } from "@/lib/timezone";

// Always fetch fresh data so admin booking changes appear immediately
export const dynamic = "force-dynamic";

export default async function Page() {
  let acceptingProjects = true;
  try {
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "accepting_projects")
      .single();
    acceptingProjects = data?.value !== "false";
  } catch {
    // Table may not exist yet — default to true
  }

  let bookingWindow = ""; // show nothing if DB read fails
  try {
    const { data: monthsRow } = await supabaseAdmin
      .from("site_settings").select("value").eq("key", "available_months").single();
    if (monthsRow?.value) bookingWindow = formatBookingWindow(JSON.parse(monthsRow.value));
  } catch {}

  // Homepage demos — the ones explicitly marked featured.
  //
  // This used to be "the first nine by sort_order", which had two problems: it
  // tied homepage curation to the order the full /demos page lists everything
  // in, and four demos shared sort_order 9999, so which of them made the cut
  // was arbitrary and three could never appear at all. `featured` is a separate
  // decision from ordering, which is what it always was in practice.
  const HOMEPAGE_DEMO_LIMIT = 6;
  type DbDemo = { id: string; title: string; genre: string | null; description: string | null; file_url: string; duration_seconds: number | null; sort_order: number };
  let featuredDemos: DbDemo[] = [];
  try {
    const cols = "id,title,genre,description,file_url,duration_seconds,sort_order";
    const { data: demoRows } = await supabaseAdmin
      .from("demos")
      .select(cols)
      .eq("active", true)
      .eq("featured", true)
      .order("sort_order", { ascending: true })
      .limit(HOMEPAGE_DEMO_LIMIT);

    // Nothing featured yet is a configuration state, not an empty site — fall
    // back to the first few so the section never silently disappears.
    if (demoRows?.length) {
      featuredDemos = demoRows as DbDemo[];
    } else {
      const { data: fallback } = await supabaseAdmin
        .from("demos")
        .select(cols)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .limit(HOMEPAGE_DEMO_LIMIT);
      featuredDemos = (fallback ?? []) as DbDemo[];
    }
  } catch { /* table may not exist yet — show nothing */ }

  // The hero stat pills are gone, and so is the query that fed them. They sat
  // on the same line as the only call to action, so the one click worth making
  // competed with five numbers of equal weight — and the numbers did not hold
  // up: "genres" counted distinct tags across released titles, which read as 37
  // genres for 11 books, and "co-narrators" is a figure only another narrator
  // knows how to interpret.

  // Only what has not happened yet. Filtering in the query rather than in the
  // component means a finished event stops being fetched, not just hidden.
  let events: SiteEvent[] = [];
  try {
    const today = pacificToday();
    const { data } = await supabaseAdmin
      .from("events")
      .select("id,name,starts_on,venue,city,url")
      .eq("active", true)
      .gte("starts_on", today)
      .order("starts_on", { ascending: true })
      .limit(4);
    if (data) events = data as SiteEvent[];
  } catch { /* table may not exist yet */ }

  return (
    <>
      {/* Outside the Suspense boundary so it is mounted and waiting before the
          content it needs to scroll to has finished streaming. */}
      <HashScroll />
      <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
        <HomeClient acceptingProjects={acceptingProjects} bookingWindow={bookingWindow} demos={featuredDemos} events={events} />
      </Suspense>
    </>
  );
}
