import { NextResponse } from "next/server";
import { clientIp, markReturnedByToken, rateLimit } from "@/lib/pickup-link";

/**
 * The narrator's one write, and the only unauthenticated write in the app.
 *
 * NO SESSION, BY DESIGN — the token IS the credential. Which is why every other
 * guarantee has to hold in the database rather than here:
 *
 *   - `anon` has EXECUTE on none of the functions. This route holds the service
 *     key; the browser holds only a token and a shaped payload.
 *   - `mark_returned_by_token` re-checks every id against the token's own batch,
 *     so the array below is untrusted input all the way down. Filtering here
 *     instead would look identical on the happy path and hold nothing on the
 *     unhappy one.
 *   - It can only move sent → returned. It cannot resolve and cannot dismiss.
 *
 * THE TOKEN IS NEVER LOGGED, including on the error paths. It is a bearer
 * credential with no second factor, and a log line is a copy that outlives the
 * email.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  // Tighter than the read: this one writes.
  if (!(await rateLimit(ip, "confirm", 10, 60))) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  let token: string;
  let pickupIds: string[];
  try {
    const body = await req.json();
    token = String(body.token ?? "");
    pickupIds = Array.isArray(body.pickupIds) ? body.pickupIds.map(String) : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!token || pickupIds.length === 0) {
    return NextResponse.json({ error: "Nothing to confirm." }, { status: 400 });
  }
  // A sane ceiling. A batch is a chapter's pickups, not thousands.
  if (pickupIds.length > 200) {
    return NextResponse.json({ error: "Too many at once." }, { status: 400 });
  }

  const moved = await markReturnedByToken(token, pickupIds);

  // A dead token and an empty selection are the same answer here — 200 with
  // moved: 0 — for the same reason the page says only "expired": a distinct
  // status for "that token is real but stale" would confirm the token is real.
  return NextResponse.json({ moved });
}
