import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A STALE DEPENDENCY IS A WRONG ANSWER AT HTTP 200, so it is an error here
    // rather than a warning.
    //
    // /payments showed all 33 projects as uncostable for two days because a
    // useMemo read `finishedRate` and did not list it. The rule had been
    // reporting it the whole time and it read as pre-existing noise, because
    // the deps line was older than the bug: it was written when the settings
    // hook returned a complete object on its first render, so the value never
    // changed after mount and omitting it was harmless. Giving that hook a
    // loading state made the value arrive late, and every one of those
    // warnings became live on the same commit.
    //
    // Their AGE was evidence about the old invariant and said nothing about
    // the new one. A warning nobody must act on is indistinguishable from one
    // nobody has acted on yet; an error cannot be left in that state.
    rules: {
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
