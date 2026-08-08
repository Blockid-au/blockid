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
    include: [
      "src/**/*.test.ts",
      "tests/chrome/**/*.test.ts",
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
