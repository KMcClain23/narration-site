import Link from "next/link";
import { SignOutButton } from "@/app/admin/login/SignOutButton";
import type { AppSession } from "@/lib/supabase/session";

/**
 * "Signed in, and it is not enough" — R5's state 2, now shared.
 *
 * This was written for the admin login page and W2 needs the identical thing for
 * the editor pages, so it moved here rather than being copied. The copy is what
 * would have drifted: the whole value of this screen is that it says the
 * password was RIGHT, and a second version of it that forgot to say so would put
 * Dean back where he started — bounced to a form that reads as "wrong password"
 * when the account was fine all along.
 *
 * `surface` names what is closed, so the sentence is true on both pages rather
 * than saying "the admin pages" to someone who was trying to reach hers.
 */
export function NoAccessPanel({
  session,
  surface,
  returnTo = "/admin/login",
}: {
  session: AppSession;
  surface: string;
  returnTo?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06082E] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#1A2070] bg-[#0A0D3A] p-6 shadow-2xl">
        <h1 className="text-base font-bold text-white">Signed in — no access here yet</h1>
        <p className="mt-3 text-sm text-white/60">
          You are signed in as <span className="text-white">{session.email ?? "this account"}</span>.
        </p>
        <p className="mt-1 text-sm text-white/60">
          Role: <span className="text-white">{session.role ?? "none recorded"}</span>.
        </p>
        <p className="mt-3 text-sm text-white/50">
          {surface} are not open to this account. Your sign-in worked — there is nothing
          wrong with your password.
        </p>

        <SignOutButton returnTo={returnTo} />

        <Link href="/" className="mt-4 block text-center text-xs text-white/40 hover:text-white/70">
          Back to the site
        </Link>
      </div>
    </main>
  );
}
