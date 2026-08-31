"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import CartDrawer from "./CartDrawer";
import { CartProvider } from "@/context/CartContext";
import { isPrivateRoute } from "@/lib/admin-routes";

/**
 * The public site's chrome, mounted ONLY on public routes.
 *
 * The root layout wrapped every route in CartProvider + Header + CartDrawer, so
 * Marizete's editing screen carried a merch shopping cart, its context and its
 * drawer markup. Header already hid itself via `isPrivateRoute`; the other three
 * did not, and a component returning null still shipped and still ran.
 *
 * SAME PREDICATE AS THE HEADER, imported rather than restated. A second copy of
 * "which routes are private" is the drift this project has already paid for
 * twice — see admin-routes.ts.
 *
 * WHY HEADER MOVED INSIDE THIS. It calls `useCart()` at the top of its body,
 * before its own early return, so it depended on CartProvider on every route.
 * Rendering it only on public routes is what makes the provider removable at
 * all; leaving it outside would throw the moment the provider went conditional.
 *
 * NO TOP PADDING IS APPLIED HERE, deliberately — see the note in layout.tsx.
 *
 * THE STRUCTURAL ANSWER IS ROUTE GROUPS: `(public)` and `(private)` with
 * separate layouts would keep the cart out of private BUNDLES entirely instead
 * of rendering nothing at runtime. That is a move of every route directory and
 * is not this change. Recommended, not done.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPrivateRoute(pathname)) {
    // No provider, no header, no drawer. The admin and editor surfaces bring
    // their own chrome and have no use for any of this.
    return <>{children}</>;
  }

  return (
    <CartProvider>
      <Header />
      {children}
      <CartDrawer />
    </CartProvider>
  );
}
