import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto"; // Added for token generation

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const type = searchParams.get("type") || "author";
  const cardId = searchParams.get("id");

  if (cardId) {
    const { data, error } = await supabaseAdmin
      .from("board_cards").select("*").eq("id", cardId).single();
    if (error) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    return NextResponse.json({ card: data });
  }

  if (token) {
    if (type === "co_narrator") {
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .select("id, title, author, cover_url, status, deadline, notes, author_notes, links, co_narrator")
        .eq("co_narrator", token)
        .order("sort_order");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ cards: data, view: "co_narrator" });
    } else {
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .select("id, title, author, cover_url, status, deadline, author_notes, links, chapters")
        .eq("author_token", token)
        .single();
      if (error) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return NextResponse.json({ card: data, view: "author" });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("*")
    .order("status")
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, author = "", ...fields } = body;
    
    if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });

    // Generate a unique token for the author link
    const author_token = crypto.randomBytes(16).toString("hex");

    const { data, error } = await supabaseAdmin
      .from("board_cards")
      .insert({ 
        title: title.trim(), 
        author, 
        author_token, // FIXED: Now inserting the generated token
        cover_url: fields.cover_url || "",
        status: fields.status || "audition",
        deadline: fields.deadline || null,
        notes: fields.notes || "",
        author_notes: fields.author_notes || "",
        links: fields.links || [],
        co_narrator: fields.co_narrator || "",
        sort_order: fields.sort_order || 0,
        chapters: fields.chapters || [],
        subtitle: fields.subtitle || "",
        tags: fields.tags || [],
        description: fields.description || "",
        audible_link: fields.audible_link || "",
        ar_link: fields.ar_link || "",
        word_count: fields.word_count || 0,
        first15_due: fields.first15_due || null,
        pfh_rate: fields.pfh_rate || 0,
        payment_type: fields.payment_type || "pfh"
      })
      .select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    return NextResponse.json({ error: "Failed to create card." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, token, ...fields } = body;
    if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });

    if (token) {
      const { data, error } = await supabaseAdmin
        .from("board_cards")
        .update({ notes: fields.notes, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("co_narrator", token)
        .select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, card: data });
    }

    // List of fields admin is allowed to update
    const allowed = [
      "title", "author", "cover_url", "status", "deadline", "notes", 
      "author_notes", "links", "co_narrator", "sort_order", "chapters", 
      "subtitle", "tags", "description", "audible_link", "ar_link", 
      "word_count", "first15_due", "pfh_rate", "payment_type", "author_token"
    ];

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields) update[key] = fields[key];
    }

    const { data, error } = await supabaseAdmin
      .from("board_cards").update(update).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, card: data });
  } catch (e) {
    return NextResponse.json({ error: "Failed to update card." }, { status: 500 });
  }
}

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