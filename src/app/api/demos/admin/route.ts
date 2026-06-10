import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Admin — all demos including inactive
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("demos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
