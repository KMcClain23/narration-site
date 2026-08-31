/**
 * The ONE place that decides whether a request carries the internal bearer.
 *
 * `ADMIN_SECRET_KEY` stopped being a login in R1 and remains as exactly one
 * thing: a credential one part of this deployment sends to another over HTTPS.
 * It is what /process uses to call /extract, and since U4 it is also how the
 * standing guards reach the pages and routes they have to fetch.
 *
 * WHY THIS FILE EXISTS AT ALL, rather than the comparison being written in each
 * place that needs it. Three layers now accept this credential — middleware.ts,
 * the page gate in require-admin.ts, and the route handlers — and two
 * near-identical copies of an auth check that drift apart is the exact failure
 * this project keeps producing. One function, three callers, no second opinion.
 *
 * IT IS A HEADER AND MUST STAY ONE. A browser never attaches an Authorization
 * header on its own, so nothing on a page can be tricked into sending this the
 * way a cookie would be — which is most of the reason it is safe to widen a
 * route to it. Do not read it from a cookie, a query parameter or a body.
 *
 * NO ENV VAR, NO ACCESS. Missing returns false rather than throwing, because
 * this sits in the request path of every admin page; the loud failure lives in
 * the callers that need the secret to exist.
 */
export function matchesInternalBearer(authorization: string | null | undefined): boolean {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) return false;
  if (!authorization) return false;
  return authorization === `Bearer ${secret}`;
}

/** The header for one part of this app to call another with. */
export function internalBearerHeader(): Record<string, string> {
  const secret = process.env.ADMIN_SECRET_KEY;
  return secret ? { authorization: `Bearer ${secret}` } : {};
}
