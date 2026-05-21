import { chromium } from "playwright";
import { join } from "path";

const OUT = "/home/dovanlong/blockid.au/web/public/video-assets/demo";
const BASE = "https://blockid.au";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  // 1. Homepage
  console.log("1. Homepage...");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "01-homepage.png") });

  // 2. Login
  console.log("2. Login...");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  // Try email login
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill("admin@blockid.au");
    const passInput = page.locator('input[type="password"]').first();
    if (await passInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passInput.fill("Aus2026$");
      const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(5000);
      }
    }
  } else {
    // Maybe magic link or OAuth — try clicking email option
    const emailOption = page.locator('text=Email, text=email, button:has-text("email")').first();
    if (await emailOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailOption.click();
      await page.waitForTimeout(1000);
      const input = page.locator('input[type="email"]').first();
      await input.fill("admin@blockid.au");
      const passField = page.locator('input[type="password"]').first();
      if (await passField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passField.fill("Aus2026$");
      }
      const btn = page.locator('button[type="submit"]').first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(5000);
      }
    }
  }

  await page.screenshot({ path: join(OUT, "02-after-login.png") });
  console.log("  Current URL:", page.url());

  // 3. SVI Dashboard
  console.log("3. SVI Dashboard...");
  await page.goto(`${BASE}/dashboard/svi`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, "03-svi-dashboard.png") });

  // 4. Workspace Projects
  console.log("4. Projects...");
  await page.goto(`${BASE}/workspace/projects`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "04-projects.png") });

  // 5. Evidence Vault
  console.log("5. Evidence...");
  await page.goto(`${BASE}/workspace/evidence`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "05-evidence.png") });

  // 6. Equity Setup
  console.log("6. Equity Setup...");
  await page.goto(`${BASE}/workspace/equity-setup`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "06-equity-setup.png") });

  // 7. Cap Table
  console.log("7. Cap Table...");
  await page.goto(`${BASE}/workspace/cap-table`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "07-cap-table.png") });

  // 8. Shareholders
  console.log("8. Shareholders...");
  await page.goto(`${BASE}/workspace/shareholders`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "08-shareholders.png") });

  // 9. Vesting
  console.log("9. Vesting...");
  await page.goto(`${BASE}/workspace/vesting`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "09-vesting.png") });

  // 10. ESOP
  console.log("10. ESOP...");
  await page.goto(`${BASE}/workspace/esop`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "10-esop.png") });

  // 11. Data Room
  console.log("11. Data Room...");
  await page.goto(`${BASE}/workspace/data-room`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "11-data-room.png") });

  // 12. Wallet / Blockchain
  console.log("12. Wallet...");
  await page.goto(`${BASE}/workspace/wallet`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "12-wallet.png") });

  // 13. Dividends
  console.log("13. Dividends...");
  await page.goto(`${BASE}/workspace/dividends`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "13-dividends.png") });

  // 14. Equity Split Tool
  console.log("14. Equity Split Tool...");
  await page.goto(`${BASE}/tools/equity-split`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "14-equity-split-tool.png") });

  // 15. Pricing
  console.log("15. Pricing...");
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "15-pricing.png") });

  // 16. Fundraise
  console.log("16. Fundraise...");
  await page.goto(`${BASE}/workspace/fundraise`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "16-fundraise.png") });

  // 17. Weekly Reports
  console.log("17. Reports...");
  await page.goto(`${BASE}/workspace/reports`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "17-reports.png") });

  // 18. Revenue
  console.log("18. Revenue...");
  await page.goto(`${BASE}/workspace/revenue`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "18-revenue.png") });

  await browser.close();
  console.log("\nDone! Screenshots saved to:", OUT);
}

main().catch(console.error);
