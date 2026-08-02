import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "dmn_admin_key";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    "/schedule", "/contacts", "/contacts/:path*",
    "/inquiries", "/tools", "/tools/:path*", "/settings", "/released",
  ],
};
