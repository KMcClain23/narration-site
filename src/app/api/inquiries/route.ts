import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/require-admin";
import { redis, INQUIRY_KEY, ARCHIVE_KEY, parseInquiryList } from "@/lib/inquiries";


/**
 * GET: Protected - Admin views all inquiries
 */
export async function GET() {
  // Was a direct comparison of the dmn_admin_key cookie against
  // ADMIN_SECRET_KEY, which would have kept accepting that credential after it
  // was retired everywhere else. Same question as every other admin surface now.
  if (!(await isAdminRequest())) {
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
  // Guarded like the GET beside it, which it was not. Archiving takes an id and
  // nothing else, so an unauthenticated caller could move a client's enquiry out
  // of the inbox — the message survives in the archive, but it stops being seen,
  // which for an enquiry is most of the damage.
  // Was a direct comparison of the dmn_admin_key cookie against
  // ADMIN_SECRET_KEY, which would have kept accepting that credential after it
  // was retired everywhere else. Same question as every other admin surface now.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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