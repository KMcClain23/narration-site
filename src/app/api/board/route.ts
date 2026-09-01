import { bookSlug } from "@/lib/book-slug";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dateOnlyToPacificNoon } from "@/lib/timezone";

import { requireAdmin, requireAdminOrInternal } from "@/lib/require-admin";



// GET: admin gets all cards
export async function GET(req: Request) {
  // READ ONLY. The internal bearer is accepted here so import-payments can
  // match rows to projects; POST, PATCH and DELETE below are untouched and
  // remain session-only.
  const denied = await requireAdminOrInternal();
  if (denied) return denied;
  const { searchParams } = new URL(req.url);

  // Single card by ID
  const cardId = searchParams.get("id");
  if (cardId) {
    const { data, error } = await supabaseAdmin
      .from("board_cards").select("*").eq("id", cardId).single();
    if (error) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    return NextResponse.json({ card: data });
  }

  // Admin: get all cards. Archived cards are hidden from the main board by
  // default; pass ?archived=1 to fetch only the archived ones (Archive view).
  const showArchived = searchParams.get("archived") === "1";
  let query = supabaseAdmin.from("board_cards").select("*");
  query = showArchived
    ? query.not("archived_at", "is", null).order("archived_at", { ascending: false })
    : query.is("archived_at", null).order("status").order("sort_order");
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

/*
  THIS ROUTE WRITES board_cards.slug, AND ITS RULE WAS NOT THE READERS' RULE.

  It stripped punctuation instead of replacing it, so "The Wolf King's Bride"
  became `the-wolf-kings-bride` here and `the-wolf-king-s-bride` everywhere that
  derives from a title. Both forms are live: twelve cards carry a stored slug in
  the writer's form, twenty-one derive in the readers'.

  Nothing was broken by that, because the stored value wins on every surface —
  but two rules for one string, one of which mints the value the others must
  honour, is a trap with no failing test in front of it.

  It now uses the shared function, so NEW cards are minted in the form the rest
  of the site derives. The twelve stored slugs are untouched and still win.
*/

// POST: create card (admin)
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const {
      title, author = "", cover_url = "",
      status = "contracted",          // default to contracted (not audition) so card is visible
      deadline, notes = "",
      links = [], co_narrator = "", sort_order = 0, chapters = [],
      subtitle = "", tags = [], description = "",
      audible_link = "", ar_link = "", spotify_link = "",
      word_count = 0, first15_due,
      pfh_rate = 0, payment_type = "pfh", first_15_complete = false,
      slug = "",
      trigger_warnings = [], is_confidential = false, narration_format = null,
      production_type = null, production_company = null,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });

    // Build a clean insert — only include nullable fields when they have a value
    // so we never pass undefined and never violate NOT NULL constraints.
    const insertData: Record<string, unknown> = {
      title:             title.trim(),
      author:            author || "",
      cover_url:         cover_url || "",
      status:            status || "contracted",
      notes:             notes || "",
      links:             Array.isArray(links)    ? links    : [],
      co_narrator:       co_narrator || "",
      sort_order:        sort_order  ?? 0,
      chapters:          Array.isArray(chapters) ? chapters : [],
      subtitle:          subtitle    || "",
      tags:              Array.isArray(tags)     ? tags     : [],
      description:       description || "",
      audible_link:      audible_link  || "",
      ar_link:           ar_link       || "",
      spotify_link:      spotify_link  || "",
      word_count:        word_count   ?? 0,
      pfh_rate:          pfh_rate     ?? 0,
      payment_type:      payment_type || "pfh",
      first_15_complete: first_15_complete ?? false,
      slug:              slug || bookSlug(title.trim()),
      trigger_warnings:  Array.isArray(trigger_warnings) ? trigger_warnings : [],
      is_confidential:   Boolean(is_confidential),
      narration_format:  narration_format || null,
      production_type:   production_type || null,
      production_company: production_type === "company" ? (production_company || null) : null,
    };
    // Date columns must be null (not "") when empty — Supabase rejects empty strings for date/timestamptz
    insertData.deadline    = deadline    || null;
    insertData.first15_due = first15_due || null;

    const { data, error } = await supabaseAdmin
      .from("board_cards")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Supabase errors are plain objects — never use String(error) or throw them
      console.error("POST /api/board Supabase error:", JSON.stringify(error));
      return NextResponse.json(
        { error: error.message || JSON.stringify(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    // Non-Supabase exceptions (network, JSON parse, etc.)
    const msg = e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : JSON.stringify(e);
    console.error("POST /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to create card." }, { status: 500 });
  }
}

// PUT: update card (admin)
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    // Admin full update — only columns that actually exist on board_cards.
    // Keep this list in sync with the DB schema; do NOT add speculative columns.
    // Migration needed: ALTER TABLE board_cards ADD COLUMN spotify_link text;
    const allowed = [
      "title", "author", "cover_url", "status", "deadline", "notes",
      "links", "co_narrator", "sort_order", "chapters",
      "subtitle", "tags", "description", "audible_link", "ar_link", "spotify_link",
      "word_count", "first15_due", "pfh_rate", "payment_type",
      "first_15_complete", "script_url", "trigger_warnings", "released_at",
      "is_confidential", "narration_format", "narrator_share_percent", "production_type", "production_company",
      "archived_at", "archived_reason", "archived_notes", "recording_dates", "words_recorded", "royalty_split_percent",
      "amazon_rating", "amazon_review_count",
      // Page progress. THIS LIST IS WHY THE MODAL ALONE IS NOT ENOUGH: a field
      // the form sends and this filter drops is written nowhere, and Save still
      // reports success — a silent no-op, which is this project's signature
      // failure. Added here BEFORE the modal, and verified by writing and
      // reading back rather than by reading the diff.
      "total_pages", "current_page",
    ];
    const DATE_FIELDS = new Set(["deadline", "first15_due", "first_15_due", "released_at", "archived_at"]);

    // A date input sends "2026-07-17", which Postgres would store as midnight
    // UTC in a timestamptz — 5pm the previous day in Pacific. Anchored to
    // mid-afternoon Pacific instead, so the stored instant falls on the day it
    // says wherever it is read.
    const atPacificMidday = (v: unknown) =>
      typeof v === "string" ? (dateOnlyToPacificNoon(v) ?? v) : v;
    // updated_at is not set here any more — board_cards_touch_updated_at owns
    // it. That matters beyond avoiding two writers of one rule: this route set
    // it unconditionally, so a manual Amazon Refetch saved through here would
    // have bumped "last activity" where the trigger deliberately does not.
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in fields) {
        // Date columns must be null (not "") — Supabase rejects empty strings for date/timestamptz
        update[key] = DATE_FIELDS.has(key)
          ? (key === "released_at" ? (atPacificMidday(fields[key]) || null) : (fields[key] || null))
          : fields[key];
      }
    }

    // The released_at auto-stamp lived here and is now
    // board_cards_stamp_released_at, which carries the same two guards: only on
    // the transition into released, and only when nothing is already there. The
    // snapshot read that fed it went with it.
    //
    // Pacific-midday anchoring above stays: it normalises a date a person picked
    // in a date input, which is an input-format concern, not a derived value.

    const { data, error } = await supabaseAdmin
      .from("board_cards").update(update).eq("id", id).select().single();

if (error) {
      console.error("PUT /api/board Supabase error:", JSON.stringify(error), "update keys:", Object.keys(update));
      // 22023 is what check_card_word_count(), check_card_share_percent() and
      // the page rules raise. Stage 10 moved the word_count bound into the
      // database because it existed in NO client, no route and no constraint,
      // while feeding hours, earnings, page-derived progress and the career
      // total; 10A-bis added the two share columns on the same terms. This route
      // DEFERS to all of them: the message is the database's and is passed
      // through untouched, so the phone and the web refuse in the same words.
      // Note this branch is keyed on the SQLSTATE, not on a list of rules, so a
      // bound added later is covered without touching this file.
      const status = error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status });
    }

    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("PUT /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to update card." }, { status: 500 });
  }
}

// DELETE: admin only
export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
    const { error } = await supabaseAdmin.from("board_cards").delete().eq("id", id);
    if (error) {
      console.error("DELETE /api/board Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("DELETE /api/board exception:", msg);
    return NextResponse.json({ error: msg || "Failed to delete." }, { status: 500 });
  }
}
