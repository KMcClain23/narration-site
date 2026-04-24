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
    const { name, bio = "", website = "", amazon = "", instagram = "", tiktok = "", facebook = "", goodreads = "" } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Author name is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("authors")
      .insert({ name: name.trim(), bio, website, amazon, instagram, tiktok, facebook, goodreads })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, author: data });
  } catch (error) {
    console.error("POST /api/authors failed:", error);
    return NextResponse.json(
      { error: "Failed to create author.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "Author id is required." }, { status: 400 });
    }

    const payload: Record<string, string> = {};
    for (const key of ["name", "bio", "website", "amazon", "instagram", "tiktok", "facebook", "goodreads"]) {
      if (key in fields) payload[key] = (fields[key] ?? "").trim();
    }

    if (!payload.name) {
      return NextResponse.json({ error: "Author name cannot be empty." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("authors")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, author: data });
  } catch (error) {
    console.error("PUT /api/authors failed:", error);
    return NextResponse.json(
      { error: "Failed to update author.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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
