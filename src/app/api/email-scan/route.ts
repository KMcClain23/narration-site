// Required env vars:
//   MICROSOFT_CLIENT_ID
//   MICROSOFT_CLIENT_SECRET
//   MICROSOFT_TENANT_ID

import { NextResponse } from "next/server";
import { graphToken } from "@/lib/microsoft-graph";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { ADMIN_COOKIE_NAME, isValidAdminKey } from "@/lib/admin-auth";

// ─── admin auth (same cookie pattern as other board routes) ───────────────────

// Was: "a cookie named dmn_admin_key exists and is non-empty", which any
// visitor could satisfy with document.cookie. Now compares against
// ADMIN_SECRET_KEY via the shared helper.
function isAdmin(req: Request): boolean {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.trim() === ADMIN_COOKIE_NAME) {
      return isValidAdminKey(rest.join("="));
    }
  }
  return false;
}

// ─── token management ─────────────────────────────────────────────────────────

const getValidAccessToken = graphToken;


// ─── GET — connection status ───────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("expires_at")
    .eq("service", "microsoft")
    .single();

  return NextResponse.json({ connected: !!data, expires_at: data?.expires_at ?? null });
}

// ─── POST — scan inbox and return AI-extracted suggestions ────────────────────

type Email = {
  subject:          string;
  bodyPreview:      string;
  receivedDateTime: string;
  from: { emailAddress: { name: string; address: string } };
};

type Suggestion = {
  emailIndex:          number;
  bookTitle:           string;
  cardId:              string;
  emailSubject:        string;
  senderName:          string;
  emailDate:           string;
  suggestedDeadline:   string | null;
  suggestedFirst15Date: string | null;
  notes:               string;
};

export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Validate Microsoft connection
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Microsoft account not connected or session expired. Click 'Connect Microsoft Email' to reconnect." },
      { status: 401 }
    );
  }

  // 2. Get active board cards for title matching
  const { data: cards } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, author, deadline, first15_due, status")
    .not("status", "in", '("released","audition")')
    .order("sort_order");

  if (!cards?.length) {
    return NextResponse.json({ suggestions: [], message: "No active books on the board to match against." });
  }

  // 3. Fetch last 90 days of emails from Microsoft Graph.
  //    $orderby is intentionally omitted — combining it with $filter on
  //    receivedDateTime causes a 400 on Graph v1.0 (no composite index).
  //    We sort client-side instead.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const graphParams = new URLSearchParams({
    "$filter": `receivedDateTime ge ${since}`,
    "$select": "subject,bodyPreview,from,receivedDateTime",
    "$top":    "100",
  });
  const graphRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?${graphParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!graphRes.ok) {
    const detail = await graphRes.text();
    console.error("Graph API error:", detail);
    return NextResponse.json(
      { error: "Failed to fetch emails from Microsoft. Token may have expired — try reconnecting." },
      { status: 502 }
    );
  }

  const graphData = await graphRes.json();
  const allEmails: Email[] = (graphData.value ?? []).sort(
    (a: Email, b: Email) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
  );

  // 4. Filter emails that mention any book title (first 25 chars, case-insensitive)
  const titleKeys = cards.map(c => ({ id: c.id, key: c.title.toLowerCase().slice(0, 25) }));

  const matchingEmails = allEmails.filter(email => {
    const text = `${email.subject} ${email.bodyPreview}`.toLowerCase();
    return titleKeys.some(({ key }) => text.includes(key));
  });

  if (!matchingEmails.length) {
    return NextResponse.json({
      suggestions:   [],
      emailsScanned: allEmails.length,
      emailsMatched: 0,
      message:       `Scanned ${allEmails.length} emails — none matched any book title on the board.`,
    });
  }

  // 5. Ask Claude to extract dates from matching emails
  const bookList = cards
    .map(c =>
      `- "${c.title}" (id: ${c.id}, deadline: ${c.deadline ?? "none"}, first15_due: ${c.first15_due ?? "none"})`
    )
    .join("\n");

  const emailList = matchingEmails
    .slice(0, 25)
    .map(
      (e, i) =>
        `[Email ${i + 1}]\n` +
        `From: ${e.from.emailAddress.name} <${e.from.emailAddress.address}>\n` +
        `Date: ${e.receivedDateTime}\n` +
        `Subject: ${e.subject}\n` +
        `Preview: ${e.bodyPreview.slice(0, 400)}`
    )
    .join("\n---\n");

  const anthropic = new Anthropic();
  const aiResponse = await anthropic.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role:    "user",
        content: `You are extracting deadline and scheduling information from audiobook production emails.

Active books (match by title):
${bookList}

Emails to analyze:
${emailList}

For each email that mentions a specific date, deadline, or schedule related to a book above, output one JSON object. Return ONLY a JSON array — no prose, no markdown fence.

Schema:
{
  "emailIndex": number,
  "bookTitle": string,
  "cardId": string,
  "emailSubject": string,
  "senderName": string,
  "emailDate": string (ISO 8601),
  "suggestedDeadline": string | null (YYYY-MM-DD),
  "suggestedFirst15Date": string | null (YYYY-MM-DD),
  "notes": string (one sentence summary)
}

Skip emails with no actionable dates. Return [] if nothing found.`,
      },
    ],
  });

  let suggestions: Suggestion[] = [];
  try {
    const raw = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]);
  } catch {
    console.error("Failed to parse Claude suggestions from email scan");
  }

  return NextResponse.json({
    suggestions,
    emailsScanned: allEmails.length,
    emailsMatched: matchingEmails.length,
  });
}
