/**
 * Lint gates the deploy — on NEW errors, not on the whole backlog.
 *
 * ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
 *
 * CorrectionDiff.tsx shipped creating a component type during render — a real
 * defect that discarded state on every render. The reason it got through was
 * that eslint had been run on its neighbours and not on it. FIXING THAT
 * COMPONENT DID NOT CLOSE THE GAP: the next new file lands exactly the same way
 * as long as linting depends on somebody choosing the right paths.
 *
 * ── WHY A BASELINE AND NOT "FAIL ON ANY ERROR" ─────────────────────────────
 *
 * The tree has 22 pre-existing errors across 12 files, almost all on the public
 * marketing pages, none of them in anything this work touched. Turning the gate
 * on absolutely would fail every deploy until they were all fixed — which is a
 * large unscoped change to working pages, made under deadline pressure, which is
 * how a lint cleanup breaks a live site.
 *
 * So the gate is on MOVEMENT: no file may gain errors, and no file that is
 * currently clean may acquire one. That is precisely the failure that happened,
 * and it cannot happen again. The backlog stays visible and countable in the
 * baseline rather than dissolved into 1600 warnings, and paying it down is a
 * matter of regenerating a smaller file.
 *
 * Usage:  npm run check-lint              gate
 *         npm run check-lint -- --write   re-record the baseline (only ever
 *                                         after errors go DOWN)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BASELINE = join(ROOT, "eslint-baseline.json");
const WRITE = process.argv.includes("--write");

let raw = "";
try {
  // execSync through a shell, not execFileSync on npx.cmd — the latter returns
  // nothing on Windows and, with stderr discarded, is indistinguishable from
  // "eslint is not installed". check-env was bitten by exactly this.
  raw = execSync("npx eslint . -f json", {
    encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (e) {
  // eslint exits non-zero when it finds errors — that is the normal path here,
  // and its stdout is still the report.
  raw = e.stdout?.toString() ?? "";
}
if (!raw.trim()) {
  console.error("eslint produced no report — treating that as a failure, not a pass.");
  process.exit(2);
}

const report = JSON.parse(raw);
const current = {};
for (const f of report) {
  const n = f.messages.filter(m => m.severity === 2).length;
  if (n > 0) current[relative(ROOT, f.filePath).split("\\").join("/")] = n;
}
const total = Object.values(current).reduce((a, b) => a + b, 0);

if (WRITE) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
  console.log(`baseline recorded: ${total} error(s) in ${Object.keys(current).length} file(s)`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error("No eslint-baseline.json. Run `npm run check-lint -- --write` once.");
  process.exit(2);
}
const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);

// THE POSITIVE CONTROL. A report covering nothing would show zero regressions
// and mean nothing at all — which is the shape of the bug this replaces.
console.log(`eslint read ${report.length} files; ${total} error(s) now, ${baseTotal} recorded`);
let failures = 0;
if (report.length < 50) {
  console.log(`  FAIL it only saw ${report.length} files — it is not covering the tree`);
  failures++;
} else {
  console.log(`  ok   it covered the tree, not a hand-picked list`);
}

const worse = Object.entries(current).filter(([f, n]) => n > (base[f] ?? 0));
if (worse.length > 0) {
  console.log(`  FAIL ${worse.length} file(s) gained errors:`);
  for (const [f, n] of worse) {
    const was = base[f] ?? 0;
    console.log(`         ${f}  ${was} -> ${n}${was === 0 ? "   (a clean file acquired one)" : ""}`);
    for (const m of report.find(r => relative(ROOT, r.filePath).split("\\").join("/") === f).messages.filter(m => m.severity === 2)) {
      console.log(`           ${m.line}:${m.column}  ${m.ruleId}  ${m.message.split("\n")[0].slice(0, 90)}`);
    }
  }
  failures++;
} else {
  console.log(`  ok   no file gained an error`);
}

const fixed = Object.entries(base).filter(([f, n]) => (current[f] ?? 0) < n);
if (fixed.length > 0) {
  console.log(`       ${fixed.length} file(s) improved — re-record with --write to lock the gain in`);
}

console.log(failures === 0 ? "\nLINT OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
