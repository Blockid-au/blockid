import { defineConfig } from "vitest/config";
import { resolve } from "path";

// `../scripts/**/*.test.mjs` pulls the autonomous-loop guard tests
// (scripts/cron/*.test.mjs) into the single `npm test` entry point. They
// are colocated with the guards they protect, which live outside web/.
// `tests/chrome/**/*.test.ts` pulls the structural CI regression guards
// (shell-coverage, etc.) that walk the filesystem — they live in tests/
// because they are integration-level checks, not unit tests colocated
// with source files.
// `scripts/docs/**/*.test.ts` pins the generated docs (G8-P8 unlock
// matrix) against the committed markdown + JSON so a nav / gate change
// without `node scripts/docs/render-unlock-matrix.mjs` fails here.
const UNIT_INCLUDE = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "tests/chrome/**/*.test.ts",
  // G15-R1: live-QA helper units (Retry-After / 52x classification / stale
  // run-state) — the specs themselves stay out of vitest (Playwright only).
  "tests/live-qa/lib/*.test.ts",
  "scripts/docs/**/*.test.ts",
  "scripts/codemods/**/*.test.mjs",
  // S23-B: CLI wrappers colocated with their script (scripts/<name>.test.mjs).
  "scripts/*.test.mjs",
  // QA-2 P0: migration parity parser + ledger status (scripts/db/*.test.mjs).
  "scripts/db/*.test.mjs",
  // G14-S39: the SVI backtest runner (tsx script with `@/` imports).
  "scripts/backtest/*.test.ts",
  // G21 P3-A: the score → outcome calibration runner (tsx script with `@/` imports).
  "scripts/calibration/*.test.ts",
  // G14-S40: the external-signals ingest CLI + adapters (plain node, fixtures).
  "scripts/external-signals/*.test.mjs",
  // G19-S47: restructure a stored report_v2 without an AI run (fake-db unit).
  "scripts/report/*.test.mjs",
  "../scripts/**/*.test.mjs",
];

// G15-R1 (evidence E6): react-pdf renders routinely take 5–12 s under
// full-suite load and tripped the 5 s default, so every PDF test file runs
// in its own project with a 20 s `testTimeout`. A project-level override —
// no per-test `{ timeout }` edits, and no global raise that would let a hung
// unit test hide behind a generous ceiling. Everything else keeps 5 s.
const PDF_INCLUDE = [
  "src/**/pdf/**/*.test.ts",
  "src/**/pdf/**/*.test.tsx",
  "src/**/*-pdf.test.tsx",
  "src/**/pdf/route.test.ts",
];

const EXCLUDE = ["**/node_modules/**", "**/.next/**"];

export default defineConfig({
  test: {
    // First-import hooks (page graphs) exceed 10 s under deploy-gate load and
    // per-hook timeouts do not cover every hook — raise the default once for
    // every project (unit + pdf). Gate 6 flaked on this 2026-09-20.
    hookTimeout: 30_000,
    exclude: EXCLUDE,
    // With `projects` set, tests are collected per project only — the root
    // `test` block is shared config (`extends: true` inherits it, arrays are
    // concatenated by Vite's mergeConfig, so keep `include` OUT of the root).
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: UNIT_INCLUDE,
          exclude: PDF_INCLUDE,
        },
      },
      {
        extends: true,
        test: {
          name: "pdf",
          include: PDF_INCLUDE,
          testTimeout: 20_000,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "src/test/server-only-shim.ts"),
    },
  },
});
