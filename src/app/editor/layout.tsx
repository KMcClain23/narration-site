import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/supabase/session";
import { roleAdmits } from "@/lib/route-access";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { SignOutButton } from "@/app/admin/login/SignOutButton";
import { AdminTheme } from "@/components/admin/AdminTheme";

/**
 * THE EDITOR SURFACE — Marizete's, and Dean's to look at.
 *
 * The gate lives here rather than in middleware.ts because the admitted set is
 * different: editor OR admin, where every other protected route is admin only.
 * Middleware matches these paths for session refresh and decides nothing about
 * them.
 *
 * WHAT THIS GATE IS AND IS NOT. It picks the right screen for a person. It is
 * NOT the security boundary — every page below reads through
 * `assert_editor_access` with her own JWT, so if this layout failed open she
 * would still see nothing. That is the arrangement W2a asks for and it is worth
 * stating plainly: the boundary is in Postgres, and this is courtesy.
 *
 * Three states, matching R5:
 *   no session      -> the sign-in form, carrying ?next= so she lands back here
 *   pending / none  -> "signed in, no access here yet", NOT a login form
 *   editor / admin  -> through
 */
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();

  // No session: the login page's state 1. ?next= brings her back rather than
  // dropping her on /board, which she cannot open.
  if (!session) redirect("/admin/login?next=/editor");

  // A role that admits nothing here — 'pending' is the one that matters, since
  // every new account is now created with it.
  if (!roleAdmits(session.role, "editor")) {
    return (
      <NoAccessPanel
        session={session}
        surface="The editing pages"
        returnTo="/admin/login?next=/editor"
      />
    );
  }

  /*
    THE ADMIN LOOK, WITHOUT THE ADMIN NAVIGATION.

    This surface was wearing the PUBLIC palette — the marketing navy and the
    marketing gold, both hardcoded here as hex literals — because it never opted
    into the admin design system at all. Dean's pages get that system through
    AdminLayout, and hers read as a different product beside them. The admin
    amber is deliberately duller than the public gold, which is most of the
    difference he was reacting to.

    AdminTheme, not AdminLayout. AdminLayout renders AdminShell, whose sidebar
    and tab bar point at /board, /payments, /contacts and the rest — every one of
    which Marizete cannot open. She would get a navigation full of dead ends and
    a "no access" panel behind each one. She needs the theming shell, and this is
    it: .admin-root, Manrope, and the semantic tokens.

    The header below stays hers. It is not AdminShell's chrome wearing new
    colours; it is the same one-line header she has always had, now built from
    admin tokens.
  */
  return (
    <AdminTheme className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-divider bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/editor" className="text-sm font-bold tracking-tight">
            Editing
          </Link>
          <div className="flex items-center gap-4">
            {/* Dean sees this and she does not: it is how he knows the page he is
                looking at is hers, not a variant of his own. */}
            {session.role === "admin" && (
              <span className="rounded-full border border-accent-amber/40 px-2.5 py-0.5 text-[11px] text-accent-amber">
                viewing as admin
              </span>
            )}
            <span className="hidden text-xs text-text-dim sm:inline">{session.email}</span>
            <div className="w-24">
              <SignOutButton returnTo="/admin/login?next=/editor" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </AdminTheme>
  );
}
