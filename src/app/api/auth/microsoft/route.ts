// Required env vars:
//   MICROSOFT_CLIENT_ID     — Azure App Registration client ID
//   MICROSOFT_CLIENT_SECRET — Azure App Registration client secret
//   MICROSOFT_TENANT_ID     — Azure tenant ID (or "common" for multi-tenant)
//
// Required Supabase migration (run once in your Supabase SQL editor):
//   create table if not exists admin_integrations (
//     id         uuid        primary key default gen_random_uuid(),
//     service    text        not null,
//     access_token  text,
//     refresh_token text,
//     expires_at timestamptz,
//     created_at timestamptz default now()
//   );
//   create unique index if not exists admin_integrations_service_idx
//     on admin_integrations(service);

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

const CLIENT_ID   = process.env.MICROSOFT_CLIENT_ID   ?? "";
const TENANT_ID   = process.env.MICROSOFT_TENANT_ID   ?? "common";
const REDIRECT_URI = "https://www.dmnarration.com/api/auth/microsoft/callback";
const SCOPES       = "Mail.Read offline_access";

export async function GET() {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: "MICROSOFT_CLIENT_ID not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: "code",
    redirect_uri:  REDIRECT_URI,
    response_mode: "query",
    scope:         SCOPES,
    state,
  });

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;

  const res = NextResponse.redirect(authUrl);
  // Short-lived cookie for CSRF state validation
  res.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure:   true,
    sameSite: "lax",
    maxAge:   600, // 10 minutes
    path:     "/",
  });
  return res;
}
