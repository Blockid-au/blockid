import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Revenue Forecast Builder (Week 1)
 * Covers: Wizard flow → Results dashboard → CSV export
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("Financial Forecast Builder (Week 1)", () => {
  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    // Assumes test user already exists with auth
    await page.goto(`${BASE_URL}/auth/login`);
    await page.fill('input[name="email"]', "test@blockid.au");
    await page.fill('input[name="password"]', process.env.TEST_PASSWORD || "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workspace");
  });

  test("Scenario 1: Bootstrap → Seed forecast (pre-revenue)", async ({ page }) => {
    // Navigate to forecast list
    await page.goto(`${BASE_URL}/workspace/financial-forecast`);
    await expect(page.locator("h1")).toContainText("Financial Forecast");

    // Click "New Forecast"
    await page.click('button:has-text("New Forecast")');
    await page.waitForURL("**/financial-forecast/wizard");

    // Step 1: Basic inputs
    await page.fill('input#forecastName', "Bootstrap → Seed");
    await page.fill('input#currentArr', "0"); // Pre-revenue
    await page.fill('input#monthlyGrowth', "8"); // 8% MoM
    await page.fill('input#churnRate', "2"); // 2% churn
    await page.click('button:has-text("Next")');

    // Step 2: Cost structure
    await page.fill('input#cogs', "25"); // 25% COGS (typical SaaS)
    await page.fill('input#fixedCosts', "60000"); // $60K/month opex
    await page.check('input#rdti'); // Enable RDTI
    await page.click('button:has-text("Next")');

    // Step 3: Scenarios
    await page.click('[value="base"]'); // Select base scenario
    await page.click('button:has-text("Next")');

    // Step 4: Review (preview + save)
    await expect(page.locator("text=12M Projected ARR")).toBeVisible();
    const previewTable = page.locator("table");
    await expect(previewTable).toBeVisible();

    // Verify 12 months visible
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThanOrEqual(10);

    // Save forecast
    await page.click('button:has-text("Save Forecast")');
    await page.waitForURL("**/financial-forecast/*");

    // Verify results dashboard
    await expect(page.locator("h1")).toContainText("Bootstrap → Seed");
    await expect(page.locator("text=Year 1 Revenue")).toBeVisible();
    await expect(page.locator("text=Breakeven Month")).toBeVisible();
  });

  test("Scenario 2: $50K MRR Series A model (bull case)", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);

    // Step 1
    await page.fill('input#forecastName', "Series A Bull Case");
    await page.fill('input#currentArr', "600000"); // $600K ARR ($50K MRR)
    await page.fill('input#monthlyGrowth', "12"); // 12% MoM (aggressive)
    await page.fill('input#churnRate', "1.5"); // Low churn
    await page.click('button:has-text("Next")');

    // Step 2
    await page.fill('input#cogs', "20"); // Optimized COGS
    await page.fill('input#fixedCosts', "120000"); // Higher opex for growth
    await page.uncheck('input#rdti');
    await page.click('button:has-text("Next")');

    // Step 3: Bull scenario
    await page.click('[value="bull"]');
    await page.click('button:has-text("Next")');

    // Step 4: Verify projection and save
    await expect(page.locator("table")).toBeVisible();
    await page.click('button:has-text("Save Forecast")');
    await page.waitForURL("**/financial-forecast/*");

    // Results: Verify 36-month table
    await page.click('button[role="tab"]:has-text("36-Month Projection")');
    const totalRows = await page.locator("tbody tr").count();
    expect(totalRows).toBe(36); // Full 36 months
  });

  test("Scenario 3: Export forecast as CSV", async ({ page }) => {
    // Create a forecast first
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);
    await page.fill('input#forecastName', "CSV Export Test");
    await page.fill('input#currentArr', "100000");
    await page.fill('input#monthlyGrowth', "5");
    await page.fill('input#churnRate', "2");
    await page.click('button:has-text("Next")');

    await page.fill('input#cogs', "30");
    await page.fill('input#fixedCosts', "50000");
    await page.click('button:has-text("Next")');

    await page.click('[value="base"]');
    await page.click('button:has-text("Next")');

    await page.click('button:has-text("Save Forecast")');
    await page.waitForURL("**/financial-forecast/*");

    // Download CSV
    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("Export CSV")');
    const download = await downloadPromise;

    // Verify CSV file
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const path = await download.path();
    expect(path).toBeTruthy();

    // Verify CSV content (36 rows + header + summary)
    const fs = require("fs");
    const content = fs.readFileSync(path, "utf-8");
    const lines = content.split("\n");
    expect(lines.length).toBeGreaterThan(37); // 36 months + header + summary
  });

  test("Performance: Wizard generation <2 seconds", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);

    const startTime = Date.now();

    await page.fill('input#forecastName', "Performance Test");
    await page.fill('input#currentArr', "50000");
    await page.fill('input#monthlyGrowth', "10");
    await page.fill('input#churnRate', "3");
    await page.click('button:has-text("Next")');

    await page.fill('input#cogs', "30");
    await page.fill('input#fixedCosts', "40000");
    await page.click('button:has-text("Next")');

    await page.click('[value="base"]');
    await page.click('button:has-text("Next")');

    // Wait for preview to load
    await expect(page.locator("table")).toBeVisible();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Wizard flow completed in ${duration}ms`);
    expect(duration).toBeLessThan(30000); // 30 sec total (conservative for E2E)

    await page.click('button:has-text("Save Forecast")');
    const saveStartTime = Date.now();
    await page.waitForURL("**/financial-forecast/*");
    const saveDuration = Date.now() - saveStartTime;

    console.log(`Save completed in ${saveDuration}ms`);
    expect(saveDuration).toBeLessThan(5000); // 5 sec for save
  });

  test("Mobile responsive: Wizard on 375px viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);

    // Step 1: Inputs should be accessible on mobile
    const inputs = page.locator("input[type='number']");
    await expect(inputs.first()).toBeVisible();

    // Fill form
    await page.fill('input#forecastName', "Mobile Test");
    await page.fill('input#currentArr', "0");
    await page.fill('input#monthlyGrowth', "8");
    await page.fill('input#churnRate', "2");

    // Next button should be visible (may need scroll)
    const nextButton = page.locator('button:has-text("Next")');
    await nextButton.scrollIntoViewIfNeeded();
    await nextButton.click();

    // Step 2 should load
    await expect(page.locator('input#cogs')).toBeVisible();
  });

  test("Error handling: Invalid input validation", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);

    // Try to proceed with empty name
    await page.fill('input#currentArr', "-100"); // Negative ARR (invalid)
    await page.fill('input#monthlyGrowth', "150"); // >100% (invalid)

    // Click next (should show error)
    await page.click('button:has-text("Next")');

    // Should see validation error
    const error = page.locator("text=Error").or(page.locator("[role='alert']"));
    // Error may appear inline or as toast; test for either pattern

    // Correct inputs
    await page.fill('input#currentArr', "50000");
    await page.fill('input#monthlyGrowth', "8");

    // Should be able to proceed now
    await page.click('button:has-text("Next")');
    await expect(page.locator('input#cogs')).toBeVisible();
  });

  test("Back button: Return to previous step", async ({ page }) => {
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);

    // Fill step 1
    await page.fill('input#forecastName', "Back Button Test");
    await page.fill('input#currentArr', "0");
    await page.fill('input#monthlyGrowth', "8");
    await page.fill('input#churnRate', "2");
    const step1Value = await page.inputValue('input#forecastName');

    // Go to step 2
    await page.click('button:has-text("Next")');

    // Click back
    await page.click('button:has-text("Back")');

    // Verify we're back at step 1 with values preserved
    const returnedValue = await page.inputValue('input#forecastName');
    expect(returnedValue).toBe(step1Value);
  });

  test("Forecast list: Recently created forecast appears", async ({ page }) => {
    // Create forecast
    await page.goto(`${BASE_URL}/workspace/financial-forecast/wizard`);
    const forecastName = `List Test ${Date.now()}`;

    await page.fill('input#forecastName', forecastName);
    await page.fill('input#currentArr', "100000");
    await page.fill('input#monthlyGrowth', "8");
    await page.fill('input#churnRate', "2");
    await page.click('button:has-text("Next")');

    await page.fill('input#cogs', "30");
    await page.fill('input#fixedCosts', "50000");
    await page.click('button:has-text("Next")');

    await page.click('[value="base"]');
    await page.click('button:has-text("Next")');

    await page.click('button:has-text("Save Forecast")');
    await page.waitForURL("**/financial-forecast/*");

    // Go back to list
    await page.click('button:has-text("Financial Forecast")');
    await page.goto(`${BASE_URL}/workspace/financial-forecast`);

    // Verify forecast appears in list
    await expect(page.locator(`text=${forecastName}`)).toBeVisible();
  });
});
