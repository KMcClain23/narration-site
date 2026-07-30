import { NextResponse } from "next/server";
import { redis, INQUIRY_KEY, ARCHIVE_KEY, parseInquiryList, isOlderThanDays } from "@/lib/inquiries";

// SECURITY GAP: this route is not covered by middleware.ts's matcher —
// page-level auth is enforced, but direct API access is unauthenticated.
// Deferred to Stage 7 cleanup or a standalone security pass.

/**
 * GET: Admin views all archived inquiries
 */
export async function GET() {
  const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
  return NextResponse.json(parseInquiryList(raw));
}

/**
 * PATCH: Admin restores a single archived inquiry back to active
 */
export async function PATCH(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === "string" ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(inquiry));
        const { archivedAt: _archivedAt, ...restored } = inquiry;
        await redis.lpush(INQUIRY_KEY, JSON.stringify(restored));
        return NextResponse.json({ success: true });
      }
    }
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  } catch (e) {
    console.error("[PATCH /api/inquiries/archived]", e);
    return NextResponse.json({ error: "Failed to restore inquiry" }, { status: 500 });
  }
}

/**
 * DELETE: single (body { id }), or bulk — { olderThanDays: 90 } or { all: true }.
 * Bulk deletes are permanent; the client is expected to confirm before calling.
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
    const archived = parseInquiryList(raw);

    if (body.all === true) {
      await Promise.all(archived.map(inq => redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(inq))));
      return NextResponse.json({ success: true, deleted: archived.length });
    }

    if (typeof body.olderThanDays === "number") {
      const toDelete = archived.filter(inq => isOlderThanDays(inq, body.olderThanDays));
      await Promise.all(toDelete.map(inq => redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(inq))));
      return NextResponse.json({ success: true, deleted: toDelete.length });
    }

    if (body.id) {
      const match = archived.find(inq => inq.id === body.id);
      if (!match) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
      await redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(match));
      return NextResponse.json({ success: true, deleted: 1 });
    }

    return NextResponse.json({ error: "id, olderThanDays, or all required" }, { status: 400 });
  } catch (e) {
    console.error("[DELETE /api/inquiries/archived]", e);
    return NextResponse.json({ error: "Failed to delete inquiries" }, { status: 500 });
  }
}
