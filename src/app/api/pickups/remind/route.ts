import { NextResponse } from "next/server";

import { currentSession } from "@/lib/supabase/session";
import { sendPickupReminder } from "@/lib/pickup-reminder";

export const dynamic = "force-dynamic";

/**
 * Nudge a narrator about pickups already sent.
 *
 * The same gate as the fresh link — admin or editor — and applied here because
 * this route holds the service key to read a narrator's address. It issues no
 * token, revokes nothing, and moves no pickup, which is the whole difference
 * between it and /api/pickups/fresh-link.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session || (session.role !== "admin" && session.role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { cardId?: unknown; chapter?: unknown; narratorId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected { cardId, chapter, narratorId }" }, { status: 400 });
  }

  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const narratorId = typeof body.narratorId === "string" ? body.narratorId : "";
  // Type, not truthiness — "0" is a legitimate chapter.
  const chapter = typeof body.chapter === "string" ? body.chapter : null;
  if (!cardId || !narratorId || chapter === null) {
    return NextResponse.json({ error: "Expected { cardId, chapter, narratorId }" }, { status: 400 });
  }

  // A refusal is a 200 carrying a reason, as with the fresh link: every one of
  // them is a true statement about the batch that belongs on screen.
  const outcome = await sendPickupReminder(cardId, chapter, narratorId);
  return NextResponse.json({ outcome });
}
