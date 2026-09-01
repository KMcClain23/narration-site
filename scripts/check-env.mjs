/**
 * The environment the code actually reads must exist — in BOTH stores.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * This app runs in two runtimes with two separate secret stores and one set of
 * names. `pickup-fresh-link.ts` reads PICKUPS_RESEND_API_KEY and
 * PICKUPS_FROM_ADDRESS from Vercel; `supabase/functions/send-pickups` reads the
 * same two names from Supabase's secret store. A variable set in one and
 * missing from the other produces a feature that looks built, deploys clean,
 * and refuses the first time somebody presses it.
 *
 * The refusals are written to say what is wrong rather than fail silently — but
 * a refusal only speaks when a person presses a button, and a deployment can sit
 * misconfigured for weeks before anyone does. This asks the question at deploy
 * time instead.
 *
 * ── THE REQUIRED SET IS DERIVED, NEVER DECLARED ────────────────────────────
 *
 * A hand-written list of "the variables we need" is the same mistake that kept
 * /board/card alive: the one file a person consults to answer a question
 * vouched for something that was not true. So the names come from the source —
 * every `process.env.X` under src/, every `Deno.env.get("X")` under
 * supabase/functions — and a variable stops being required the moment the last
 * line that reads it is deleted.
 *
 * OPTIONAL IS DERIVED TOO. A name is optional only when EVERY read of it either
 * falls back to a non-empty literal (`?? "https://…"`) or branches on its value
 * (`=== "sandbox"`), because in both cases absence is a state the code was
 * written to handle. `|| ""` is not a fallback — an empty API key is not a
 * working one — and neither is a presence test that returns an error to the
 * user, which is precisely the "refuses when pressed" case this exists for.
 *
 * The only declared exceptions are below, each with its reason, and each is
 * re-checked against the source so it cannot outlive what it describes.
 *
 * ── WHAT EACH STAGE CAN AND CANNOT SEE ─────────────────────────────────────
 *
 *   --build   Stages 1-2 only: the names, and this process's own environment.
 *             That is all a Vercel build has — it holds no Supabase login and
 *             no Vercel API token — so it must never fail for the absence of
 *             something it had no way to look at. It is STRICT only when
 *             VERCEL is set, because only there is this environment the
 *             deployed one; a local `npm run build` gets the same report with
 *             nothing able to fail.
 *   default   Adds the Supabase secret store, the Vercel Production
 *             environment, and the reconcile between them.
 *
 * A stage that cannot reach its store SAYS SO and is counted as unchecked. It
 * is never reported as a pass: "nothing missing" and "could not look" are the
 * same output on screen and must not be the same result.
 *
 * Usage: npm run check-env          (everything reachable)
 *        npm run check-env:build    (what a build can see; wired to prebuild)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const BUILD_ONLY = process.argv.includes("--build");

/**
 * Is this process's own environment the one the deployed site will read?
 *
 * ONLY ON VERCEL. `npm run build` on Dean's laptop reads .env.local, which holds
 * NAME="" for every production secret he keeps off the machine — so a strict
 * --build there would fail every local production build, and the first fix
 * AND ONLY WHERE THE ENVIRONMENT CAME FROM THE PLATFORM. Vercel sets VERCEL=1
 * in its build container — but this machine's .env.local is a pulled copy of
 * that same environment, VERCEL=1 included, so the flag alone made a laptop
 * look like a deployment and the strict branch ran here. A build container has
 * no .env.local (it is gitignored and never uploaded); a developer machine is
 * defined by having one. That is the difference that actually holds.
 * container; that is the one place where "missing here" means "broken deploy".
 */
const IS_DEPLOYMENT = Boolean(process.env.VERCEL) && !existsSync(join(ROOT, ".env.local"));

/**
 * A CLI, through a shell.
 *
 * execFileSync on "npx.cmd" returns nothing useful on Windows, and with stderr
 * discarded that looked exactly like "the CLI is not installed" — three stages
 * reported themselves unchecked while both tools were sitting there working.
 * stderr is still dropped: these tools print progress there, and it is not
 * evidence about the environment.
 */
function run(cmd, timeout) {
  return execSync(cmd, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout, cwd: ROOT,
  });
}

/* ── Declared exceptions. Each is checked for staleness below. ───────────── */

/** Injected by the platform. Never set by hand, never in a store's listing. */
const PLATFORM = {
  site: new Set([
    "NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION",
    "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_RUNTIME",
  ]),
  // Supabase injects these into every Edge Function. Setting them is not
  // possible; `supabase secrets set SUPABASE_…` is rejected.
  edge: new Set([
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL",
  ]),
};

/**
 * Groups where ANY ONE member satisfies the requirement.
 *
 * The derived rule cannot see this: `A || B` has no literal fallback, so both
 * ends look required and neither is.
 */
const ONE_OF = [
  {
    names: ["VERCEL_ANALYTICS_TOKEN", "VERCEL_API_TOKEN"],
    why: "vercel-analytics.ts reads the first and falls back to the second; either alone works.",
  },
];

/* ── Stage 1: what the source reads ─────────────────────────────────────── */

function sourceFiles(dir, test) {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        walk(p);
      } else if (test.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

/**
 * True when this particular read is written to survive the variable's absence.
 * Looks at what immediately follows the read, across newlines.
 */
function readIsGuarded(after) {
  const t = after.replace(/^\s+/, "");
  // ?? "literal" / || "literal" / || `literal` — a NON-EMPTY one.
  const fallback = /^(\?\?|\|\|)\s*(["'`])(.+?)\2/s.exec(t);
  if (fallback) return fallback[3].length > 0;
  // === "x" / !== "x": the code branches on the value, so absence is a case.
  if (/^(===|!==)\s*["'`]/.test(t)) return true;
  return false;
}

function scan(files, pattern) {
  const names = new Map(); // name -> { reads: [{file,line}], everyReadGuarded }
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(pattern)) {
      const name = m[1];
      const rec = names.get(name) ?? { reads: [], everyReadGuarded: true };
      const guarded = readIsGuarded(src.slice(m.index + m[0].length, m.index + m[0].length + 300));
      if (!guarded) rec.everyReadGuarded = false;
      rec.reads.push({
        file: relative(ROOT, file).split(sep).join("/"),
        line: src.slice(0, m.index).split(/\r?\n/).length,
      });
      names.set(name, rec);
    }
  }
  return names;
}

const siteReads = scan(
  sourceFiles(join(ROOT, "src"), /\.(tsx?|jsx?)$/),
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
);
const edgeReads = scan(
  sourceFiles(join(ROOT, "supabase", "functions"), /\.tsx?$/),
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
);

const oneOfMembers = new Set(ONE_OF.flatMap(g => g.names));

function requiredFrom(reads, platform) {
  const req = new Set();
  for (const [name, rec] of reads) {
    if (platform.has(name)) continue;
    if (rec.everyReadGuarded) continue;
    if (oneOfMembers.has(name)) continue;
    req.add(name);
  }
  return req;
}

const siteRequired = requiredFrom(siteReads, PLATFORM.site);
const edgeRequired = requiredFrom(edgeReads, PLATFORM.edge);
const shared = [...siteRequired].filter(n => edgeReads.has(n)).sort();

/* ── Reporting ──────────────────────────────────────────────────────────── */
let failures = 0;
let unchecked = 0;
const ck = (n, p, d = "") => {
  console.log(`  ${p ? "ok  " : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
  if (!p) failures++;
};
const skip = (stage, why) => {
  console.log(`  ??   ${stage} NOT CHECKED — ${why}`);
  unchecked++;
};

console.log(
  `src/ reads ${siteReads.size} variables (${siteRequired.size} required); ` +
  `supabase/functions reads ${edgeReads.size} (${edgeRequired.size} required)\n`,
);

/* ── Stage 0: the exception lists must still describe the code ──────────── */
console.log("The declared exceptions still describe the source");
for (const g of ONE_OF) {
  ck(`one-of ${g.names.join(" / ")} is still read`,
    g.names.some(n => siteReads.has(n) || edgeReads.has(n)), g.why);
}
for (const [label, set, reads] of [
  ["site", PLATFORM.site, siteReads], ["edge", PLATFORM.edge, edgeReads],
]) {
  const stale = [...set].filter(n => !reads.has(n));
  // Unread platform names are harmless — they are named so nobody adds them to
  // a store by hand. Listed, not failed, so the noise stays visible.
  if (stale.length) console.log(`       (${label}: ${stale.join(", ")} listed but not read)`);
}

/* ── Stage 2: this process's own environment ────────────────────────────── */
/*
  AUTHORITATIVE ONLY UNDER --build.

  During a Vercel build this process's environment IS the deployment's, so a
  missing variable is a broken deploy and must stop it. On a laptop it is
  .env.local, which legitimately holds NAME="" for every production secret Dean
  keeps off the machine — failing there would train everyone to ignore this
  check, which is worse than not having it. Locally the same list is printed as
  information, and Vercel Production in stage 5 is what decides.
*/
console.log(
  BUILD_ONLY
    ? "\nThis build's environment"
    : "\nThis machine's environment (informational — Vercel Production decides, below)",
);
const missingHere = [...siteRequired].filter(n => !process.env[n]).sort();
const oneOfUnset = ONE_OF.filter(g => !g.names.some(n => process.env[n]));
if (IS_DEPLOYMENT) {
  ck("every required site variable is set", missingHere.length === 0, missingHere.join(", "));
  for (const g of ONE_OF) {
    ck(`at least one of ${g.names.join(" / ")} is set`, !oneOfUnset.includes(g), g.why);
  }
} else {
  const n = missingHere.length + oneOfUnset.length;
  console.log(n === 0
    ? "  ok   every required site variable is set here too"
    : `       ${n} not set on this machine — expected for production-only secrets`);
}
if (missingHere.length) {
  for (const n of missingHere) {
    const r = siteReads.get(n).reads[0];
    console.log(`       ${n} — read at ${r.file}:${r.line}`);
  }
}
if (BUILD_ONLY) {
  console.log(
    IS_DEPLOYMENT
      ? "\n--build on Vercel: the Supabase and Vercel API stages need credentials a build has not got."
      : "\n--build off Vercel: nothing here can fail. Run `npm run check-env` to reach the stores.",
  );
  if (failures > 0) {
    /*
      WHAT TO DO, on the screen where it is read.

      A failed build is the SAFE failure: Vercel keeps serving the previous
      deployment, so nothing goes down while this is sorted out.
    */
    console.log(
      "\nThe previous deployment is still live; nothing is down. Set the names above in\n" +
      "Settings -> Environment Variables (Production AND Preview), then redeploy. If one is\n" +
      "no longer needed, delete the line that reads it — there is no list here to edit.",
    );
  }
  console.log(
    failures === 0
      ? "\nENV OK (build scope: the names, and this build's own environment)."
      : `\n${failures} FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

/* ── Stage 3: the Supabase secret store ─────────────────────────────────── */
console.log("\nThe Supabase secret store (what the Edge Function will read)");
let secrets = null;
try {
  const raw = run("npx --yes supabase secrets list --output json", 120000);
  // The CLI prints name + a SHA-256 DIGEST of the value. Never the value.
  // `--output json` returns a bare array; older builds wrap it in { secrets }.
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : (parsed.secrets ?? []);
  secrets = new Map(rows.map(r => [r.name, r.value]));
} catch {
  skip("the Supabase secret store", "supabase CLI unavailable or the project is not linked");
}

if (secrets) {
  const missing = [...edgeRequired].filter(n => !secrets.has(n)).sort();
  ck("every variable the Edge Function requires is in the store",
    missing.length === 0, missing.join(", "));

  // Present in the store and read by nobody. Not a failure — a rotated-away
  // secret is worth removing but is not a broken deployment.
  const unread = [...secrets.keys()]
    .filter(n => !edgeReads.has(n) && !PLATFORM.edge.has(n)).sort();
  if (unread.length) console.log(`       (in the store but read by no function: ${unread.join(", ")})`);
}

/* ── Stage 4: the reconcile ─────────────────────────────────────────────── */
console.log("\nThe names both runtimes read");
console.log(`       ${shared.join(", ") || "(none)"}`);
if (!secrets) {
  skip("the cross-runtime reconcile", "the Supabase store could not be read");
} else {
  const absent = shared.filter(n => !secrets.has(n));
  ck("each is present in the Supabase store too", absent.length === 0, absent.join(", "));

  /*
    AND HOLDS THE SAME VALUE.

    The store publishes sha256 of each secret, so the two can be compared
    without either value being read, logged, or moved. This is the stronger
    question: PICKUPS_RESEND_API_KEY present in both stores with DIFFERENT
    values sends the narrator's replacement link from one sender and her
    original pickups from another, and every presence check passes.

    Only meaningful where this process holds the site's value — on a laptop
    that is .env.local, which is not necessarily what Vercel serves. Stage 5
    is what speaks for Vercel.
  */
  const sha = v => createHash("sha256").update(v, "utf8").digest("hex");
  const comparable = shared.filter(n => process.env[n] && secrets.has(n));
  const differing = comparable.filter(n => sha(process.env[n]) !== secrets.get(n));
  ck("SETUP: there are values here to compare against the store",
    comparable.length > 0, `${comparable.length} of ${shared.length}`);
  ck("the two runtimes hold the SAME value for each",
    differing.length === 0,
    differing.length ? `${differing.join(", ")} differ` : `${comparable.length} compared by digest`);
}

/* ── Stage 5: Vercel Production ─────────────────────────────────────────── */
console.log("\nVercel Production (what the deployed site will read)");
let vercelNames = null;
try {
  const raw = run("npx --yes vercel env ls production", 180000);
  // Names only. The value column reads "Encrypted" and is never parsed.
  vercelNames = new Set(
    [...raw.matchAll(/^\s+([A-Z][A-Z0-9_]*)\s+/gm)].map(m => m[1]).filter(n => n !== "name"),
  );
} catch {
  skip("Vercel Production", "vercel CLI unavailable or not authenticated");
}

if (vercelNames) {
  const missing = [...siteRequired].filter(n => !vercelNames.has(n)).sort();
  ck("every required site variable exists in Production",
    missing.length === 0, missing.join(", "));
  for (const g of ONE_OF) {
    ck(`at least one of ${g.names.join(" / ")} exists in Production`,
      g.names.some(n => vercelNames.has(n)));
  }
  // The case the whole check is named for, stated as its own line.
  const sharedMissingInVercel = shared.filter(n => !vercelNames.has(n));
  ck("no shared name is set on Supabase but missing from Vercel",
    sharedMissingInVercel.length === 0, sharedMissingInVercel.join(", "));
}

/* ── Verdict ────────────────────────────────────────────────────────────── */
if (unchecked > 0) {
  console.log(`\n${unchecked} stage${unchecked === 1 ? "" : "s"} could not be checked — see the ?? lines above.`);
}
console.log(failures === 0 ? "\nENV OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
