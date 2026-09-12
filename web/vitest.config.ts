import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
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
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/chrome/**/*.test.ts",
      "scripts/docs/**/*.test.ts",
      "scripts/codemods/**/*.test.mjs",
      "../scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "src/test/server-only-shim.ts"),
    },
  },
});
