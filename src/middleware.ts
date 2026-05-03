import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "dmn_admin_key";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin/* (except login) and /board/* (except token-based author views)
  const isAdminRoute = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isBoardRoute = pathname === "/board" || pathname.startsWith("/board/card");

  if (isAdminRoute || isBoardRoute) {
    const cookie = req.cookies.get(COOKIE_NAME)?.value ?? "";
    if (!cookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/board", "/board/card/:path*"],
};
