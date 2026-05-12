import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("author, tags, co_narrator")
    .eq("status", "released");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const titles = rows.length;
  const authors = new Set(rows.map(r => (r.author ?? "").trim().toLowerCase()).filter(Boolean)).size;
  const genres = new Set(rows.flatMap(r => (Array.isArray(r.tags) ? r.tags : []) as string[])).size;

  const coNarratorSet = new Set<string>();
  for (const row of rows) {
    if (!row.co_narrator) continue;
    try {
      const p = JSON.parse(row.co_narrator as string);
      const names: string[] = Array.isArray(p) ? p : p ? [String(p)] : [];
      names.filter(Boolean).forEach(n => coNarratorSet.add(n.trim().toLowerCase()));
    } catch {
      coNarratorSet.add(String(row.co_narrator).trim().toLowerCase());
    }
  }

  return NextResponse.json({ titles, authors, co_narrators: coNarratorSet.size, genres });
}
