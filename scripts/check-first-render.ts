/**
 * Every admin page must render on FIRST PAINT, before the studio settings arrive.
 *
 * Usage (from project root, with `npm run dev` already running):
 *   npm run check-first-render
 *
 * This exists because /payments went down in production with
 *
 *   TypeError: Cannot read properties of undefined (reading 'push')
 *
 * and nothing in this repo would have caught it. Stage 7 gave
 * `useStudioSettings` a `loading` state, which it had never had — before that it
 * returned a complete settings object from its very first render. Every page
 * therefore has a first pass, lasting a few hundred milliseconds, in which every
 * rate is null and every rate-derived value takes its absent branch. That pass
 * had never been exercised anywhere.
 *
 * A server-rendered fetch is exactly that pass: `useEffect` does not run during
 * SSR, so the hook stays in `loading` and the page renders the same branches the
 * browser renders on frame one. A 500 here is a page Dean cannot open.
 *
 * It hits a running dev server rather than mounting components because this repo
 * has no test runner and adding one during an outage was not the trade. If a
 * runner ever arrives, the better version of this mounts PaymentsClient with the
 * hook forced to `loading` and asserts it does not throw — but this catches the
 * same class, on more pages, today.
 */

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";

/** Every admin route that reads a studio rate, directly or through a child. */
const ROUTES = [
  "/payments",
  "/expenses",
  "/board",
  "/schedule",
  "/settings",
  "/released",
  "/tools/analytics",
  "/tools/contract-builder",
];

function adminHeaders(): Record<string, string> {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  if (!secret) {
    console.error(
      "ADMIN_SECRET_KEY is not set. Run with --env-file=.env.local, as the npm script does.",
    );
    process.exit(2);
  }
  // A HEADER, not a cookie. This used to send `dmn_admin_key=<secret>`, which
  // stopped authenticating anything when R1 made the browser path session-only
  // — the guard could not run at all, and only failed loudly because it checks
  // for 200. The bearer is the mechanism deliberately kept for exactly this:
  // one part of the deployment calling another. No browser sends it by itself.
  return { authorization: `Bearer ${secret}` };
}

async function main() {
  const auth = adminHeaders();
  const failures: string[] = [];

  for (const route of ROUTES) {
    let status: number | string;
    try {
      // MANUAL REDIRECTS, and this is the whole reason the guard is trustworthy.
      //
      // fetch follows a 307 by default. When the credential stopped working,
      // middleware redirected every one of these to /admin/login — which
      // renders fine and returns 200 — so this script reported all 8 routes
      // healthy while rendering the login page eight times. It was GREEN for
      // the entire period it could not authenticate. A redirect is now a
      // failure, not a detour.
      const res = await fetch(`${BASE}${route}`, { headers: auth, redirect: "manual" });
      status = res.status;
      const body = await res.text();

      // A 200 that rendered Next's error boundary is still a broken page.
      const errored =
        body.includes("Application error") ||
        body.includes("reading &#x27;push&#x27;") ||
        body.includes("reading 'push'");

      // And a 200 that is the LOGIN page is not this page. Belt and braces with
      // redirect:"manual" — if the gate ever starts rendering the login form in
      // place of redirecting, the status alone would not say so.
      const isLoginPage = body.includes('placeholder="Email"') && body.includes('placeholder="Password"');

      if (res.status !== 200 || errored || isLoginPage) {
        const why = errored ? " (error boundary rendered)" : isLoginPage ? " (served the LOGIN page)" : "";
        failures.push(`${route} -> ${res.status}${why}`);
      }
    } catch (e) {
      status = e instanceof Error ? e.message : "unreachable";
      failures.push(`${route} -> ${status}`);
    }
    console.log(`  ${route.padEnd(28)} ${status}`);
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`FAIL — ${failures.length} route(s) do not render on first paint:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`OK — all ${ROUTES.length} routes render before the settings arrive.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
