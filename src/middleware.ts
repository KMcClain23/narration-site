import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "dmn_admin_key";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin/* (except login) and /board/* (except token-based author views)
  const isAdminRoute = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isBoardRoute = pathname === "/board" || pathname === "/board/archive" || pathname.startsWith("/board/card");

  // New admin redesign routes (Stage 1+) — same cookie gate as everything else above.
  const isNewAdminRoute =
    pathname === "/board-v2" ||
    pathname === "/schedule" ||
    pathname.startsWith("/contacts") ||
    pathname === "/inquiries-v2" ||
    pathname === "/demos-v2" ||
    pathname.startsWith("/tools") ||
    pathname === "/settings" ||
    pathname === "/released";

  if (isAdminRoute || isBoardRoute || isNewAdminRoute) {
    const cookie = req.cookies.get(COOKIE_NAME)?.value ?? "";
    if (!cookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }

    // /admin root has no page — redirect authenticated users straight to /board
    if (pathname === "/admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/board";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*", "/board", "/board/archive", "/board/card/:path*",
    "/board-v2", "/schedule", "/contacts", "/contacts/:path*",
    "/inquiries-v2", "/demos-v2", "/tools", "/tools/:path*", "/settings", "/released",
  ],
};
