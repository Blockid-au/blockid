import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.BASE_URL ??
      process.env.DEMO_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`,
    viewport: { width: 1920, height: 1080 },
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testIgnore: ["**/a11y/**"],
      // iter-19 Gate 11 flake hardening: the post-deploy hydrated smoke runs
      // from scripts/deploy-live.sh WITHOUT the CI env var set, so the
      // top-level `retries: process.env.CI ? 1 : 0` collapses to 0 and a
      // transient CDN/hydration blip on /pricing false-fails the deploy.
      // Pin one retry on the chromium (smoke) project unconditionally so
      // transient flakes get exactly one auto-retry — real regressions still
      // fail the second attempt and block the release. Cap intentionally at
      // 1 to keep regressions visible; do NOT raise.
      retries: 1,
    },
    {
      name: "a11y",
      use: { browserName: "chromium" },
      testMatch: ["**/a11y/**/*.spec.ts"],
    },
  ],
});
