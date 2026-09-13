import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Playwright output (HTML reports, traces, artifacts) — the
    // live-qa report tripped deploy gate 4 with 184 "errors" from
    // Playwright's own bundled trace viewer (2026-09-13).
    "playwright-report/**",
    "playwright-report-live-qa/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
