import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// Separate, deliberately simple query from /api/board-v2/cards — this is an
// all-time career metric ("N released"), not a view of currently-visible
// work, so it intentionally does NOT filter archived_at: a released book
// that later got archived still counts as released.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { count, error } = await supabaseAdmin
    .from("board_cards")
    .select("*", { count: "exact", head: true })
    .eq("status", "released");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
