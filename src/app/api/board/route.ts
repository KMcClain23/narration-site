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
    const { title, author = "", cover_url = "", status = "audition", deadline, notes = "", author_notes = "", links = [], co_narrator = "", sort_order = 0, chapters = [], subtitle = "", tags = [], description = "", audible_link = "", ar_link = "", word_count = 0, first15_due, pfh_rate = 0, payment_type = "pfh", first_15_complete = false, dean_message = "", author_email = "", slug = "" } = body;
    if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });
    const resolvedSlug = slug || makeSlug(title.trim());
    const { data, error } = await supabaseAdmin
      .from("board_cards")
      .insert({ title: title.trim(), author, cover_url, status, deadline: deadline || null, notes, author_notes, links, co_narrator, sort_order, chapters, subtitle, tags, description, audible_link, ar_link, word_count, first15_due: first15_due || null, pfh_rate, payment_type, first_15_complete, dean_message: dean_message || null, author_email: author_email || null, slug: resolvedSlug })
      .select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/board failed:", msg);
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
      if (error) throw error;
      return NextResponse.json({ success: true, card: data });
    }

    // Admin full update
    const allowed = ["title", "author", "cover_url", "status", "deadline", "notes", "author_notes", "links", "co_narrator", "sort_order", "chapters", "subtitle", "tags", "description", "audible_link", "ar_link", "word_count", "first15_due", "pfh_rate", "payment_type", "first_15_complete", "dean_message", "author_email", "slug"];
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields) update[key] = fields[key];
    }
    // Auto-generate slug from title if title changed but slug wasn't explicitly provided
    if ("title" in fields && fields.title && !("slug" in fields)) {
      update.slug = makeSlug(String(fields.title).trim());
    }
    const { data, error } = await supabaseAdmin
      .from("board_cards").update(update).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    return NextResponse.json({ error: "Failed to update card." }, { status: 500 });
  }
}

// DELETE: admin only
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
    const { error } = await supabaseAdmin.from("board_cards").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}
