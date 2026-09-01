import { Manrope } from "next/font/google";

// Admin-only font — the public site keeps its existing font stack (Geist).
// Scoped via .admin-root in globals.css, not the root <body> rule.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * THE ADMIN LOOK, WITHOUT THE ADMIN NAVIGATION.
 *
 * ── WHY THIS IS SPLIT OUT OF AdminLayout ───────────────────────────────────
 *
 * AdminLayout is two things stacked: the theming — .admin-root, Manrope, and
 * the semantic background/text tokens — and AdminShell, which draws the
 * sidebar and bottom tab bar for /board, /payments, /contacts and the rest.
 *
 * The editor surface wants the first and must not have the second. Marizete
 * can open none of those routes, so wrapping /editor in AdminLayout would give
 * her a sidebar of dead ends and a "no access" panel behind every item on it.
 *
 * So the theming is its own component and both callers use it: AdminLayout adds
 * the shell on top, the editor layout does not. One definition of what the
 * admin world looks like, two surfaces wearing it.
 */
export function AdminTheme({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`admin-root ${manrope.variable} bg-background text-text-body ${className}`}>
      {children}
    </div>
  );
}
