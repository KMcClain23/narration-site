import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.

// Admin — all demos including inactive
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await supabaseAdmin
    .from("demos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
