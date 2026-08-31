import { NextResponse } from "next/server";
import { clientIp, markReturnedByToken, rateLimit } from "@/lib/pickup-link";
import { notifyEditorsOfReturn } from "@/lib/notify-returned";

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

  // ── STATE FIRST, THEN EMAIL — AND THIS IS THE OPPOSITE OF send-pickups ────
  //
  // send-pickups emails first and flips to `sent` only on acceptance, so a
  // pickup can never read as sent when no email went. Here the order is
  // reversed, ON PURPOSE:
  //
  //   Ann's re-record ACTUALLY HAPPENED. The state must record that whether or
  //   not Marizete's notification lands. Emailing first would risk telling her
  //   to go and check something that is not marked — and if the email failed we
  //   would be discarding a fact about the world to keep a message tidy.
  //
  // The two orderings look inconsistent and someone will eventually "fix" one
  // to match the other. They are answering different questions: there, the email
  // IS the delivery; here, the state is, and the email is a convenience on top.
  // If this call throws or fails, the rows stay returned and the failure is
  // logged — notifyEditorsOfReturn never raises.
  //
  // One call for the whole batch: five pickups returning produce one email
  // naming five, because this is the batch boundary rather than a row hook.
  if (moved > 0) {
    const outcome = await notifyEditorsOfReturn(token);
    if ("failed" in outcome) {
      console.error(`returned notification failed after ${moved} row(s) moved:`, outcome.failed);
    } else if ("skipped" in outcome) {
      console.warn(`returned notification skipped after ${moved} row(s) moved:`, outcome.skipped);
    }
  }

  // A dead token and an empty selection are the same answer here — 200 with
  // moved: 0 — for the same reason the page says only "expired": a distinct
  // status for "that token is real but stale" would confirm the token is real.
  // The notification's outcome is deliberately NOT in this payload: it is not
  // Ann's business whether Marizete's mail server was reachable.
  return NextResponse.json({ moved });
}
