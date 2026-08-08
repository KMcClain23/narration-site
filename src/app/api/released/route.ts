import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Released titles, for the admin Released page.
 *
 * The board deliberately excludes these — see /api/board-v2/cards, which
 * filters to active production statuses — so once a book shipped there was no
 * screen anywhere that could open it. Its description, tags, trigger warnings
 * and store links were all still live on the public site and none of them could
 * be edited without going to the database.
 *
 * Newest first: a released list is read as a history, and the most recent title
 * is the one most likely to still need a correction.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select(
      "id, title, author, cover_url, status, released_at, audible_link, description, tags, trigger_warnings, is_confidential, narration_format"
    )
    .eq("status", "released")
    .is("archived_at", null)
    .order("released_at", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data ?? [] });
}
