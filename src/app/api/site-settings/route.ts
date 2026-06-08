import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();

  return NextResponse.json({ value: data?.value ?? null });
}

export async function PATCH(req: Request) {
  try {
    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }
    const stored = typeof value === "string" ? value : JSON.stringify(value);
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert({ key, value: stored, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update setting";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("site_settings")
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update setting";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
