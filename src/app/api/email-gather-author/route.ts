// POST /api/email-gather-author { authorName: string }
// Searches the Microsoft 365 inbox for emails from/about the given author
// and returns a deduplicated list of email addresses found in From/Reply-To fields.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ─── token (same logic as /api/email-scan) ───────────────────────────────────

async function getValidAccessToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("access_token, refresh_token, expires_at")
    .eq("service", "microsoft")
    .single();

  if (!data?.access_token) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 5 * 60 * 1000) return data.access_token;
  if (!data.refresh_token) return null;

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}/oauth2/v2.0/token`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID    ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        refresh_token: data.refresh_token,
        grant_type:    "refresh_token",
        scope:         "Mail.Read offline_access",
      }),
    }
  );

  if (!res.ok) return null;

  const tokens = await res.json();
  const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  await supabaseAdmin.from("admin_integrations")
    .update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? data.refresh_token, expires_at: newExpiry })
    .eq("service", "microsoft");

  return tokens.access_token as string;
}

// ─── Graph search ─────────────────────────────────────────────────────────────

type GraphMessage = {
  from?:    { emailAddress: { name: string; address: string } };
  replyTo?: { emailAddress: { name: string; address: string } }[];
};

// Common automated/noreply addresses to exclude
const SKIP_PATTERNS = [
  /noreply/i, /no-reply/i, /donotreply/i, /do-not-reply/i,
  /mailer/i,  /notifications?@/i, /updates?@/i, /support@/i,
  /admin@/i,  /bounce/i, /amazon\.com$/i, /acx\.com$/i,
];

function isHuman(email: string): boolean {
  return !SKIP_PATTERNS.some(p => p.test(email));
}

async function searchMessages(token: string, query: string): Promise<GraphMessage[]> {
  // $search can't be combined with $filter for date — fetch top results and filter by relevance
  const searchParam = encodeURIComponent(`"${query}"`);
  const url = `https://graph.microsoft.com/v1.0/me/messages?$search=${searchParam}&$select=from,replyTo&$top=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("Graph search failed:", await res.text());
    return [];
  }
  const data = await res.json();
  return data.value ?? [];
}

// ─── handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { authorName } = await req.json();
    if (!authorName?.trim()) {
      return NextResponse.json({ error: "authorName required" }, { status: 400 });
    }

    const token = await getValidAccessToken();
    if (!token) {
      return NextResponse.json({ error: "Connect Microsoft email first" }, { status: 401 });
    }

    const name = authorName.trim();

    // Run two passes: full name, then last name only (as a fallback to catch more)
    const nameParts  = name.split(/\s+/);
    const lastName   = nameParts[nameParts.length - 1];
    const queries    = [name, lastName !== name ? lastName : null].filter(Boolean) as string[];

    const allMessages: GraphMessage[] = [];
    for (const q of queries) {
      const msgs = await searchMessages(token, q);
      allMessages.push(...msgs);
    }

    // Collect unique human email addresses from From and Reply-To fields
    const seen = new Set<string>();
    const emails: string[] = [];

    for (const msg of allMessages) {
      const candidates: string[] = [
        msg.from?.emailAddress?.address,
        ...(msg.replyTo ?? []).map(r => r.emailAddress?.address),
      ].filter((e): e is string => Boolean(e));

      for (const addr of candidates) {
        const normalized = addr.trim().toLowerCase();
        if (!seen.has(normalized) && isHuman(normalized)) {
          seen.add(normalized);
          emails.push(addr.trim());
        }
      }
    }

    return NextResponse.json({ emails, searched: allMessages.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("email-gather-author failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
