import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { refreshSession } from "@/lib/supabase/middleware-session";
import { matchesInternalBearer } from "@/lib/internal-bearer";

/**
 * ONE AUTHENTICATION PATH: a Supabase session whose profiles.role is admin.
 *
 * The shared-secret cookie is no longer accepted anywhere, and any stale one is
 * DELETED on the way past — a cookie that still exists but no longer works is
 * indistinguishable, from the browser, from a login that has broken.
 *
 * ADMIN_SECRET_KEY itself is deliberately still in the environment. It is the
 * internal service-to-server bearer that /process uses to call /extract, and
 * removing it breaks the manuscript parse chain silently. See require-admin.ts.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always refreshed, on every matched route, so a session does not quietly
  // expire mid-visit. This is a side effect and decides nothing.
  const { res, role } = await refreshSession(req);

  // Protect /admin/* (except login) and /board/*
  const isAdminRoute = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isBoardRoute = pathname === "/board" || pathname === "/board/archive" || pathname.startsWith("/board/card");

  // New admin redesign routes (Stage 1+) — same cookie gate as everything else above.
  // /board itself is covered by isBoardRoute above, not here — it's now the
  // same page that used to live at /board-v2 (renamed Stage 7.6).
  const isNewAdminRoute =
    pathname === "/schedule" ||
    pathname.startsWith("/contacts") ||
    pathname === "/inquiries" ||
    pathname.startsWith("/tools") ||
    pathname === "/settings" ||
    pathname === "/payments" ||
    pathname === "/pickups" ||
    pathname === "/released";

  // The internal bearer gets through, so check-first-render can fetch these
  // pages and prove they RENDER. It has to be here as well as in the page gate:
  // a redirect at this layer never reaches the component, so the guard would be
  // measuring the login page instead of the page it names. Header-only, so no
  // browser attaches it by itself. See internal-bearer.ts.
  const isInternal = matchesInternalBearer(req.headers.get("authorization"));

  if ((isAdminRoute || isBoardRoute || isNewAdminRoute) && !isInternal) {
    // Editor is deliberately NOT enough: these routes are the admin, and an
    // editor who reaches them is sent to the login page, which now tells her she
    // is signed in and simply has no access here — rather than showing her a
    // form that reads as "your password was wrong".
    if (role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      // Carry where they were going, so signing in finishes the journey
      // instead of dropping everyone on the board to navigate again.
      url.search = "";
      url.searchParams.set("next", pathname);
      // The redirect is a DIFFERENT response object, so the clear at the bottom
      // of this function never touches it — and a redirect is exactly when a
      // stale cookie holder arrives. Found by looking for the Set-Cookie header
      // rather than trusting that calling the helper once was enough.
      const redirected = NextResponse.redirect(url);
      clearStaleAdminKey(req, redirected);
      return redirected;
    }

    // /admin root has no page — redirect authenticated users straight to /board
    if (pathname === "/admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/board";
      const redirected = NextResponse.redirect(url);
      clearStaleAdminKey(req, redirected);
      return redirected;
    }
  }

  // The refreshed response, so any rotated auth cookie is actually written.
  // Returning NextResponse.next() here instead would drop the refresh silently
  // and sessions would expire early for no visible reason.
  clearStaleAdminKey(req, res);
  return res;
}

/**
 * Delete a leftover dmn_admin_key.
 *
 * It grants nothing now, but leaving it in the browser means a stale credential
 * sitting there looking like a login — and the next person to find it in
 * devtools has to work out whether it matters. Removing it on the next visit
 * makes the answer visible instead of archaeological.
 */
function clearStaleAdminKey(req: NextRequest, res: NextResponse): void {
  if (req.cookies.get(ADMIN_COOKIE_NAME)) {
    res.cookies.set({ name: ADMIN_COOKIE_NAME, value: "", maxAge: 0, path: "/" });
  }
}

export const config = {
  matcher: [
    "/admin/:path*", "/board", "/board/archive", "/board/card/:path*",
    "/schedule", "/contacts", "/contacts/:path*",
    "/inquiries", "/tools", "/tools/:path*", "/settings", "/payments", "/pickups", "/expenses", "/released",
    // The editor pages are matched for SESSION REFRESH ONLY. They are gated in
    // their own layout, against a different admitted set (editor or admin) —
    // adding them to the admin predicates above would bounce Marizete off her
    // own board.
    "/editor", "/editor/:path*",
  ],
};
