import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 3600; // cache for 1 hour

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("author, tags")
    .eq("status", "released");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const titles = rows.length;
  const authors = new Set(rows.map(r => (r.author ?? "").trim().toLowerCase()).filter(Boolean)).size;
  const genres = new Set(rows.flatMap(r => (Array.isArray(r.tags) ? r.tags : []) as string[])).size;

  return NextResponse.json({ titles, authors, genres });
}
