import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isValidAdminKey } from "@/lib/admin-auth";
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
 * True when the request is an admin, by EITHER of two independent paths.
 *
 * This one function backs assertAdmin, requireAdmin and isAdminOrInternal, so
 * teaching it the second path teaches all three at once — which is why the
 * Supabase check belongs here and not sprinkled through the call sites.
 *
 * THE TWO PATHS ARE INDEPENDENT AND BOTH COMPLETE. The shared-secret cookie is
 * unchanged and is checked first because it is free — no network, no database.
 * The Supabase session is checked on its own terms and grants admin on its own.
 * Neither is a fallback for the other in the sense that matters: neither one
 * being WRONG makes the other one right, and each is sufficient alone.
 *
 * WHAT THIS ORDER COSTS, named so it is not forgotten: while the cookie works, a
 * broken Supabase path is invisible from a browser that has the cookie. That is
 * unavoidable in an additive migration and is why the new path is proved on its
 * own — signed in with an account and NO cookie — rather than by "the admin
 * still loads".
 */
export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  if (isValidAdminKey(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) return true;

  // The role is read from public.profiles, because that is what
  // current_app_role() reads and therefore the only answer that can agree with
  // what the database itself will allow. An editor is deliberately NOT admin
  // here: W1 gives her a session and nothing else on this surface.
  return (await currentRole()) === "admin";
}

/**
 * Admin cookie, or the app calling itself.
 *
 * The parse chain is a sequence of server-to-server requests: uploading a
 * manuscript triggers /process, which triggers /extract, which chains through
 * its own chapters. None of those carry a browser's cookies, so once these
 * routes started requiring one they began answering 401 to their own triggers
 * — silently, since nothing reads the response. Every manuscript uploaded
 * after that sat at "processing" forever with no chapters and no error, which
 * looked exactly like a very slow parse.
 *
 * The shared secret is the same one the cookie is checked against, sent as a
 * bearer between two routes of the same deployment over HTTPS. It is not a
 * second credential to manage, and it cannot be forged without already having
 * the admin key.
 */
export async function isAdminOrInternal(req: Request): Promise<boolean> {
  if (await isAdminRequest()) return true;

  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Header for one route of this app to call another with. */
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
