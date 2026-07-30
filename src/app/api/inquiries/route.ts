import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis, INQUIRY_KEY, ARCHIVE_KEY, parseInquiryList } from "@/lib/inquiries";

const COOKIE_NAME = "dmn_admin_key";

/**
 * POST: Public - Author/Narrator submits a request
 *
 * Currently unused in production — the live contact form submits through the
 * `sendEmail` server action (src/app/actions/sendEmail.ts), which writes to
 * Redis directly and sends the Resend emails itself. Left in place rather
 * than deleted; retiring it is Stage 7 cleanup material.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, role, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const newInquiry = {
      id: crypto.randomUUID(),
      name,
      email,
      role, // "Author", "Narrator", or "Other"
      message,
      status: "unread",
      createdAt: new Date().toISOString(),
    };

    await redis.lpush(INQUIRY_KEY, JSON.stringify(newInquiry));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send inquiry" }, { status: 500 });
  }
}

/**
 * GET: Protected - Admin views all inquiries
 */
export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
  return NextResponse.json(parseInquiryList(raw));
}

// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.
/**
 * PATCH: Admin archives a single active inquiry (dmn_inquiries -> dmn_inquiries_archived)
 */
export async function PATCH(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === "string" ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(INQUIRY_KEY, 1, JSON.stringify(inquiry));
        await redis.lpush(ARCHIVE_KEY, JSON.stringify({ ...inquiry, archivedAt: new Date().toISOString() }));
        return NextResponse.json({ success: true });
      }
    }
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  } catch (e) {
    console.error("[PATCH /api/inquiries]", e);
    return NextResponse.json({ error: "Failed to archive inquiry" }, { status: 500 });
  }
}