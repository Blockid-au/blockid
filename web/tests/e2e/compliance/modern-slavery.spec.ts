// E2E — POST /api/compliance/modern-slavery-threshold flags the A$100M crossing.
// Mirrors the gst.spec.ts shape (P1n-persist route hookup).

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

test.describe("Compliance — Modern Slavery Act A$100M threshold", () => {
  test.setTimeout(30_000);

  test("current-period revenue ≥ A$100M → statement_required, warning", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    // In-flight FY that will finish above the A$100M threshold — the detector
    // classifies this as statement_required (warning) until the FY closes.
    const res = await page.request.post(
      "/api/compliance/modern-slavery-threshold",
      {
        data: {
          current_period_revenue_aud: 60_000_000,
          projected_full_period_revenue_aud: 120_000_000,
          is_australian_or_carrying_on_business_in_au: true,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.action_required).toBe("statement_required");
    expect(body.result.urgency).toBe("warning");
    expect(body.result.is_above_threshold).toBe(true);
    expect(body.result.is_reporting_entity).toBe(true);
    expect(body.result.threshold_aud).toBe(100_000_000);
    expect(typeof body.result.disclaimer).toBe("string");
  });

  test("revenue well below A$100M → not_required, ok", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.post(
      "/api/compliance/modern-slavery-threshold",
      {
        data: {
          current_period_revenue_aud: 2_500_000,
          is_australian_or_carrying_on_business_in_au: true,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.action_required).toBe("not_required");
    expect(body.result.urgency).toBe("ok");
    expect(body.result.is_above_threshold).toBe(false);
    expect(body.result.is_reporting_entity).toBe(false);
  });

  test("revenue in A$80M–A$99M warning band → approaching_threshold", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.post(
      "/api/compliance/modern-slavery-threshold",
      {
        data: {
          current_period_revenue_aud: 90_000_000,
          projected_full_period_revenue_aud: 90_000_000,
          is_australian_or_carrying_on_business_in_au: true,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.action_required).toBe("approaching_threshold");
    expect(body.result.urgency).toBe("warning");
    expect(body.result.is_above_threshold).toBe(false);
  });

  test("missing current_period_revenue_aud → 400", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.post(
      "/api/compliance/modern-slavery-threshold",
      { data: { is_australian_or_carrying_on_business_in_au: true } },
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("missing_required_fields");
    expect(body.required).toContain("current_period_revenue_aud");
  });

  test("unauthenticated → 401 with disclaimer", async ({ request }) => {
    const res = await request.post(
      "/api/compliance/modern-slavery-threshold",
      {
        data: {
          current_period_revenue_aud: 500_000,
          is_australian_or_carrying_on_business_in_au: true,
        },
      },
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthenticated");
    expect(typeof body.disclaimer).toBe("string");
  });

  test("GET returns latest snapshot for the caller", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);
    const res = await page.request.get(
      "/api/compliance/modern-slavery-threshold",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.disclaimer).toBe("string");
  });
});
