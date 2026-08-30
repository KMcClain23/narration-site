// The name of a cookie that is no longer a credential.
//
// dmn_admin_key used to BE the admin login: a shared secret in a cookie,
// compared against ADMIN_SECRET_KEY. That path is gone — the browser signs in
// with email and password, and nothing accepts this cookie anywhere.
//
// The constant remains for exactly one reason: middleware.ts deletes any stale
// cookie of this name on the next visit. A credential that no longer works but
// is still sitting in the browser is worse than one that is simply absent,
// because it looks like a login someone might try to repair.
//
// THE TIMING-SAFE COMPARATOR THAT LIVED HERE HAS BEEN DELETED, deliberately and
// not as tidying. While it existed, adding a cookie check back was one import
// away, and the whole point of the migration is that a shared secret cannot
// express WHO you are — so it cannot express that Marizete is an editor.
//
// ADMIN_SECRET_KEY itself is still in the environment and still required. It is
// the internal service-to-server bearer for the manuscript parse chain; see
// isAdminOrInternal in require-admin.ts, which explains what removing it breaks
// and how silently.
//
// This module is imported by src/middleware.ts, which runs on the edge runtime,
// so it must not import next/headers, next/navigation or "server-only".

export const ADMIN_COOKIE_NAME = "dmn_admin_key";
