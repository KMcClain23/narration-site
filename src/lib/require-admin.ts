import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/supabase/session";

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

/**
 * True when a signed-in Supabase user has the admin role.
 *
 * THE SHARED SECRET IS NO LONGER A WAY IN. It used to be checked here first and
 * that check is gone: email and password is the only browser path now. The
 * secret itself REMAINS, because it is also the internal service-to-server
 * bearer — see isAdminOrInternal below, and do not remove the env var.
 *
 * The role comes from public.profiles, not from a token claim, because
 * current_app_role() is literally a select against profiles — so profiles is the
 * only source that can agree with what the database will actually allow.
 */
export async function isAdminRequest(): Promise<boolean> {
  return (await currentRole()) === "admin";
}

/**
 * A signed-in admin, or the app calling itself.
 *
 * The parse chain is a sequence of server-to-server requests: uploading a
 * manuscript triggers /process, which triggers /extract, which chains through
 * its own chapters. None of those carry a browser's cookies, so once these
 * routes started requiring one they began answering 401 to their own triggers
 * — silently, since nothing reads the response. Every manuscript uploaded
 * after that sat at "processing" forever with no chapters and no error, which
 * looked exactly like a very slow parse.
 *
 * ADMIN_SECRET_KEY IS NO LONGER A LOGIN CREDENTIAL. It is ONLY this: a bearer
 * sent between two routes of the same deployment over HTTPS. The browser path
 * is email and password, and nothing accepts this secret from a cookie any more.
 *
 * DO NOT FINISH THE JOB BY DELETING THE ENV VAR — that is the failure described
 * directly above, and it has already happened here once.
 */
export async function isAdminOrInternal(req: Request): Promise<boolean> {
  if (await isAdminRequest()) return true;

  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Header for one route of this app to call another with.
 *
 * The remaining legitimate use of ADMIN_SECRET_KEY. Not a login.
 */
export function internalAuthHeaders(): Record<string, string> {
  const secret = process.env.ADMIN_SECRET_KEY;
  return secret ? { authorization: `Bearer ${secret}` } : {};
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
