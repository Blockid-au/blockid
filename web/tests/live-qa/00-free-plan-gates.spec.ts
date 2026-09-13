/**
 * 00 — Free-plan gates (runs BEFORE 01-elevate flips the plan).
 * Lane 1 #11, #15, #23, #39; lane 2 "plan gates 402 feature_locked".
 */
import { test, expect } from "./fixtures";
import { evidence, get, post } from "./lib/api";

test.describe.configure({ mode: "serial" });

test.describe("Free plan gates", () => {
  test("account is on Free with the welcome credits before any journey", async ({ api, qa }, testInfo) => {
    const me = await get<{ ok: boolean; user: { plan?: string; email?: string } | null }>(api, "/api/auth/me");
    const credits = await get<{ ok: boolean; balance: number; plan?: string }>(api, "/api/credits");
    await evidence(testInfo, "auth/me + credits", { me: me.body, credits: credits.body, runEmail: qa.email });
    expect(me.body.ok).toBe(true);
    expect(me.body.user?.email).toBe(qa.email);
    expect(qa.plan).toBe("free");
    expect(credits.status).toBe(200);
    expect(credits.body.balance).toBeGreaterThanOrEqual(0);
  });

  test("/workspace/cap-table on Free redirects to /pricing with feature=cap_table.write", async ({ page, visit }, testInfo) => {
    await visit("/workspace/cap-table");
    await page.waitForURL(/\/pricing/, { timeout: 30_000 });
    const url = new URL(page.url());
    await evidence(testInfo, "redirect", { landed: page.url() });
    expect(url.pathname).toBe("/pricing");
    expect(url.searchParams.get("feature")).toBe("cap_table.write");
    expect(url.searchParams.get("from")).toBe("/workspace/cap-table");
  });

  for (const path of ["/workspace/listing-readiness", "/workspace/clean-room"]) {
    test(`${path} on Free redirects to /pricing?from=${path}`, async ({ page, visit }, testInfo) => {
      await visit(path);
      await page.waitForURL(/\/pricing/, { timeout: 30_000 });
      const url = new URL(page.url());
      await evidence(testInfo, "redirect", { landed: page.url() });
      expect(url.pathname).toBe("/pricing");
      expect(url.searchParams.get("from")).toBe(path);
    });
  }

  test("/workspace/secondary-offer on Free shows the sandbox banner and the Growth lock, not an error", async ({ page, visit }, testInfo) => {
    await visit("/workspace/secondary-offer");
    await expect(page.getByTestId("sandbox-banner")).toBeVisible();
    await expect(page.getByTestId("sandbox-banner")).toContainText(/no real securities/i);
    const locked = page.getByTestId("sim-locked");
    await expect(locked).toBeVisible();
    await expect(locked).toContainText(/part of Growth and above/);
    const submit = page.getByTestId("sim-submit");
    if (await submit.count()) await expect(submit).toBeDisabled();
    await evidence(testInfo, "lock copy", { locked: await locked.innerText() });
  });

  test("sandbox order API on Free is 402 feature_locked (secondary_market.view)", async ({ api }, testInfo) => {
    const r = await post(api, "/api/secondary/sim/orders", { side: "buy", price: 1, qty: 1 });
    await evidence(testInfo, "POST /api/secondary/sim/orders", r.body);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("feature_locked");
  });

  test("fundraise wizard on Free with no cap table dead-ends with an upgrade link (lane-1 F8 fix)", async ({ page, api, visit }, testInfo) => {
    const apiTry = await post(api, "/api/fundraise", {
      roundName: "Seed",
      targetAmount: 500_000,
      preMoneyValuation: 2_000_000,
      instrumentType: "safe",
    });
    await evidence(testInfo, "POST /api/fundraise (no shareholders, Free)", apiTry.body);
    expect(apiTry.status).toBe(400);
    expect(String(apiTry.body.error)).toMatch(/No shareholders found/);

    await visit("/workspace/fundraise");
    await page.getByRole("button", { name: /Calculate Share Price/ }).click();
    const deadEnd = page.getByTestId("fundraise-cap-table-dead-end");
    await expect(deadEnd).toBeVisible({ timeout: 30_000 });
    await expect(deadEnd).toContainText(/priced against your cap table/);
    const link = deadEnd.getByRole("link");
    await expect(link).toHaveAttribute("href", /\/pricing\?feature=cap_table\.write&from=fundraise/);
    await evidence(testInfo, "dead-end copy", { text: await deadEnd.innerText(), href: await link.getAttribute("href") });
  });
});
