import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CLIENT_ID    = process.env.MICROSOFT_CLIENT_ID    ?? "";
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const TENANT_ID    = process.env.MICROSOFT_TENANT_ID    ?? "common";
const REDIRECT_URI  = "https://www.dmnarration.com/api/auth/microsoft/callback";

function readCookie(req: Request, name: string): string {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === name) return v.join("=").trim();
  }
  return "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Always land back on the board — middleware will pass through because the
  // admin cookie is same-site at this point in the redirect chain.
  const dest = new URL("/board", req.url);

  if (error) {
    const desc = encodeURIComponent(searchParams.get("error_description") ?? error);
    dest.searchParams.set("microsoft", "error");
    dest.searchParams.set("ms_error", desc);
    return NextResponse.redirect(dest.toString());
  }

  // Validate CSRF state
  const storedState = readCookie(req, "ms_oauth_state");
  if (!state || !storedState || state !== storedState) {
    dest.searchParams.set("microsoft", "error");
    dest.searchParams.set("ms_error", "invalid_state");
    return NextResponse.redirect(dest.toString());
  }
  if (!code) {
    dest.searchParams.set("microsoft", "error");
    dest.searchParams.set("ms_error", "no_code");
    return NextResponse.redirect(dest.toString());
  }

  // Exchange authorisation code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
        scope:         "Mail.Read offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("Microsoft token exchange failed:", await tokenRes.text());
    dest.searchParams.set("microsoft", "error");
    dest.searchParams.set("ms_error", "token_exchange_failed");
    return NextResponse.redirect(dest.toString());
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Upsert using the unique index on (service)
  await supabaseAdmin.from("admin_integrations").upsert(
    {
      service:       "microsoft",
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at:    expiresAt,
    },
    { onConflict: "service" }
  );

  dest.searchParams.set("microsoft", "connected");
  const res = NextResponse.redirect(dest.toString());
  res.cookies.delete("ms_oauth_state");
  return res;
}
