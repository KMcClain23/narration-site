import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/supabase/session";
import { roleAdmits } from "@/lib/route-access";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { SignOutButton } from "@/app/admin/login/SignOutButton";

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

  return (
    <div className="min-h-screen bg-[#06082E] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06082E]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/editor" className="text-sm font-bold tracking-tight">
            Editing
          </Link>
          <div className="flex items-center gap-4">
            {/* Dean sees this and she does not: it is how he knows the page he is
                looking at is hers, not a variant of his own. */}
            {session.role === "admin" && (
              <span className="rounded-full border border-[#D4AF37]/40 px-2.5 py-0.5 text-[11px] text-[#D4AF37]">
                viewing as admin
              </span>
            )}
            <span className="hidden text-xs text-white/40 sm:inline">{session.email}</span>
            <div className="w-24">
              <SignOutButton returnTo="/admin/login?next=/editor" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
