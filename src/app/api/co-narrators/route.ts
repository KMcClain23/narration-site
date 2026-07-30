// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.
// See ContactsClient's /api/contacts pattern for isAdmin() reference.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("co_narrators")
    .select("*")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ co_narrators: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    name, bio = "", website = "", amazon = "", instagram = "", tiktok = "", facebook = "", goodreads = "", email = "",
    location = "", preferred_contact = "", skills = [], representation = "", notes = "",
  } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("co_narrators")
    .insert({
      name: name.trim(), bio, website, amazon, instagram, tiktok, facebook, goodreads, email,
      location, preferred_contact, skills: Array.isArray(skills) ? skills : [], representation, notes,
    })
    .select().single();
  if (error) {
    console.error("POST /api/co-narrators Supabase error:", JSON.stringify(error));
    return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
  }
  return NextResponse.json({ success: true, co_narrator: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const payload: Record<string, string | string[] | null> = {};
  for (const key of ["name", "bio", "website", "amazon", "instagram", "tiktok", "facebook", "goodreads", "email", "location", "preferred_contact", "representation", "notes"]) {
    if (key in fields) payload[key] = (fields[key] ?? "").trim();
  }
  // photo_url is nullable (not a trimmed text field) — null explicitly clears it
  if ("photo_url" in fields) payload.photo_url = fields.photo_url || null;
  // skills is a text[] column, not a trimmed string
  if ("skills" in fields) payload.skills = Array.isArray(fields.skills) ? fields.skills : [];
  const { data, error } = await supabaseAdmin
    .from("co_narrators").update(payload).eq("id", id).select().single();
  if (error) {
    console.error("PUT /api/co-narrators Supabase error:", JSON.stringify(error));
    return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
  }
  return NextResponse.json({ success: true, co_narrator: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const { error } = await supabaseAdmin.from("co_narrators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
