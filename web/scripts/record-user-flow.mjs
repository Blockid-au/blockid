/**
 * record-user-flow.mjs
 *
 * Playwright screen recording of the full BlockID.au user journey.
 * Outputs to public/video-assets/blockid_user_flow.webm then converts to mp4.
 *
 * Usage: node scripts/record-user-flow.mjs
 */

import { chromium } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { rename } from "fs/promises";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "video-assets");
const BASE = "http://127.0.0.1:4001";

async function run() {
  console.log("Launching browser...");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();

  // Helper: smooth scroll down by a given amount over duration ms
  async function smoothScroll(pixels, durationMs = 2000) {
    const steps = 20;
    const stepPx = Math.round(pixels / steps);
    const stepDelay = Math.round(durationMs / steps);
    for (let i = 0; i < steps; i++) {
      await page.evaluate((px) => window.scrollBy(0, px), stepPx);
      await page.waitForTimeout(stepDelay);
    }
  }

  try {
    // ── 1. Homepage (3s) — show hero, scroll down slowly ──────────────
    console.log("Step 1: Homepage");
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
    await smoothScroll(600, 2000);
    await page.waitForTimeout(500);

    // ── 2. Click "Start Your Journey" → scrolls to SVI section ───────
    console.log("Step 2: Start Your Journey");
    // Scroll back to top first so the button is visible
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(500);
    try {
      const ctaBtn = page.locator("text=Start Your Journey").first();
      await ctaBtn.click({ timeout: 5000 });
    } catch {
      // Fallback: scroll directly to the SVI section
      await page.evaluate(() => {
        const el = document.querySelector("textarea");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    await page.waitForTimeout(1500);

    // ── 3. Type in search bar ────────────────────────────────────────
    console.log("Step 3: Type SVI query");
    const textarea = page.locator("textarea").first();
    await textarea.click();
    await page.waitForTimeout(300);
    await textarea.type(
      "AI SaaS platform for Australian accountants. Two co-founders, 5 years experience. Working MVP with 10 paying customers. ABN registered.",
      { delay: 40 }
    );
    await page.waitForTimeout(1000);

    // ── 4. Click "Get My SVI" → show loading, wait for results ──────
    console.log("Step 4: Submit SVI");
    const submitBtn = page.locator("button", { hasText: "Get My SVI" }).first();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Wait for results to appear (the spinner disappears, results panel shows)
    try {
      await page.waitForSelector('[class*="svi-result"], [data-testid="svi-results"], h2:has-text("SVI Score"), h2:has-text("Startup Viability")', {
        timeout: 120000,
      });
    } catch {
      // If no specific selector found, just wait a reasonable time
      console.log("  Waiting extra time for results...");
      await page.waitForTimeout(30000);
    }
    await page.waitForTimeout(2000);

    // ── 5. Results page — scroll through the report slowly (10s) ─────
    console.log("Step 5: Browse results");
    await smoothScroll(3000, 10000);
    await page.waitForTimeout(1000);

    // ── 6. Click login → show login page ────────────────────────────
    console.log("Step 6: Login page");
    await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    // ── 7. Show pricing page (3s) ───────────────────────────────────
    console.log("Step 7: Pricing page");
    await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);
    await smoothScroll(400, 2000);
    await page.waitForTimeout(500);

    // ── 8. Show dilution calculator (2s) ────────────────────────────
    console.log("Step 8: Dilution calculator");
    await page.goto(`${BASE}/tools/dilution`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log("Recording complete. Closing browser...");
  } catch (err) {
    console.error("Error during recording:", err);
  }

  // Close context to finalize the video
  await page.close();
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (!videoPath) {
    console.error("No video file was created.");
    process.exit(1);
  }

  // Rename to a known filename
  const finalWebm = join(OUT, "blockid_user_flow.webm");
  const finalMp4 = join(OUT, "blockid_user_flow.mp4");

  console.log(`Video saved at: ${videoPath}`);
  await rename(videoPath, finalWebm);
  console.log(`Renamed to: ${finalWebm}`);

  // Convert to mp4 with ffmpeg
  console.log("Converting to mp4...");
  try {
    execSync(
      `ffmpeg -y -i "${finalWebm}" -c:v libx264 -crf 23 -preset fast -movflags +faststart "${finalMp4}"`,
      { stdio: "inherit" }
    );
    console.log(`MP4 saved at: ${finalMp4}`);
  } catch (err) {
    console.error("FFmpeg conversion failed:", err.message);
    console.log(`WebM is still available at: ${finalWebm}`);
  }

  console.log("Done!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
