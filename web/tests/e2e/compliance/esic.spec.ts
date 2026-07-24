// E2E — POST /api/compliance/esic returns is_esic=true for a realistic
// early-stage ESIC candidate (Div 360 ITAA97). Runs against a QA founder
// account; skips when the QA harness is not seeded.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL = "qa-founder-1@blockid.au";

test.describe("Compliance — ESIC eligibility", () => {
  test.setTimeout(30_000);

  test("returns is_esic=true for a fresh AU AI SaaS with patent + accelerator", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const now = new Date();
    const res = await page.request.post("/api/compliance/esic", {
      data: {
        company_incorporated_year: now.getUTCFullYear() - 1,
        company_incorporated_month: 3,
        turnover_prior_year_aud: 80_000,
        total_expenses_prior_year_aud: 250_000,
        is_listed: false,
        has_r_and_d_expenditure: true,
        points_100_test: {
          australian_patent: true,
          innovation_patent: false,
          plant_breeder_rights: false,
          trademarks: false,
          accelerator_alumni: true,
          third_party_capital_raised_aud: 250_000,
          r_and_d_expenditure_pct: 60,
          licensed_technology_from_university: false,
        },
        principles_test: {
          is_genuinely_focused_on_developing_new_or_improved: true,
          high_growth_potential: true,
          can_scale_broader_than_local_market: true,
          has_competitive_advantage: true,
          can_demonstrate_broader_than_local_market: true,
        },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.eligible_early_stage).toBe(true);
    expect(body.result.eligible_innovation_100pt).toBeGreaterThanOrEqual(100);
    expect(body.result.eligible_innovation_principles).toBe(true);
    expect(body.result.is_esic).toBe(true);
    expect(typeof body.result.disclaimer).toBe("string");
    expect(body.result.disclaimer.length).toBeGreaterThan(20);
  });

  test("GET returns the most recent assessment", async ({ page }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    const res = await page.request.get("/api/compliance/esic");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.disclaimer).toBe("string");
  });

  test("401 for unauthenticated", async ({ request }) => {
    const res = await request.post("/api/compliance/esic", {
      data: {
        company_incorporated_year: 2024,
        turnover_prior_year_aud: 10_000,
        total_expenses_prior_year_aud: 100_000,
        is_listed: false,
        has_r_and_d_expenditure: false,
      },
    });
    expect(res.status()).toBe(401);
  });
});
