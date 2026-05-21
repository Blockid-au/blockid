/**
 * Playwright Demo Recording — Startup World Cup Sydney 2026
 *
 * Records a walkthrough of blockid.au for the pitch video.
 * Captures screenshots at key moments for the Remotion ScreenDemo component.
 *
 * Usage:
 *   npx playwright test tests/record-swc-demo.spec.ts --headed
 *
 * Output:
 *   - Screenshots: public/video-assets/screenshots/swc/
 *   - Video: public/video-assets/demo-swc-raw.webm
 */

import { test } from "@playwright/test";
import { join } from "path";

const BASE_URL = process.env.DEMO_URL ?? "https://blockid.au";
const SCREENSHOT_DIR = join(process.cwd(), "public", "video-assets", "screenshots", "swc");
const SAMPLE_IDEA = "An AI-powered marketplace connecting Australian property managers with vetted contractors for emergency maintenance. Using predictive analytics to pre-position tradespeople near high-risk properties before issues occur.";

test.use({
  viewport: { width: 1920, height: 1080 },
  video: { mode: "on", size: { width: 1920, height: 1080 } },
  launchOptions: { slowMo: 100 }, // slightly slower for smooth recording
});

test("SWC pitch demo recording", async ({ page }) => {
  // Step 1: Homepage — SVI search hero
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "01-homepage-hero.png") });

  // Step 2: Type startup idea into search
  const textarea = page.locator("textarea").first();
  await textarea.click();
  await page.waitForTimeout(500);

  // Type with realistic speed
  for (const char of SAMPLE_IDEA) {
    await textarea.press(char === "\n" ? "Enter" : char, { delay: 30 });
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "02-idea-typed.png") });

  // Step 3: Click "Get My SVI"
  const submitBtn = page.locator('button:has-text("Get My SVI")');
  await submitBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "03-analyzing.png") });

  // Step 4: Wait for results (SSE loading)
  // The analysis takes 30-60s in production. We wait and capture key frames.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "04-sse-progress.png") });

  // Wait for score to appear (up to 90 seconds)
  try {
    await page.waitForSelector('[id="svi-results"]', { timeout: 90000 });
    await page.waitForTimeout(2000);
  } catch {
    // If results don't load, capture current state
    await page.screenshot({ path: join(SCREENSHOT_DIR, "04b-timeout.png") });
  }
  await page.screenshot({ path: join(SCREENSHOT_DIR, "05-svi-score.png") });

  // Step 5: Scroll to dimension breakdown
  await page.evaluate(() => {
    document.querySelector('[id="svi-results"]')?.scrollIntoView({ behavior: "smooth" });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "06-dimensions.png") });

  // Step 6: Scroll further to see gaps/recommendations
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "07-gaps.png") });

  // Step 7: Navigate to Evidence Vault (if logged in)
  await page.goto(`${BASE_URL}/workspace/evidence`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "08-evidence-vault.png") });

  // Step 8: Show the Analyze button (if evidence items exist)
  const analyzeBtn = page.locator('button:has-text("Analyze")').first();
  if (await analyzeBtn.isVisible()) {
    await analyzeBtn.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "09-analyze-button.png") });
  }

  // Step 9: Navigate to dashboard
  await page.goto(`${BASE_URL}/dashboard/svi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "10-dashboard.png") });

  // Step 10: Show tools page
  await page.goto(`${BASE_URL}/tools`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "11-tools.png") });

  // Final: Back to homepage for clean ending
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "12-final-hero.png") });
});
