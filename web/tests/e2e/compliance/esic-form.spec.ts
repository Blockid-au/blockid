// E2E — /workspace/esic-assessment founder form UI walk-through
// (P1n-esic-form-ui-e2e — closes the P1n-s708-form-ui-e2e tail-note that
// brought the four /compliance/* detail-page forms (WGEA + Modern Slavery +
// GST + s708) to Playwright parity but left the ESIC self-assessment
// worksheet at `/workspace/esic-assessment` — the assessment lives outside
// /compliance/* because it feeds the Fundraise ESIC gate, but it shares
// the same "founder types → banner re-renders" contract the compliance
// forms use.)
//
// Strategy mirrors tests/e2e/compliance/wgea-form.spec.ts +
// tests/e2e/compliance/gst-form.spec.ts + tests/e2e/compliance/s708-form.spec.ts:
//   1. getAccount(QA_EMAIL) → skip cleanly when the fixture is missing so
//      CI on a fresh clone stays green.
//   2. loginAs() a seeded qa-founder and navigate to /workspace/esic-assessment.
//   3. Skip when the form heading is not visible (auth-gated redirect on
//      unseeded fixtures — matches the mount-gate other compliance form
//      specs use).
//   4. Fill a realistic AU AI SaaS eligible profile (incorporated ~2y ago,
//      A$80k turnover, A$250k expenses, not listed, has R&D, Australian
//      patent + accelerator alumni + A$250k third-party capital, all five
//      principles-based sub-tests true) → Save & assess → banner renders
//      the eligible headline.
//   5. Change incorporation year to 1990 (way past both the 3y and 6y-with-R&D
//      early-stage caps under s360-40) and resubmit → banner flips to the
//      not-eligible headline.
//
// Zero source-code churn — EsicAssessmentClient already exposes
// data-testid="esic-result-banner" and the "Save & assess" submit label.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/esic-assessment";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_ESIC_FORM_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("EsicAssessmentClient — P1n-esic-form-ui-e2e", () => {
  test.setTimeout(30_000);

  test("eligible profile → green banner; too-old company → red banner", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    await page.goto(ROUTE);

    const heading = page.getByRole("heading", {
      name: "ESIC Eligibility Self-Assessment",
    });
    const mounted = (await heading.count()) > 0;
    test.skip(
      !mounted,
      `ESIC form not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    const year = page.getByLabel("Incorporation year");
    const month = page.getByLabel("Incorporation month");
    const income = page.getByLabel("Prior-year assessable income (AUD)");
    const expenses = page.getByLabel("Prior-year total expenses (AUD)");
    const thirdPartyCapital = page.getByLabel("Third-party capital raised (AUD)");

    const rAndD = page.getByRole("switch", {
      name: "Company has R&D expenditure",
    });
    const patent = page.getByRole("switch", {
      name: "Australian standard patent (+50)",
    });
    const accelerator = page.getByRole("switch", {
      name: "AusIndustry-accredited accelerator alumnus (+50)",
    });
    const p1 = page.getByRole("switch", {
      name: "Genuinely focused on developing a new or improved product / service / process",
    });
    const p2 = page.getByRole("switch", { name: "High growth potential" });
    const p3 = page.getByRole("switch", {
      name: "Can scale broader than the local market",
    });
    const p4 = page.getByRole("switch", { name: "Has competitive advantage" });
    const p5 = page.getByRole("switch", {
      name: "Can demonstrate a broader-than-local market",
    });

    // ── Eligible profile — realistic AU AI SaaS ─────────────────────────
    const currentYear = new Date().getUTCFullYear();
    await year.fill(String(currentYear - 2));
    await month.fill("3");
    await income.fill("80000");
    await expenses.fill("250000");
    await thirdPartyCapital.fill("250000");

    // Toggles start unchecked — flip on the ones we need.
    for (const toggle of [rAndD, patent, accelerator, p1, p2, p3, p4, p5]) {
      if ((await toggle.getAttribute("aria-checked")) !== "true") {
        await toggle.click();
      }
    }

    await page.getByRole("button", { name: "Save & assess" }).click();

    const banner = page.getByTestId("esic-result-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("ESIC self-assessment: eligible");
    await expect(banner).toContainText("early-stage pass:");

    // ── Too-old company — fails early-stage cap under s360-40 ───────────
    await year.fill("1990");
    await page.getByRole("button", { name: "Save & assess" }).click();

    await expect(banner).toContainText("ESIC self-assessment: not eligible");
  });
});
