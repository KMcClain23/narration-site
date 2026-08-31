"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Sign out, from the page that told you that you cannot come in.
 *
 * NOT OPTIONAL, and that is the whole reason this exists. Without it a session
 * with the wrong role has no way out: the admin routes bounce you here, this
 * page is not an admin route so it does not bounce you back, and re-entering
 * perfectly correct credentials just signs the same account in again. The only
 * escape is clearing cookies by hand, which nobody should have to know to do.
 */
export function SignOutButton({ returnTo = "/admin/login" }: { returnTo?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        await supabase.auth.signOut();
        // refresh() as well as replace(): the server component that decides
        // which of the three states to render has to re-run, or the page would
        // still be showing the signed-in one.
        router.replace(returnTo);
        router.refresh();
      }}
      className="mt-4 w-full rounded-xl border border-white/20 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/5 disabled:opacity-40"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
