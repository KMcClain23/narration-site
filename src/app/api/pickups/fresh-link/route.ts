import { NextResponse } from "next/server";

import { currentSession } from "@/lib/supabase/session";
import { sendFreshLink } from "@/lib/pickup-fresh-link";

export const dynamic = "force-dynamic";

/**
 * "Send a fresh link" — one token, one email, nothing else.
 *
 * ── WHY THE GATE IS ADMIN OR EDITOR ────────────────────────────────────────
 *
 * The same pair who can send the chapter in the first place. Marizete is the
 * one who hears "my link doesn't work" — the pickup email's reply-to reaches
 * the sending address, and she works the batches — so an admin-only button
 * would leave the promise on the expired page depending on Dean being at a
 * desk.
 *
 * THE GATE IS HERE AND NOT IN THE DATABASE, because this route holds the
 * service key: `issue_pickup_link` is service_role-only by design, and refuses
 * every other caller, so no gate inside it could see who is asking. That makes
 * this handler the only thing standing in front of a credential mint, which is
 * why it checks the session itself rather than relying on middleware.ts — route
 * handlers are not in that matcher.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * No pickup status moves. No manifest is filed. No clip is cut. No
 * returned-notification fires. Those all belong to the send, and this is not
 * one — see the header of pickup-fresh-link.ts for why a second send path is
 * the thing being avoided.
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
    return NextResponse.json(
      { error: "Expected { cardId, chapter, narratorId }" },
      { status: 400 },
    );
  }

  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const narratorId = typeof body.narratorId === "string" ? body.narratorId : "";
  // The chapter is free text and "0" is a legitimate value, so this checks the
  // TYPE and not the truthiness — `!chapter` would reject "0" as missing.
  const chapter = typeof body.chapter === "string" ? body.chapter : null;
  if (!cardId || !narratorId || chapter === null) {
    return NextResponse.json(
      { error: "Expected { cardId, chapter, narratorId }" },
      { status: 400 },
    );
  }

  const outcome = await sendFreshLink(cardId, chapter, narratorId);

  // A REFUSAL IS A 200 CARRYING A REASON, not a 4xx. Every one of them is a
  // true statement about the batch — nothing to replace, everything closed, no
  // address on file — and the caller's job is to put that sentence on screen.
  // Flattening them into a status code is how "she has no email" would arrive
  // as "Bad Request".
  return NextResponse.json({ outcome });
}
