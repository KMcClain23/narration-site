import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { id, title, author } = await req.json();
    if (!id || !title) return NextResponse.json({ error: "id and title required" }, { status: 400 });

    const q = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ""}`);
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY ?? "";
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${apiKey ? `&key=${apiKey}` : ""}`;

    const res = await fetch(url, { next: { revalidate: 86400 } });
    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    if (!info) return NextResponse.json({ enriched: false, reason: "not found in Google Books" });

    const updates: Record<string, unknown> = {};

    if (info.description && info.description.length > 60) {
      updates.description = info.description.slice(0, 600);
    }

    if (info.subtitle?.trim()) {
      updates.subtitle = info.subtitle.trim();
    }

    if (Array.isArray(info.categories) && info.categories.length > 0) {
      const raw = info.categories.flatMap((c: string) => c.split(" / ")).map((s: string) => s.trim());
      const filtered = raw.filter((c: string) => !["Fiction", "General", "Books", "Nonfiction"].includes(c));
      if (filtered.length) updates.tags = filtered.slice(0, 5);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ enriched: false, reason: "no new data found" });
    }

    const { error } = await supabaseAdmin.from("board_cards").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ enriched: true, updated: Object.keys(updates) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
