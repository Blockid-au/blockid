// E2E — /compliance/gst founder form UI walk-through
// (P1n-gst-form-ui-e2e — closes the P1n-form-ui-e2e follow-up "the wgea +
// modslavery form UI walk-throughs shipped, but /compliance/gst and
// /compliance/s708 both still lack founder-form Playwright coverage",
// bringing GstFormClient (P1n-gst-form) to parity with WgeaFormClient and
// ModernSlaveryFormClient (P1n-form-ui-e2e).)
//
// Strategy mirrors tests/e2e/compliance/wgea-form.spec.ts:
//   1. getAccount(QA_EMAIL) → skip cleanly when the fixture is missing so
//      CI on a fresh clone stays green.
//   2. loginAs() a seeded qa-founder and navigate to /compliance/gst.
//   3. Skip when the form heading is not visible (auth-gated redirect on
//      unseeded fixtures — matches the mount-gate other compliance form
//      specs use).
//   4. Fill the trailing-12mo turnover textbox with 12 × 8_000 (= A$96k, at
//      or above the A$75k threshold) → Save & check → banner re-renders
//      with the "GST registration overdue" headline (assessGST's
//      urgent_register branch).
//   5. Refill the textbox with 12 × 4_000 (= A$48k, below threshold) and
//      resubmit → banner flips to the "Below the GST threshold" headline
//      (assessGST's none branch).
//
// Zero source-code churn — GstFormClient already exposes
// data-testid="gst-result-banner" from the P1n-gst-form ship.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/gst";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_GST_FORM_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("GstFormClient — P1n-gst-form-ui-e2e", () => {
  test.setTimeout(30_000);

  test("above threshold → urgent_register banner; below threshold → none banner", async ({
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
      name: "GST registration threshold",
    });
    const mounted = (await heading.count()) > 0;
    test.skip(
      !mounted,
      `GST form not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    // 12 × A$8,000 = A$96,000 → above the A$75,000 threshold.
    const turnover = page.getByLabel(
      "Actual monthly turnover — trailing 12 months",
    );
    await turnover.fill(
      "8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000",
    );

    await page.getByRole("button", { name: "Save & check" }).click();

    const banner = page.getByTestId("gst-result-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("GST registration overdue");
    await expect(banner).toContainText("A$96,000");
    await expect(banner).toContainText("A$75,000"); // threshold surfaced

    // 12 × A$4,000 = A$48,000 → below the A$75,000 threshold.
    await turnover.fill(
      "4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000",
    );
    await page.getByRole("button", { name: "Save & check" }).click();

    await expect(banner).toContainText("Below the GST threshold");
    await expect(banner).toContainText("A$48,000");
  });
});
