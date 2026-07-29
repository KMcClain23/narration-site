import { Manrope } from "next/font/google";
import { Sidebar } from "./Sidebar";

// Admin-only font — the public site keeps its existing font stack (Geist).
// Scoped via .admin-root in globals.css, not the root <body> rule.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Admin is its own world — Header.tsx returns null on every admin route,
    // so there's no fixed public header to clear here.
    <div className={`admin-root ${manrope.variable} flex min-h-screen bg-background text-text-body`}>
      <Sidebar />
      <main className="admin-scrollbar flex-1 min-w-0 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
