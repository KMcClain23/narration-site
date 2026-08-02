"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shared between Sidebar (desktop) and MoreSheet (mobile) — same
// cookie-clearing POST + hard navigation either one used before this hook
// was extracted.
export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/admin/logout", { method: "POST" });
    } catch {
      // Even if the request fails, we still navigate away — the destination
      // route stays protected by the cookie check on refresh regardless.
    } finally {
      router.push("/admin/login");
      router.refresh();
      setLoggingOut(false);
    }
  };

  return { logout, loggingOut };
}
