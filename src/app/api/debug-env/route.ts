import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Admin-only diagnostic endpoint — checks env vars are present without exposing values
export async function GET() {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get("dmn_admin_key")?.value;
  const adminSecret = process.env.ADMIN_SECRET_KEY;

  // Require admin auth
  if (!adminCookie || adminCookie !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vars = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_length: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    ANTHROPIC_API_KEY_prefix: process.env.ANTHROPIC_API_KEY?.slice(0, 10) ?? "(not set)",
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    ADMIN_SECRET_KEY: !!process.env.ADMIN_SECRET_KEY,
    R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  return NextResponse.json(vars);
}
