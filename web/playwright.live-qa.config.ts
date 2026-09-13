/**
 * Live-QA Playwright project (S30-A) — runs the S25–S29 founder journeys
 * against PRODUCTION with one throw-away founder account per run.
 *
 * Separate from playwright.config.ts on purpose: the deploy's Gate 12 only
 * ever runs `tests/e2e/smoke/post-deploy.spec.ts` through that config
 * (testDir ./tests/e2e), and vitest's include list never touches tests/live-qa,
 * so nothing here can leak into a deploy or `npm test`.
 *
 *   npm run qa:live                # or: bash scripts/qa-live.sh
 *   LIVE_QA_BASE_URL=…             # default https://blockid.au
 *   LIVE_QA_ALLOW_DB=1             # permit the local psql steps (elevate / phase)
 *   LIVE_QA_ELEVATE=1              # set app_users.plan = 'growth' for the QA email
 *   LIVE_QA_SPEND_OK=1             # allow confirming a paid action (never by default)
 *   LIVE_QA_KEEP_ACCOUNT=1         # skip the erasure (debugging only — never in cron)
 *
 * Serial, one worker, no retries: every spec shares the account/project the
 * global setup provisioned and several journeys build on the previous one
 * (cap table → dividends → fundraise). A retry would re-run a mutating step
 * against state the first attempt already changed; the specs are idempotent
 * within a run but the evidence would be misleading.
 */
import { defineConfig } from "@playwright/test";
import path from "node:path";

export const LIVE_QA_OUT = path.join(__dirname, "test-results", "live-qa");
export const LIVE_QA_STORAGE = path.join(LIVE_QA_OUT, "storage-state.json");

const baseURL = (process.env.LIVE_QA_BASE_URL ?? "https://blockid.au").replace(/\/+$/, "");

export default defineConfig({
  testDir: "./tests/live-qa",
  testMatch: ["**/*.spec.ts"],
  outputDir: path.join(LIVE_QA_OUT, "artifacts"),
  globalSetup: "./tests/live-qa/global-setup.ts",
  globalTeardown: "./tests/live-qa/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-live-qa", open: "never" }],
    ["json", { outputFile: path.join(LIVE_QA_OUT, "results.json") }],
  ],
  use: {
    baseURL,
    storageState: LIVE_QA_STORAGE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: false,
    // Production is behind Cloudflare — identify the suite so the ops log can
    // tell a QA run from a visitor (never a secret, never an allow-list key).
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BlockID-LiveQA/1.0`,
  },
  projects: [
    // Order matters: with one worker Playwright runs the projects in the
    // order listed, so the mobile layout specs see the data the desktop
    // journeys created. No `dependencies` on purpose — a product bug caught
    // by a desktop journey must not silence the mobile layout checks.
    {
      name: "live-qa",
      use: { browserName: "chromium", viewport: { width: 1366, height: 900 } },
      testIgnore: ["**/*.mobile.spec.ts"],
    },
    {
      name: "live-qa-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
      testMatch: ["**/*.mobile.spec.ts"],
    },
  ],
});
