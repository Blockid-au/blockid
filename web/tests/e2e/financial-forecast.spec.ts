/**
 * E2E — Financial Forecast Builder (v3.6.9)
 *
 * Covers:
 *   1. Wizard create → save → results dashboard
 *   2. CSV export download (36 months + header)
 *   3. SVI dashboard regression (no breakage from v3.6.9 deploy)
 *   4. API health check (/api/health) — post-deploy smoke
 *
 * Auth strategy: QA login endpoint (fast). Falls back to sign-in form.
 * Selectors: getByRole / getByLabel only. No CSS class selectors.
 * No waitForTimeout — all waits are condition-based.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "./fixtures/accounts";

const QA_FOUNDER_EMAIL = process.env.QA_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";
const ASSERT_TIMEOUT = 15_000;

test.describe("Financial Forecast Builder — v3.6.9", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAs(page, QA_FOUNDER_EMAIL);
  });

  // ─── 1. Wizard: create → save → results ──────────────────────────────────

  test("wizard: basic (pre-revenue) → save → results dashboard", async ({ page }) => {
    await page.goto("/workspace/financial-forecast");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /new forecast/i }).click();
    await page.waitForURL(/\/financial-forecast\/wizard/, { timeout: ASSERT_TIMEOUT });
    await page.waitForLoadState("networkidle");

    // Step 1 — basic inputs
    await page.getByLabel(/forecast name/i).fill("Bootstrap Pre-Revenue");
    await page.getByLabel(/current arr/i).fill("0");
    await page.getByLabel(/monthly growth/i).fill("8");
    await page.getByLabel(/churn/i).fill("2");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2 — cost structure
    await page.getByLabel(/cost of goods sold/i).fill("25");
    await page.getByLabel(/monthly operating expenses/i).fill("60000");
    await page.getByLabel(/r&d tax incentive/i).check();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3 — scenario
    await page.getByRole("radio", { name: /base case/i }).check();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 4 — review: wait for preview to render
    await expect(
      page.getByRole("cell", { name: /month 1/i }).or(page.getByText(/12m projected arr/i)),
    ).toBeVisible({ timeout: ASSERT_TIMEOUT });

    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThanOrEqual(10);

    await page.getByRole("button", { name: /save forecast/i }).click();
    await page.waitForURL(/\/financial-forecast\/[^/]+$/, { timeout: ASSERT_TIMEOUT });
    await page.waitForLoadState("networkidle");

    // Results dashboard
    await expect(page.getByText(/bootstrap pre-revenue/i)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(page.getByText(/year 1 revenue/i)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(page.getByText(/breakeven month/i)).toBeVisible({ timeout: ASSERT_TIMEOUT });
  });

  test("wizard: $50K MRR bull case → 36-month tab shows all rows", async ({ page }) => {
    await page.goto("/workspace/financial-forecast/wizard");
    await page.waitForLoadState("networkidle");

    // Step 1
    await page.getByLabel(/forecast name/i).fill("Series A Bull Case");
    await page.getByLabel(/current arr/i).fill("600000");
    await page.getByLabel(/monthly growth/i).fill("12");
    await page.getByLabel(/churn/i).fill("1.5");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2
    await page.getByLabel(/cost of goods sold/i).fill("20");
    await page.getByLabel(/monthly operating expenses/i).fill("120000");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3
    await page.getByRole("radio", { name: /bull case/i }).check();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 4 — wait for table
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await page.getByRole("button", { name: /save forecast/i }).click();
    await page.waitForURL(/\/financial-forecast\/[^/]+$/, { timeout: ASSERT_TIMEOUT });
    await page.waitForLoadState("networkidle");

    // Navigate to 36-month tab
    await page.getByRole("tab", { name: /36.month projection/i }).click();
    const totalRows = await page.locator("tbody tr").count();
    expect(totalRows).toBe(36);
  });

  test("back button preserves step-1 values", async ({ page }) => {
    await page.goto("/workspace/financial-forecast/wizard");
    await page.waitForLoadState("networkidle");

    const nameInput = page.getByLabel(/forecast name/i);
    await nameInput.fill("Preserve Me");
    await page.getByLabel(/current arr/i).fill("0");
    await page.getByLabel(/monthly growth/i).fill("8");
    await page.getByLabel(/churn/i).fill("2");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByRole("button", { name: /back/i }).click();

    await expect(page.getByLabel(/forecast name/i)).toHaveValue("Preserve Me");
  });

  // ─── 2. CSV export ────────────────────────────────────────────────────────

  test("CSV export: file downloaded with correct header and ≥37 lines", async ({ page }) => {
    // Create a forecast to export
    await page.goto("/workspace/financial-forecast/wizard");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/forecast name/i).fill("CSV Export Test");
    await page.getByLabel(/current arr/i).fill("100000");
    await page.getByLabel(/monthly growth/i).fill("5");
    await page.getByLabel(/churn/i).fill("2");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByLabel(/cost of goods sold/i).fill("30");
    await page.getByLabel(/monthly operating expenses/i).fill("50000");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByRole("radio", { name: /base case/i }).check();
    await page.getByRole("button", { name: /next/i }).click();

    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await page.getByRole("button", { name: /save forecast/i }).click();
    await page.waitForURL(/\/financial-forecast\/[^/]+$/, { timeout: ASSERT_TIMEOUT });
    await page.waitForLoadState("networkidle");

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export csv/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

    const path = await download.path();
    expect(path).toBeTruthy();

    // Validate CSV content via streaming reader (no fs require — use download.createReadStream)
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const content = Buffer.concat(chunks).toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    // Expect 36 month rows + header + at least one summary row
    expect(lines.length).toBeGreaterThanOrEqual(37);
    // First line is header
    expect(lines[0].toLowerCase()).toMatch(/month|date|revenue/);
  });

  // ─── 3. SVI dashboard regression ─────────────────────────────────────────

  test("SVI dashboard: loads without error after v3.6.9 deploy", async ({ page }) => {
    await page.goto("/svi");
    await page.waitForLoadState("networkidle");

    // Page must not show an error state
    await expect(page.getByRole("heading")).not.toContainText(/error|500|not found/i, {
      timeout: ASSERT_TIMEOUT,
    });

    // SVI entry textarea or the score card must be present
    const sviPresent = page
      .getByRole("textbox")
      .or(page.getByText(/startup value index/i))
      .first();
    await expect(sviPresent).toBeVisible({ timeout: ASSERT_TIMEOUT });
  });

  test("forecast list: newly created forecast appears", async ({ page }) => {
    await page.goto("/workspace/financial-forecast/wizard");
    await page.waitForLoadState("networkidle");

    const uniqueName = `List Test ${Date.now()}`;
    await page.getByLabel(/forecast name/i).fill(uniqueName);
    await page.getByLabel(/current arr/i).fill("50000");
    await page.getByLabel(/monthly growth/i).fill("8");
    await page.getByLabel(/churn/i).fill("2");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByLabel(/cost of goods sold/i).fill("30");
    await page.getByLabel(/monthly operating expenses/i).fill("50000");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByRole("radio", { name: /base case/i }).check();
    await page.getByRole("button", { name: /next/i }).click();

    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await page.getByRole("button", { name: /save forecast/i }).click();
    await page.waitForURL(/\/financial-forecast\/[^/]+$/, { timeout: ASSERT_TIMEOUT });

    await page.goto("/workspace/financial-forecast");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: ASSERT_TIMEOUT });
  });
});

// ─── 4. API health check (post-deploy smoke, no browser) ─────────────────────

test.describe("Smoke — API health (v3.6.9 post-deploy)", () => {
  test.setTimeout(15_000);

  test("GET /api/health returns {ok:true}", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("GET /api/financial/forecast/generate returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/financial/forecast/generate", {
      data: { currentArrAud: 0, monthlyGrowthPct: 8, churnPct: 2, cogsPercent: 30, opexMonthlyAud: 50000, scenario: "base", sector: "saas" },
    });
    // Must reject unauthenticated calls — 401 or 403
    expect([401, 403]).toContain(res.status());
  });
});
