import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  let stats = { titles: 0, authors: 0, co_narrators: 0, genres: 0 };
  try {
    const { data } = await supabaseAdmin
      .from("board_cards")
      .select("author, tags, co_narrator")
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
    };
  } catch {
    // Stats unavailable — StatsBar stays hidden
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
      <HomeClient acceptingProjects={acceptingProjects} stats={stats} />
    </Suspense>
  );
}
