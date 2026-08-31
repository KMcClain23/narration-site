import type { AppRole } from "@/lib/supabase/session";

/**
 * WHO MAY ENTER WHICH SURFACE — one definition, every caller.
 *
 * There are now two of them. The admin pages are Dean's and always have been;
 * the editor pages are Marizete's and Dean must be able to see them too, because
 * he cannot support a screen he cannot look at.
 *
 * This is a separate file rather than three `role === "admin"` comparisons in
 * middleware.ts, the login page and the editor layout, for the reason U4 already
 * paid for once: near-identical auth checks in several places drift, and the one
 * that drifts is the one nobody re-reads.
 *
 * IT DECIDES NOTHING THE DATABASE DOES NOT ALSO DECIDE. Every editor page reads
 * through `assert_editor_access` with her own JWT, so this layer failing open
 * would still show her nothing — it exists to give a person the right screen,
 * not to be the boundary. The boundary is in Postgres.
 *
 * Type-only import of AppRole: session.ts is server-only, and middleware must be
 * able to import this. A type import is erased, a value import would not be.
 */
export type Surface = "admin" | "editor";

/** Which surface a path belongs to. `/editor` and below are hers; the rest are his. */
export function surfaceForPath(pathname: string): Surface {
  return pathname === "/editor" || pathname.startsWith("/editor/") ? "editor" : "admin";
}

/**
 * Whether a role may enter a surface.
 *
 * Admin admits everything INCLUDING the editor pages — deliberately, per W2b.
 * Editor admits only the editor surface. Everything else, `pending` and an
 * unrecognised role included, admits nothing: `normaliseRole` already maps what
 * this build does not understand to null, and null is refused here rather than
 * defaulted anywhere.
 */
export function roleAdmits(role: AppRole | null, surface: Surface): boolean {
  if (role === "admin") return true;
  if (surface === "editor") return role === "editor";
  return false;
}
