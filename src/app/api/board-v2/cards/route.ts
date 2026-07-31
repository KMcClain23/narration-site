import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET-only, read-only parallel to /api/board for the new board (/board-v2).
// The existing /api/board stays untouched — this is intentionally a
// separate endpoint until Stage 7 consolidates them.
//
// Returns active, non-archived cards only: excludes 'released' (belongs on
// the Released page, not the board) and 'audition' (excluded from /board-v2
// entirely, per product decision — audition candidates aren't yet "active
// production" work).
const ACTIVE_STATUSES = ["contracted", "prepping", "recording", "editing"] as const;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select(
      "id, title, author, co_narrator, cover_url, status, deadline, first15_due, first_15_complete, word_count, pfh_rate, payment_type, is_confidential, narration_format, created_at"
    )
    .in("status", ACTIVE_STATUSES)
    .is("archived_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cards: data ?? [] });
}
