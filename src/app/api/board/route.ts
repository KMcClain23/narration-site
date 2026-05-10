import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET: admin gets all cards, token gets restricted view
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const type = searchParams.get("type") || "author"; // author | co_narrator

  // Single card by ID
  const cardId = searchParams.get("id");
  if (cardId) {
    const { data, error } = await supabaseAdmin
      .from("board_cards").select("*").eq("id", cardId).single();
    if (error) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    return NextResponse.json({ card: data });
  }

  if (token) {
    // Token-based access
    if (type === "co_narrator") {
      // Co-narrator sees all their cards
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .select("id, title, author, cover_url, status, deadline, notes, author_notes, links, co_narrator")
        .eq("co_narrator", token)
        .order("sort_order");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ cards: data, view: "co_narrator" });
    } else {
      // Author sees only their card
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .select("id, title, author, cover_url, status, deadline, author_notes, links")
        .eq("author_token", token)
        .single();
      if (error) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return NextResponse.json({ card: data, view: "author" });
    }
  }

  // Admin: get all cards
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("*")
    .order("status")
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

function makeSlug(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// POST: create card (admin)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title, author = "", cover_url = "",
      status = "contracted",          // default to contracted (not audition) so card is visible
      deadline, notes = "", author_notes = "",
      links = [], co_narrator = "", sort_order = 0, chapters = [],
      subtitle = "", tags = [], description = "",
      audible_link = "", ar_link = "",
      word_count = 0, first15_due,
      pfh_rate = 0, payment_type = "pfh", first_15_complete = false,
      dean_message = "", author_email = "", slug = "",
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
      author_notes:      author_notes || "",
      links:             Array.isArray(links)    ? links    : [],
      co_narrator:       co_narrator || "",
      sort_order:        sort_order  ?? 0,
      chapters:          Array.isArray(chapters) ? chapters : [],
      subtitle:          subtitle    || "",
      tags:              Array.isArray(tags)     ? tags     : [],
      description:       description || "",
      audible_link:      audible_link || "",
      ar_link:           ar_link      || "",
      word_count:        word_count   ?? 0,
      pfh_rate:          pfh_rate     ?? 0,
      payment_type:      payment_type || "pfh",
      first_15_complete: first_15_complete ?? false,
      slug:              slug || makeSlug(title.trim()),
    };
    // Date columns must be null (not "") when empty — Supabase rejects empty strings for date/timestamptz
    insertData.deadline    = deadline    || null;
    insertData.first15_due = first15_due || null;
    if (dean_message) insertData.dean_message = dean_message;
    if (author_email) insertData.author_email = author_email;

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

// PUT: update card (admin) or author_notes (token)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, token, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    if (token) {
      // Co-narrator can update notes only
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .update({ notes: fields.notes, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("co_narrator", token)
        .select().single();
      if (error) {
        console.error("PUT /api/board (token) Supabase error:", JSON.stringify(error));
        return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
      }
      return NextResponse.json({ success: true, card: data });
    }

    // Admin full update — only columns that actually exist on board_cards.
    // Keep this list in sync with the DB schema; do NOT add speculative columns.
    const allowed = [
      "title", "author", "cover_url", "status", "deadline", "notes",
      "author_notes", "links", "co_narrator", "sort_order", "chapters",
      "subtitle", "tags", "description", "audible_link", "ar_link",
      "word_count", "first15_due", "pfh_rate", "payment_type",
      "first_15_complete", "dean_message", "author_email", "author_token",
      "email_updates_enabled",
    ];
    const DATE_FIELDS = new Set(["deadline", "first15_due", "first_15_due"]);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields) {
        // Date columns must be null (not "") — Supabase rejects empty strings for date/timestamptz
        update[key] = DATE_FIELDS.has(key) ? (fields[key] || null) : fields[key];
      }
    }

    // Snapshot old status before update so we can log the change
    let oldStatus: string | null = null;
    if ("status" in fields) {
      const { data: cur } = await supabaseAdmin
        .from("board_cards").select("status").eq("id", id).single();
      oldStatus = cur?.status ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from("board_cards").update(update).eq("id", id).select().single();
    if (error) {
      console.error("PUT /api/board Supabase error:", JSON.stringify(error), "update keys:", Object.keys(update));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }

    // Log status change for batched author emails (fire-and-forget)
    if (oldStatus && fields.status && oldStatus !== fields.status) {
      void supabaseAdmin.from("status_change_log").insert({
        card_id: id,
        old_status: oldStatus,
        new_status: String(fields.status),
      });
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
