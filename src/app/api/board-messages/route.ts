import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

const COOKIE = "dmn_admin_key";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return !!c.get(COOKIE)?.value;
}

async function verifyToken(cardId: string, token: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("board_cards")
    .select("id")
    .eq("id", cardId)
    .eq("author_token", token)
    .single();
  return !!data;
}

// GET ?cardId=&token=   → thread for one card
// GET ?summary=true     → unread-from-author counts for all cards (admin only)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cardId  = searchParams.get("cardId");
  const token   = searchParams.get("token");
  const summary = searchParams.get("summary");

  if (summary === "true") {
    if (!await isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data } = await supabaseAdmin
      .from("board_messages")
      .select("card_id")
      .eq("sender", "author")
      .eq("read", false);
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      counts[row.card_id] = (counts[row.card_id] || 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const admin = await isAdmin();
  if (!admin) {
    if (!token || !await verifyToken(cardId, token))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("board_messages")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

// POST { cardId, text, sender, senderName, token? }
export async function POST(req: Request) {
  const { cardId, text, sender, senderName, token } = await req.json();

  if (!cardId || !text?.trim() || !sender)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const admin = await isAdmin();
  if (sender === "dean") {
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    if (!token || !await verifyToken(cardId, token))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("board_messages")
    .insert({
      card_id:     cardId,
      sender,
      sender_name: senderName || (sender === "dean" ? "Dean Miller" : "Author"),
      text:        text.trim(),
      read:        false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data });
}

// PATCH { cardId, viewedBy: "dean"|"author", token? }
// marks messages from the OTHER party as read
export async function PATCH(req: Request) {
  const { cardId, viewedBy, token } = await req.json();

  if (!cardId || !viewedBy)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const admin = await isAdmin();
  if (viewedBy === "dean") {
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    if (!token || !await verifyToken(cardId, token))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabaseAdmin
    .from("board_messages")
    .update({ read: true })
    .eq("card_id", cardId)
    .eq("sender", viewedBy === "dean" ? "author" : "dean")
    .eq("read", false);

  return NextResponse.json({ ok: true });
}
