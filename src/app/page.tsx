import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatBookingWindow } from "@/lib/format-booking-window";

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

  let bookingWindow = formatBookingWindow([8, 9, 10, 11]); // fallback default
  try {
    const { data: monthsRow } = await supabaseAdmin
      .from("site_settings").select("value").eq("key", "available_months").single();
    if (monthsRow?.value) bookingWindow = formatBookingWindow(JSON.parse(monthsRow.value));
  } catch {}

  let stats = { titles: 0, authors: 0, co_narrators: 0, genres: 0, words: 0 };
  try {
    const { data } = await supabaseAdmin
      .from("board_cards")
      .select("author, tags, co_narrator, word_count")
      .eq("status", "released");
    const rows = data ?? [];
    const coNarratorSet = new Set<string>();
    for (const row of rows) {
      if (!row.co_narrator) continue;
      try {
        const p = JSON.parse(row.co_narrator as string);
        const names: string[] = Array.isArray(p) ? p : p ? [String(p)] : [];
        names.filter(Boolean).forEach((n: string) => coNarratorSet.add(n.trim().toLowerCase()));
      } catch {
        coNarratorSet.add(String(row.co_narrator).trim().toLowerCase());
      }
    }
    stats = {
      titles:       rows.length,
      authors:      new Set(rows.map(r => (r.author ?? "").trim().toLowerCase()).filter(Boolean)).size,
      co_narrators: coNarratorSet.size,
      genres:       new Set(rows.flatMap(r => (Array.isArray(r.tags) ? r.tags : []) as string[])).size,
      words:        rows.reduce((sum, r) => sum + (Number(r.word_count) || 0), 0),
    };
  } catch {
    // Stats unavailable — StatsBar stays hidden
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
      <HomeClient acceptingProjects={acceptingProjects} stats={stats} bookingWindow={bookingWindow} />
    </Suspense>
  );
}
