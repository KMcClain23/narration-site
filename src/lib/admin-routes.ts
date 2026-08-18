/**
 * Which paths belong to the admin side of the site.
 *
 * One list, because there were two and they drifted the first time a page was
 * added. The middleware used one to decide what needs a login; the public
 * header used another to decide when to hide itself. Adding /expenses to
 * neither put the marketing navigation across the top of a private page.
 *
 * No imports on purpose: this is read by middleware, which runs on the edge
 * runtime and cannot pull in anything server-only.
 */

/** Exact paths, and prefixes that own everything beneath them. */
const EXACT = new Set([
  "/board",
  "/board/archive",
  "/schedule",
  "/inquiries",
  "/settings",
  "/payments",
  "/expenses",
  "/released",
]);

const PREFIXES = ["/admin", "/board/card", "/contacts", "/tools"];

export function isAdminRoute(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  return PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}
