import { redirect } from "next/navigation";
import { currentSession } from "@/lib/supabase/session";
import { roleAdmits, surfaceForPath } from "@/lib/route-access";
import { NoAccessPanel } from "@/components/auth/NoAccessPanel";
import { LoginForm } from "./LoginForm";

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
 *
 * W2 CHANGED WHAT "RIGHT ROLE" MEANS, and it is the trap this page had to avoid.
 * "Right" is now relative to WHERE THEY WERE GOING. Marizete signing in on her
 * way to /editor is admitted; the same account on its way to /payments is not.
 * Had state 3 stayed `role === "admin"`, she would have signed in perfectly and
 * landed on "no access here yet" — the exact failure this page was built to end,
 * reintroduced by a page that still looked correct.
 */

/** Only same-site paths, so a crafted ?next= cannot bounce a signed-in user off-site. */
function safeNext(raw: string | undefined, role: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (!role) return null;
  // No destination given: send each role to its own home rather than to /board,
  // which an editor cannot open.
  return role === "editor" ? "/editor" : "/board";
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const session = await currentSession();
  const next = safeNext(rawNext, session?.role ?? null);

  // STATE 3 — signed in with a role that admits the destination. Finish the journey.
  if (session && next && roleAdmits(session.role, surfaceForPath(next))) {
    redirect(next);
  }

  // STATE 2 — signed in, and it is not enough for where they were going.
  if (session) {
    const surface =
      next && surfaceForPath(next) === "editor" ? "The editing pages" : "The admin pages";
    return <NoAccessPanel session={session} surface={surface} />;
  }

  // STATE 1 — nobody is signed in.
  return <LoginForm />;
}
