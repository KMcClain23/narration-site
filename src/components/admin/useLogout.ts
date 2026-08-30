"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Sign out. Shared between Sidebar (desktop) and MoreSheet (mobile).
 *
 * IT NOW ENDS THE SUPABASE SESSION, which is the only thing that signs anybody
 * in. Until the shared secret was retired this hook only POSTed to
 * /admin/logout to clear the dmn_admin_key cookie — and left exactly as it was,
 * it would have kept clearing a cookie nothing reads while the session that
 * actually grants access survived. The button would have looked like it worked.
 *
 * The cookie clear is kept as well, so a browser holding a stale one from before
 * the migration is cleaned up on the way out rather than carrying it around.
 */
export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // The one that matters.
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Fall through: navigating away is still right, and the routes are
      // protected by a fresh session check on arrival regardless.
    }
    try {
      // Housekeeping for a pre-migration cookie. Not a credential any more.
      await fetch("/admin/logout", { method: "POST" });
    } catch {
      // Nothing depends on this succeeding.
    }
    router.push("/admin/login");
    router.refresh();
    setLoggingOut(false);
  };

  return { logout, loggingOut };
}
