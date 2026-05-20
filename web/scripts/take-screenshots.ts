import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";
import { resolve } from "path";

const OUTPUT_DIR = resolve(import.meta.dirname ?? ".", "../public/video-assets");
mkdirSync(OUTPUT_DIR, { recursive: true });

const WAIT: "domcontentloaded" = "domcontentloaded";
const TIMEOUT = 45000;
const SETTLE = 2000; // ms to wait after load for JS rendering

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  async function snap(name: string, url: string, scrollTo?: string) {
    console.log(`[${name}] Loading ${url}...`);
    try {
      await page.goto(url, { waitUntil: WAIT, timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, SETTLE));
      if (scrollTo) {
        await page.evaluate((sel) => {
          document.querySelector(sel)?.scrollIntoView({ behavior: "instant" });
        }, scrollTo);
        await new Promise(r => setTimeout(r, 1000));
      }
      await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png` });
      console.log(`  -> Saved ${name}.png`);
    } catch (err: any) {
      console.error(`  -> FAILED ${name}: ${err.message}`);
    }
  }

  // Screenshot 1: Homepage hero
  await snap("homepage-hero", "https://blockid.au");

  // Screenshot 2: SVI search bar area (scroll on same page)
  console.log("[svi-search] Scrolling to #svi on current page...");
  await page.evaluate(() => {
    document.querySelector("#svi")?.scrollIntoView({ behavior: "instant" });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUTPUT_DIR}/svi-search.png` });
  console.log("  -> Saved svi-search.png");

  // Screenshot 3: Pricing section (scroll on same page)
  console.log("[pricing] Scrolling to #pricing on current page...");
  await page.evaluate(() => {
    document.querySelector("#pricing")?.scrollIntoView({ behavior: "instant" });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUTPUT_DIR}/pricing.png` });
  console.log("  -> Saved pricing.png");

  // Screenshot 4: Score page
  await snap("score-page", "https://blockid.au/score");

  // Screenshot 5: Tools - Cap Table
  await snap("cap-table", "https://blockid.au/tools/cap-table");

  // Screenshot 6: Tools - Equity Split
  await snap("equity-split", "https://blockid.au/tools/equity-split");

  // Screenshot 7: Login page
  await snap("login", "https://blockid.au/auth/login");

  // Screenshot 8: About page
  await snap("about", "https://blockid.au/about");

  // Screenshot 9: Founding 50
  await snap("founding-50", "https://blockid.au/founding-50");

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUTPUT_DIR}/`);
}

main().catch(console.error);
