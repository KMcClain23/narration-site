import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase session on a request, and report who it belongs to.
 *
 * Runs on the EDGE runtime, so it must not import next/headers or "server-only".
 * That is the same constraint admin-auth.ts documents, and the reason this file
 * exists separately from server.ts.
 *
 * It has ONE side effect — writing refreshed auth cookies onto the response —
 * and returns the user so the caller can decide what to do. It decides nothing
 * itself: authorisation belongs to the caller, and a session-refresher that also
 * granted access would be two jobs in one place.
 */
export async function refreshSession(req: NextRequest): Promise<{
  res: NextResponse;
  userId: string | null;
  /** From public.profiles, never from a token claim. See session.ts. */
  role: string | null;
}> {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession(). getSession reads the cookie and believes it;
  // getUser revalidates against the auth server. For something a gate will read,
  // "the cookie says so" is not good enough.
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) return { res, userId: null, role: null };

  // The role is read from profiles, because that is what current_app_role()
  // reads and therefore the only answer that can agree with what the database
  // will actually allow. A claim in the token would go stale on a role change
  // and the app would believe it for the life of that token.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return { res, userId, role: (profile?.role as string | undefined) ?? null };
}
