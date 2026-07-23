import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // axe.spec.ts requires @axe-core/playwright (separate dep, not provisioned here).
  testIgnore: ["**/a11y/axe.spec.ts"],
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
    },
  ],
});
