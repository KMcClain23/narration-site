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
  const { name, bio = "", website = "", amazon = "", instagram = "", tiktok = "", facebook = "", goodreads = "" } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("co_narrators")
    .insert({ name: name.trim(), bio, website, amazon, instagram, tiktok, facebook, goodreads })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, co_narrator: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const payload: Record<string, string> = {};
  for (const key of ["name", "bio", "website", "amazon", "instagram", "tiktok", "facebook", "goodreads"]) {
    if (key in fields) payload[key] = (fields[key] ?? "").trim();
  }
  const { data, error } = await supabaseAdmin
    .from("co_narrators").update(payload).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, co_narrator: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required." }, { status: 400 });
  const { error } = await supabaseAdmin.from("co_narrators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
