import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A Supabase client scoped to the SIGNED-IN USER, for server components and
 * route handlers.
 *
 * This is deliberately NOT supabaseAdmin. supabaseAdmin is service_role: it
 * bypasses RLS entirely and has no user, which is exactly why the shared-secret
 * cookie could never express a role. A client built here carries the user's JWT,
 * so `current_app_role()` resolves and every gate in the database applies.
 *
 * NOTHING CONSUMES THIS YET. W1 builds and proves it; W2 moves reads onto it.
 * Adding it now, unused, means the switch in W2 is one import per call site
 * rather than a new mechanism invented under time pressure.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. That is expected and safe:
            // the middleware refreshes the session on every request, so a
            // component that could not write the refreshed cookie still reads a
            // valid one. Swallowing it here is the documented pattern, not a
            // shrug — if the middleware were removed this would silently stop
            // refreshing, which is why it is called out.
          }
        },
      },
    },
  );
}
