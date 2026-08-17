import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/**
 * Search every book, not just the ones the board draws.
 *
 * Deliberately unlike /api/board-v2/cards, which filters to ACTIVE_STATUSES:
 * the moment a project is released, recast, or archived it leaves the board,
 * and until now that also made it unreachable from the board. A search that
 * could only find what was already on screen would be a filter, not a search.
 *
 * Archived cards are included and flagged rather than hidden — "where did that
 * book go" is exactly the question being asked, and answering "it's archived"
 * is more useful than returning nothing.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Escape PostgREST's or() metacharacters so a title with a comma or a paren
  // can't break out of the filter expression.
  const safe = q.replace(/[,()\\]/g, " ").trim();
  if (!safe) return NextResponse.json({ results: [] });

  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, author, status, cover_url, archived_at, deadline")
    .or(`title.ilike.%${safe}%,author.ilike.%${safe}%`)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .limit(12);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
