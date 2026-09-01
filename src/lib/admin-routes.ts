/**
 * Which paths are private, and which of those require the admin role.
 *
 * ONE LIST, TWO QUESTIONS — and they are genuinely different questions, which is
 * why this file exports two predicates instead of one.
 *
 *   isPrivateRoute  "is this a private surface?"     -> hide the marketing header
 *   requiresAdmin   "does this require role admin?"  -> middleware's gate
 *
 * `/editor` is the case that separates them. It is private — Marizete must not
 * get the public navigation across the top of her board — but it does NOT
 * require admin, because it is gated in its own layout against `roleAdmits`,
 * which admits editor OR admin. Collapsing these into one predicate would either
 * put the marketing chrome on her pages or bounce her off them, depending on
 * which way it was collapsed. A single predicate cannot be right about both.
 *
 * THE FILE ALREADY PROVED ITS OWN POINT ONCE. It was written to end a drift, and
 * middleware then drifted from it anyway by keeping a local `isNewAdminRoute`
 * beside it: `/expenses` was listed here and in middleware's matcher, but missing
 * from that local copy, so middleware never gated it and the only thing standing
 * in front of it was `assertAdmin` in the page. Provable at the time from the
 * redirect alone — middleware sends `?next=`, `assertAdmin` does not, and
 * `/expenses` was the one admin route redirecting without it. The local copy is
 * now deleted rather than corrected; a second list that agrees today is still a
 * second list.
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
  "/pickups",
  "/expenses",
  "/released",
]);

// "/board/card" was here, protecting a page that does not exist. That is worse
// than harmless: this file is the one place a person looks to ask "what admin
// routes are there?", so listing the path VOUCHED for it, and a dead link to
// /board/card/[id] sat on /pickups reading as deliberate. A route listing is
// evidence about the app, and evidence has to be true to be worth having.
const PREFIXES = ["/admin", "/contacts", "/tools"];

/** The editor surface: private, but not admin-only. */
const EDITOR_PREFIX = "/editor";

/**
 * The narrator's tokenised pages: private, and NOT AUTHENTICATED AT ALL.
 *
 * The second case that proves these two predicates had to be separate. Ann has
 * no account; her link is the credential. `/p` must be private — she should not
 * get "Narrated Works · Demos · Merch" across the top of a work order — and it
 * must NOT require admin, or the gate would bounce the one person it is for to a
 * login she can never pass.
 */
const NARRATOR_PREFIX = "/p";

function matches(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  return PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

function isEditorRoute(pathname: string): boolean {
  return pathname === EDITOR_PREFIX || pathname.startsWith(`${EDITOR_PREFIX}/`);
}

function isNarratorRoute(pathname: string): boolean {
  return pathname === NARRATOR_PREFIX || pathname.startsWith(`${NARRATOR_PREFIX}/`);
}

/**
 * Requires the admin role. Middleware's gate.
 *
 * `/admin/login` is excluded, and must stay excluded: it is the page the gate
 * redirects TO, so admitting it here would send it to itself forever.
 */
export function requiresAdmin(pathname: string): boolean {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return false;
  return matches(pathname);
}

/**
 * A private surface — no marketing chrome. Admin routes, the editor's, and the
 * narrator's tokenised pages.
 *
 * Includes `/admin/login`: it is not admin-gated, and it is still no place for
 * the site navigation. Includes `/p`, which is not authenticated at all.
 */
export function isPrivateRoute(pathname: string): boolean {
  return matches(pathname) || isEditorRoute(pathname) || isNarratorRoute(pathname);
}
