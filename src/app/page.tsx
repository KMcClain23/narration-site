import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatBookingWindow } from "@/lib/format-booking-window";

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

  // Featured demos — active, sorted, max 9
  type DbDemo = { id: string; title: string; genre: string | null; description: string | null; file_url: string; duration_seconds: number | null; sort_order: number };
  let featuredDemos: DbDemo[] = [];
  try {
    const { data: demoRows } = await supabaseAdmin
      .from("demos")
      .select("id,title,genre,description,file_url,duration_seconds,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(9);
    if (demoRows) featuredDemos = demoRows as DbDemo[];
  } catch { /* table may not exist yet — show nothing */ }

  // The hero stat pills are gone, and so is the query that fed them. They sat
  // on the same line as the only call to action, so the one click worth making
  // competed with five numbers of equal weight — and the numbers did not hold
  // up: "genres" counted distinct tags across released titles, which read as 37
  // genres for 11 books, and "co-narrators" is a figure only another narrator
  // knows how to interpret.

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
      <HomeClient acceptingProjects={acceptingProjects} bookingWindow={bookingWindow} demos={featuredDemos} />
    </Suspense>
  );
}
