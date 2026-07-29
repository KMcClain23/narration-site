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
    // pt-14 sm:pt-16 clears the public site's fixed Header — body's own
    // pt-14/pt-16 is dead (globals.css sets `body { padding: 0 !important }`),
    // so every page in this codebase reserves that space on its own root
    // element instead. Matching that convention here.
    <div className={`admin-root ${manrope.variable} flex min-h-screen bg-background text-text-body pt-14 sm:pt-16`}>
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
