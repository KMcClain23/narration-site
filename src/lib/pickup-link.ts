import "server-only";

import { Redis } from "@upstash/redis";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The narrator's tokenised link, server side.
 *
 * ── WHY THE SERVICE KEY AND NOT anon ───────────────────────────────────────
 *
 * `anon` holds EXECUTE on none of these functions, deliberately. The alternative
 * — granting anon a function that reads pickups — is a permanent widening of the
 * public role for one feature's convenience, and it outlives the feature. So the
 * token arrives at THIS server, which holds the service key, and only a shaped
 * payload goes back to the browser.
 *
 * ── THE RAW TOKEN IS NEVER LOGGED ──────────────────────────────────────────
 *
 * Not in a console line, not in an error, not in a response body. It is a
 * bearer credential with no second factor: anything that writes it down creates
 * a copy that outlives the email. Errors here name the operation, never the
 * argument.
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export type BatchRow = {
  card_id: string;
  book_title: string;
  chapter: string;
  narrator_name: string;
  pickup_id: string;
  timestamp_at: string;
  kind: string;
  said: string | null;
  should_be: string | null;
  note: string | null;
  status: string;
  /**
   * Non-null when a ±10s clip exists for this pickup.
   *
   * It is the PICKUP's id, not the OneDrive item id — the page builds a player
   * URL from it and the redirect resolves the real location server-side, so the
   * narrator's browser never learns a drive address.
   */
  clip_id: string | null;
  /** Why there is no clip. Null with a null clip_id means it was never tried. */
  clip_skip_reason: string | null;
};

/**
 * A fixed window per IP.
 *
 * A 32-byte token is not practically guessable, so this is not the thing
 * stopping a break-in — it is what makes an unauthenticated endpoint REFUSE
 * enumeration rather than quietly serve and log it. Fails OPEN on a Redis
 * outage: the token is still required, and taking the narrator's page down
 * because a cache is unreachable would be the worse failure.
 */
export async function rateLimit(
  ip: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const key = `pl:${bucket}:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds);
    return n <= limit;
  } catch {
    return true;
  }
}

/** Best-effort client IP. Vercel sets x-forwarded-for; the first hop is the client. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * One batch, or null.
 *
 * NULL COVERS EXPIRED, REVOKED AND UNKNOWN, because the function returns no
 * rows for all three and the page must not be able to tell a visitor which it
 * was — saying "expired" about a real token confirms the token is real.
 */
export async function batchByToken(token: string): Promise<BatchRow[] | null> {
  const { data, error } = await supabaseAdmin.rpc("pickup_batch_by_token", { p_token: token });
  if (error) {
    // The operation, never the argument.
    console.error("pickup_batch_by_token failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as BatchRow[];
  return rows.length > 0 ? rows : null;
}

/** Returns how many rows moved. 0 for a dead token or ids outside the batch. */
export async function markReturnedByToken(token: string, pickupIds: string[]): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("mark_returned_by_token", {
    p_token: token,
    p_pickup_ids: pickupIds,
  });
  if (error) {
    console.error("mark_returned_by_token failed:", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}
