import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, isValidAdminKey } from "@/lib/admin-auth";
import { refreshSession } from "@/lib/supabase/middleware-session";

/**
 * TWO AUTHENTICATION PATHS, DELIBERATELY BOTH LIVE.
 *
 * The shared-secret cookie is unchanged and still carries every request. The
 * Supabase session is new, additive, and grants admin access on its own. Neither
 * depends on the other and neither is consulted only when the other fails to
 * throw — they are two complete answers to the same question, and either one
 * being true is enough.
 *
 * THE RISK THIS CREATES, NAMED SO IT IS NOT FORGOTTEN: while both are live, a
 * BROKEN Supabase path is invisible from the browser, because the cookie keeps
 * working. That is the price of a migration nothing has to cut over for, and it
 * is why the new path is proved in isolation rather than by "the admin still
 * loads". When the cookie is retired, this file loses its first check and the
 * session becomes the only answer.
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
    pathname === "/released";

  if (isAdminRoute || isBoardRoute || isNewAdminRoute) {
    // Compares the cookie against ADMIN_SECRET_KEY. This previously only
    // checked the cookie was non-empty, which meant
    // `document.cookie = "dmn_admin_key=x"` reached every admin page.
    // The OLD path, byte-for-byte what it was.
    const byAdminKey = isValidAdminKey(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
    // The NEW path, independent of it. Editor is deliberately NOT enough: these
    // routes are the admin, and W1 gives an editor nothing new on the website.
    const bySupabaseAdmin = role === "admin";

    if (!byAdminKey && !bySupabaseAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      // Carry where they were going, so signing in finishes the journey
      // instead of dropping everyone on the board to navigate again.
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // /admin root has no page — redirect authenticated users straight to /board
    if (pathname === "/admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/board";
      return NextResponse.redirect(url);
    }
  }

  // The refreshed response, so any rotated auth cookie is actually written.
  // Returning NextResponse.next() here instead would drop the refresh silently
  // and sessions would expire early for no visible reason.
  return res;
}

export const config = {
  matcher: [
    "/admin/:path*", "/board", "/board/archive", "/board/card/:path*",
    "/schedule", "/contacts", "/contacts/:path*",
    "/inquiries", "/tools", "/tools/:path*", "/settings", "/payments", "/expenses", "/released",
  ],
};
