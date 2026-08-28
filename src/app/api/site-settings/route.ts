import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

/** check_site_setting() raises 22023; anything else is a genuine failure. */
function isValidationRefusal(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "22023";
}

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
  const denied = await requireAdmin();
  if (denied) return denied;
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
    // A validation refusal from check_site_setting() is the user's to fix, not
    // a server fault. This route validated NOTHING before Stage 9 — it accepts
    // any key with any value — so the trigger is the only rule it has ever had.
    const msg = e instanceof Error ? e.message : "Failed to update setting";
    const status = isValidationRefusal(e) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
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
    // A validation refusal from check_site_setting() is the user's to fix, not
    // a server fault. This route validated NOTHING before Stage 9 — it accepts
    // any key with any value — so the trigger is the only rule it has ever had.
    const msg = e instanceof Error ? e.message : "Failed to update setting";
    const status = isValidationRefusal(e) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
