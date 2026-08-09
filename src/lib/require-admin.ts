import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isValidAdminKey } from "@/lib/admin-auth";

// Defense in depth for admin server components.
//
// Every admin page reads Supabase through the service-role client, which
// bypasses RLS entirely — so the page component itself is the last thing
// standing between an unauthenticated request and the whole database. Until
// now those pages had no check of their own and relied purely on
// middleware.ts.
//
// Next.js's own guidance is that middleware should not be the only
// authorization layer (CVE-2025-29927 was exactly a middleware bypass via a
// forged x-middleware-subrequest header). This app is on a patched Next, but
// the structural point stands: a single bypass should not expose 20 pages.

/** True when the current request carries a valid admin cookie. */
export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidAdminKey(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

/**
 * Redirect to the login page unless the request is authenticated.
 *
 * Call at the top of an admin server component, before any data fetching —
 * redirect() throws, so anything above it has already run and anything below
 * it has not.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdminRequest())) {
    redirect("/admin/login");
  }
}

/**
 * Route-handler guard. Returns a 401 response to return, or null to proceed:
 *
 *   const denied = await requireAdmin();
 *   if (denied) return denied;
 *
 * Route handlers are not covered by middleware.ts's matcher, which lists page
 * routes only — so an API route with no check of its own is reachable by
 * anyone regardless of how well the pages are gated. A fresh response is
 * built per call because a NextResponse body can only be consumed once.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminRequest()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
