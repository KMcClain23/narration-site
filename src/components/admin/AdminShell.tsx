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
      {/* No overflow-y here on purpose. It never engaged — the parent uses
          min-h-screen (grows to fit), not h-screen (capped), so the real
          scrolling has always happened on window/body — but it still made this
          element a scroll container, and `sticky` inside a scroll container
          that never scrolls simply cannot stick. That silently broke every
          sticky descendant, which is why the schedule's agenda scrolled away. */}
      <main className={`admin-scrollbar flex-1 min-w-0 p-8 ${isDesktop ? "" : "pb-24"}`}>
        {children}
      </main>
      {!isDesktop && <BottomTabBar />}
    </AdminModalProvider>
  );
}
