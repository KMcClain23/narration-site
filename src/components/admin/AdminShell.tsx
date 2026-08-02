"use client";

import { AdminModalProvider } from "./AdminModalContext";
import { BottomTabBar } from "./BottomTabBar";
import { Sidebar } from "./Sidebar";
import { useIsDesktop } from "./useIsDesktop";

// Split out from AdminLayout (a server component, so it can keep loading the
// Manrope font server-side) purely because useIsDesktop() needs a client
// component to call from.
export function AdminShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();

  return (
    <AdminModalProvider>
      {isDesktop && <Sidebar />}
      {/* overflow-y-auto here never actually engages — the parent flex
          container uses min-h-screen (grows to fit), not h-screen (capped),
          so this element's scrollHeight always equals its clientHeight and
          the real scrolling happens on window/body. Confirmed via testing;
          BottomTabBar's scroll-hide listens on window accordingly. */}
      <main className={`admin-scrollbar flex-1 min-w-0 overflow-y-auto p-8 ${isDesktop ? "" : "pb-24"}`}>
        {children}
      </main>
      {!isDesktop && <BottomTabBar />}
    </AdminModalProvider>
  );
}
