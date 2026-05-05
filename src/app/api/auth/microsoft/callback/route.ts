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
  const board = new URL("/board", req.url).toString();

  if (error) {
    const desc = encodeURIComponent(searchParams.get("error_description") ?? error);
    return NextResponse.redirect(`${board}?ms_error=${desc}`);
  }

  // Validate CSRF state
  const storedState = readCookie(req, "ms_oauth_state");
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${board}?ms_error=invalid_state`);
  }
  if (!code) {
    return NextResponse.redirect(`${board}?ms_error=no_code`);
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
    return NextResponse.redirect(`${board}?ms_error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Upsert into admin_integrations (delete + insert to avoid needing a unique constraint)
  await supabaseAdmin.from("admin_integrations").delete().eq("service", "microsoft");
  await supabaseAdmin.from("admin_integrations").insert({
    service:       "microsoft",
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at:    expiresAt,
  });

  const res = NextResponse.redirect(`${board}?ms_connected=1`);
  res.cookies.delete("ms_oauth_state");
  return res;
}
