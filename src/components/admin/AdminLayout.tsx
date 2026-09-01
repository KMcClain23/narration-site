import { AdminShell } from "./AdminShell";
import { AdminTheme } from "./AdminTheme";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Admin is its own world — Header.tsx returns null on every admin route,
    // so there's no fixed public header to clear here.
    //
    // The theming lives in AdminTheme so the editor surface can wear it WITHOUT
    // AdminShell's navigation, which points at routes Marizete cannot open.
    <AdminTheme className="flex min-h-screen">
      <AdminShell>{children}</AdminShell>
    </AdminTheme>
  );
}
