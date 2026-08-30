import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * What a Supabase-authenticated request is, for the server.
 *
 * NOTHING CONSUMES THIS YET — W2 does. It exists now so that W2 is a change of
 * caller rather than an invention, and so the mechanism can be proved on its own
 * while the old path is still carrying every request.
 */
export type AppRole = "admin" | "editor";

export type AppSession = {
  userId: string;
  email: string | null;
  /** Null when the profile row is missing or holds a role this build does not know. */
  role: AppRole | null;
};

/**
 * The signed-in user, or null.
 *
 * getUser() and NOT getSession(): getSession decodes the cookie and believes it,
 * which is fine for showing a name and not fine for anything a gate reads.
 * getUser revalidates against the auth server.
 */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * THE ROLE COMES FROM public.profiles, NOT FROM A JWT CLAIM.
 *
 * This is not a style preference. `current_app_role()` — which every RLS policy
 * and every gate in the database calls — is literally
 *   select role from public.profiles where id = auth.uid()
 * so profiles is the only source that can agree with what the database will
 * actually do. A claim baked into a token at sign-in would go stale the moment a
 * role changed, and the app would believe it for the life of that token while
 * the database refused every query. That divergence is bug 6 in another costume:
 * the client deciding permissions from something the server was not consulting.
 *
 * Read through the USER's client, so RLS applies. The profiles policy lets a
 * user select their own row and nothing else, which means this cannot be used to
 * enumerate anybody.
 */
export async function currentRole(): Promise<AppRole | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;

  return normaliseRole(data?.role);
}

/** The whole session in one read, for callers that want both. */
export async function currentSession(): Promise<AppSession | null> {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role: normaliseRole(data?.role),
  };
}

/**
 * A Supabase client carrying the user's JWT.
 *
 * The point of the whole migration: a query made with this runs as the USER, so
 * current_app_role() resolves and the editor's boundaries apply. supabaseAdmin
 * cannot express that — it is service_role, has no user, and bypasses RLS.
 */
export { createClient as userScopedClient } from "@/lib/supabase/server";

/**
 * Anything unrecognised is null, never a default.
 *
 * A role this build does not know is a session whose permissions cannot be
 * established, and the safe reading of that is "none" — the same rule
 * UserRole.fromStored follows on the phone, for the same reason.
 */
function normaliseRole(raw: unknown): AppRole | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "admin" || v === "editor" ? v : null;
}
