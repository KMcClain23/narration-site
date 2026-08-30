"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser-side Supabase client, for signing in and out.
 *
 * ANON KEY ONLY. This runs in the user's browser and everything it can do is
 * bounded by RLS and the role gates in the database — which is the whole point
 * of the migration this begins. The service-role key never appears here and
 * never can: it would be readable by anyone who opened devtools.
 *
 * Not to be confused with the deleted src/lib/supabase-browser.ts, which was an
 * unused anon client left over from before the anon revoke. This one is used and
 * is session-aware.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
