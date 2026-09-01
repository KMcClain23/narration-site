import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/require-admin";
import { notifyEditorsOfAdminReturn } from "@/lib/notify-returned";

export const dynamic = "force-dynamic";

/**
 * Tell the editor that Dean marked a pickup re-recorded himself.
 *
 * ── NOTIFICATION ONLY. THE STATE CHANGE ALREADY HAPPENED. ─────────────────
 *
 * /pickups calls mark_pickup_returned directly with the user's own JWT, so the
 * admin gate is applied by the database against a real caller. This route does
 * not repeat that write and could not: it holds the service key, and a second
 * path that flips pickup state is the thing this codebase keeps removing.
 *
 * So the ordering here is the same as the cron's filing step and for the same
 * reason: the pickup is ALREADY returned, and nothing about a failed email
 * makes that untrue. A failure is reported and logged, never rolled back.
 */
export async function POST(req: Request) {
  // Admin only — the same account that may mark it returned.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pickupId: string | null = null;
  try {
    pickupId = (await req.json())?.pickupId ?? null;
  } catch {
    return NextResponse.json({ error: "Expected { pickupId }" }, { status: 400 });
  }
  if (!pickupId) return NextResponse.json({ error: "Expected { pickupId }" }, { status: 400 });

  const outcome = await notifyEditorsOfAdminReturn(pickupId);
  return NextResponse.json({ outcome });
}
