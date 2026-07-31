import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis, INQUIRY_KEY, ARCHIVE_KEY, parseInquiryList } from "@/lib/inquiries";

const COOKIE_NAME = "dmn_admin_key";

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