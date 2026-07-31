import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // `../scripts/**/*.test.mjs` pulls the autonomous-loop guard tests
    // (scripts/cron/*.test.mjs) into the single `npm test` entry point. They
    // are colocated with the guards they protect, which live outside web/.
    include: ["src/**/*.test.ts", "../scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "src/test/server-only-shim.ts"),
    },
  },
});
