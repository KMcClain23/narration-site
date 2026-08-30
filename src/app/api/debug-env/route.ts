import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/require-admin";

// Admin-only diagnostic: are the environment variables PRESENT. It deliberately
// does not report their values.
//
// Its gate was a direct comparison of the dmn_admin_key cookie, which would have
// left this route standing on a credential nothing issues any more. It now asks
// the same question every other admin surface asks.
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The key's length and first ten characters used to be returned here, which
  // contradicted this route's own description. A prefix is not a whole key, but
  // it is not nothing either, and "is it set" is the question actually being
  // asked. Presence only.
  const vars = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
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
