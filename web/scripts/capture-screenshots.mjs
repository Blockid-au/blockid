/**
 * Capture production screenshots for BlockID.au pitch videos.
 * Run: node scripts/capture-screenshots.mjs
 */
import { chromium } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "video-assets");
const BASE = "http://127.0.0.1:4001";

// Admin session for protected pages
const ADMIN_SESSION = process.env.ADMIN_SESSION || "";

const PAGES = [
  // Public pages
  { name: "homepage-hero", url: "/", wait: 2000 },
  { name: "svi-search", url: "/", wait: 2000, scroll: 800 },
  { name: "pricing", url: "/pricing", wait: 1500 },
  { name: "founding-50", url: "/founding-50", wait: 1500 },
  { name: "about", url: "/about", wait: 1500 },
  { name: "investors", url: "/investors", wait: 1500 },
  { name: "developers", url: "/developers", wait: 1500 },
  { name: "login", url: "/auth/login", wait: 1500 },
  // Tools
  { name: "tool-dilution", url: "/tools/dilution", wait: 1500 },
  { name: "tool-cap-table", url: "/tools/cap-table", wait: 1500 },
  { name: "tool-equity-split", url: "/tools/equity-split", wait: 1500 },
  { name: "tool-term-sheet", url: "/tools/term-sheet", wait: 1500 },
  { name: "tool-idea-valuation", url: "/tools/idea-valuation", wait: 1500 },
  { name: "tool-esic", url: "/tools/esic", wait: 1500 },
  { name: "tool-rnd-tax", url: "/tools/rnd-tax", wait: 1500 },
  { name: "tool-data-room", url: "/tools/data-room", wait: 1500 },
];

// Protected pages (need session cookie)
const PROTECTED = [
  { name: "dashboard", url: "/dashboard/svi", wait: 2000 },
  { name: "evidence-vault", url: "/workspace/evidence", wait: 1500 },
  { name: "data-room", url: "/workspace/data-room", wait: 1500 },
  { name: "billing", url: "/workspace/billing", wait: 1500 },
  { name: "projects", url: "/workspace/projects", wait: 1500 },
  { name: "equity", url: "/workspace/equity", wait: 1500 },
  { name: "reports", url: "/workspace/reports", wait: 1500 },
  { name: "roadmap", url: "/workspace/roadmap", wait: 1500 },
  { name: "profile", url: "/workspace/profile", wait: 1500 },
  { name: "admin-dashboard", url: "/admin", wait: 1500 },
  { name: "admin-roadmap", url: "/admin/roadmap", wait: 1500 },
  { name: "admin-team", url: "/admin/team", wait: 1500 },
  { name: "admin-self-analysis", url: "/admin/self-analysis", wait: 2000 },
];

async function run() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });

  // Capture public pages
  console.log(`\n=== Capturing ${PAGES.length} public pages ===`);
  for (const p of PAGES) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(p.wait);
      if (p.scroll) await page.evaluate((y) => window.scrollTo(0, y), p.scroll);
      if (p.scroll) await page.waitForTimeout(500);
      const path = join(OUT, `${p.name}.png`);
      await page.screenshot({ path, fullPage: false });
      console.log(`  ✓ ${p.name}.png`);
    } catch (err) {
      console.log(`  ✗ ${p.name}: ${err.message}`);
    }
    await page.close();
  }

  // Capture protected pages (with session cookie)
  if (ADMIN_SESSION) {
    console.log(`\n=== Capturing ${PROTECTED.length} protected pages ===`);
    await context.addCookies([{
      name: "blockid_session",
      value: ADMIN_SESSION,
      domain: "127.0.0.1",
      path: "/",
    }]);

    for (const p of PROTECTED) {
      const page = await context.newPage();
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForTimeout(p.wait);
        const path = join(OUT, `${p.name}.png`);
        await page.screenshot({ path, fullPage: false });
        console.log(`  ✓ ${p.name}.png`);
      } catch (err) {
        console.log(`  ✗ ${p.name}: ${err.message}`);
      }
      await page.close();
    }
  } else {
    console.log("\n⚠ ADMIN_SESSION not set — skipping protected pages");
    console.log("  Run: ADMIN_SESSION=<token> node scripts/capture-screenshots.mjs");
  }

  await browser.close();
  console.log("\n✓ Done! Screenshots saved to public/video-assets/");
}

run().catch(console.error);
