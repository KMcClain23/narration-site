import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/supabase/session";
import { LoginForm } from "./LoginForm";
import { SignOutButton } from "./SignOutButton";

/**
 * THREE STATES, NOT TWO.
 *
 *   no session            -> the sign-in form, carrying ?next=
 *   session, wrong role   -> "signed in, but no access here yet", with a way out
 *   session, right role   -> straight through to where they were going
 *
 * The middle state is the one that was missing, and it stopped being cosmetic
 * the moment the shared secret stopped being a way in. An editor who signs in
 * correctly and is bounced back to a login form has been told, as far as she can
 * tell, that her password is wrong — the screen is identical either way. Dean
 * hit exactly that and concluded sign-in was broken.
 *
 * A page cannot show what it cannot distinguish, which is why this is a server
 * component: it reads the session and the role before rendering anything, rather
 * than rendering a form and finding out afterwards.
 */

/** Only same-site paths, so a crafted ?next= cannot bounce a signed-in admin off-site. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/board";
  return raw;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  const session = await currentSession();

  // STATE 3 — already an admin. Nothing to do here; finish the journey.
  if (session?.role === "admin") {
    redirect(next);
  }

  // STATE 2 — signed in, and it is not enough. Say so in those words: who they
  // are signed in AS, what role they have, and that the account is fine but this
  // surface is not open to it yet.
  if (session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#06082E] px-6">
        <div className="w-full max-w-sm rounded-2xl border border-[#1A2070] bg-[#0A0D3A] p-6 shadow-2xl">
          <h1 className="text-base font-bold text-white">Signed in — no access here yet</h1>
          <p className="mt-3 text-sm text-white/60">
            You are signed in as{" "}
            <span className="text-white">{session.email ?? "this account"}</span>.
          </p>
          <p className="mt-1 text-sm text-white/60">
            Role: <span className="text-white">{session.role ?? "none recorded"}</span>.
          </p>
          <p className="mt-3 text-sm text-white/50">
            The admin pages are not open to this account. Your sign-in worked — there is
            nothing wrong with your password.
          </p>

          <SignOutButton />

          <Link href="/" className="mt-4 block text-center text-xs text-white/40 hover:text-white/70">
            Back to the site
          </Link>
        </div>
      </main>
    );
  }

  // STATE 1 — nobody is signed in.
  return <LoginForm />;
}
