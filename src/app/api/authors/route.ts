// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.
// See ContactsClient's /api/contacts pattern for isAdmin() reference.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("authors")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, authors: data });
  } catch (error) {
    console.error("GET /api/authors failed:", error);
    return NextResponse.json(
      { error: "Failed to load authors.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name, bio = "", website = "", amazon = "", instagram = "", tiktok = "", facebook = "", goodreads = "", threads = "", email = "",
      location = "", preferred_contact = "", genres = [], notes = "",
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Author name is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("authors")
      .insert({
        name: name.trim(), bio, website, amazon, instagram, tiktok, facebook, goodreads, threads, email,
        location, preferred_contact, genres: Array.isArray(genres) ? genres : [], notes,
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/authors Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, author: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("POST /api/authors exception:", msg);
    return NextResponse.json({ error: msg || "Failed to create author." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "Author id is required." }, { status: 400 });
    }

    const payload: Record<string, string | string[] | null> = {};
    for (const key of ["name", "bio", "website", "amazon", "instagram", "tiktok", "facebook", "goodreads", "threads", "email", "location", "preferred_contact", "notes"]) {
      if (key in fields) payload[key] = (fields[key] ?? "").trim();
    }
    // photo_url is nullable (not a trimmed text field) — null explicitly clears it
    if ("photo_url" in fields) payload.photo_url = fields.photo_url || null;
    // genres is a text[] column, not a trimmed string
    if ("genres" in fields) payload.genres = Array.isArray(fields.genres) ? fields.genres : [];

    if (!payload.name) {
      return NextResponse.json({ error: "Author name cannot be empty." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("authors")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PUT /api/authors Supabase error:", JSON.stringify(error));
      return NextResponse.json(
        { error: error.message || JSON.stringify(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, author: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : JSON.stringify(e);
    console.error("PUT /api/authors exception:", msg);
    return NextResponse.json({ error: msg || "Failed to update author." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Author id is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("authors").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/authors failed:", error);
    return NextResponse.json(
      { error: "Failed to delete author.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
