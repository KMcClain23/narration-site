// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.
// See ContactsClient's /api/contacts pattern for isAdmin() reference.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest, requireAdmin } from "@/lib/require-admin";

/**
 * A cleared email is NULL, never ''.
 *
 * Both were rendered as an em dash on the Contacts page, so four narrators with
 * NO address looked exactly like four with one withheld — which is how "every
 * narrator has an address" came to be reported from a screen that could not tell
 * the difference. co_narrators now has
 *   CHECK (email IS NULL OR btrim(email) <> '')
 * and this is the writer that has to agree with it: without this line the
 * constraint rejects every save that clears the field, and the Contacts form
 * breaks on a change that looks like a data fix.
 *
 * ONLY email is treated this way. The other text columns keep '' deliberately —
 * nothing distinguishes absent from blank for a bio, and widening this would
 * change what a dozen pages render for reasons unrelated to the bug.
 */
function emailOrNull(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  return v === "" ? null : v;
}

// Mirrors PUBLIC_AUTHOR_COLUMNS in ../authors/route.ts — the public pages
// show a name, bio, photo and links; email, location, preferred_contact,
// representation and notes stay admin-only.
const PUBLIC_CO_NARRATOR_COLUMNS =
  "id, name, bio, photo_url, website, amazon, goodreads, instagram, tiktok, facebook";

export async function GET() {
  const isAdmin = await isAdminRequest();

  const { data, error } = await supabaseAdmin
    .from("co_narrators")
    .select(isAdmin ? "*" : PUBLIC_CO_NARRATOR_COLUMNS)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ co_narrators: data });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await req.json();
  const {
    name, bio = "", website = "", amazon = "", instagram = "", tiktok = "", facebook = "", goodreads = "", email = "",
    location = "", preferred_contact = "", skills = [], representation = "", notes = "",
  } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("co_narrators")
    .insert({
      name: name.trim(), bio, website, amazon, instagram, tiktok, facebook, goodreads,
      email: emailOrNull(email),
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
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const payload: Record<string, string | string[] | null> = {};
  for (const key of ["name", "bio", "website", "amazon", "instagram", "tiktok", "facebook", "goodreads", "location", "preferred_contact", "representation", "notes"]) {
    if (key in fields) payload[key] = (fields[key] ?? "").trim();
  }
  // email is NOT in that list: it is the one text column where blank means
  // absent rather than empty, and the CHECK constraint enforces the difference.
  if ("email" in fields) payload.email = emailOrNull(fields.email);
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
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const { error } = await supabaseAdmin.from("co_narrators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
