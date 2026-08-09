// Shared admin key validation.
//
// This module is imported by src/middleware.ts, which runs on the edge
// runtime — so it must NOT import next/headers, next/navigation, or
// "server-only", none of which are available there. The server-component
// side lives in src/lib/require-admin.ts and imports this.

export const ADMIN_COOKIE_NAME = "dmn_admin_key";

/**
 * Best-effort constant-time string compare.
 *
 * Node's crypto.timingSafeEqual is not available on the edge runtime, so this
 * is done by hand. It is honestly only best-effort: a JIT is free to optimize
 * the loop, and JS gives no real guarantee of constant time. It costs
 * nothing and removes the trivially-exploitable early-exit that === has.
 *
 * Length is compared first and therefore leaks, which is standard and
 * acceptable — the secret's length is not the secret.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Whether a cookie value is the configured admin key.
 *
 * Fails closed when ADMIN_SECRET_KEY is unset: an unconfigured deployment
 * locks admin out rather than letting everyone in. This matters because the
 * previous gate did the opposite — it treated any non-empty cookie as valid,
 * so a missing secret was indistinguishable from a correct one.
 *
 * Both sides are trimmed to match /api/admin/login, which trims the secret
 * before storing it in the cookie. Without that, a stray trailing newline in
 * the env var would set a cookie that could never validate.
 */
export function isValidAdminKey(cookieValue: string | undefined | null): boolean {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  if (!secret) return false;

  const provided = String(cookieValue ?? "").trim();
  if (!provided) return false;

  return timingSafeEqual(provided, secret);
}
