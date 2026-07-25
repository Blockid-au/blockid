// E2E — <AcquisitionWizardClient /> (P11-acquisition-wizard-ui) on
// /dashboard/exit-readiness runs the pure assessAcquisitionPattern helper
// in-browser and lets a founder nudge fields off the ~90/10 Atlassian
// template to see signal + warnings + FIRB gate update live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P11-acquisition-
// wizard-ui tail-note references a future Playwright spec at exactly this
// path that "can hook onto via the data-testid + data-signal attributes".
//
// Strategy mirrors tests/e2e/founder/redomicile-wizard.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. Navigate to /dashboard/exit-readiness and skip cleanly when the
//      wizard is not mounted (growth-tier gate can redirect a starter-plan
//      founder).
//   3. Assert the seeded green baseline (~90/10 template matches, no consent
//      shortfall, no FIRB chip).
//   4. Drop consents to 50% → red (below the 70% CoC red floor).
//   5. Recover consents to 95% → green.
//   6. Move cash/RSU to 80/20 → amber (splits diverge, no red-trigger).
//   7. Reset splits + toggle foreign-gov → green stays but FIRB chip fires
//      with reason=foreign_govt_influence.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/exit-readiness";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_ACQUISITION_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("AcquisitionWizardClient — P11-acquisition-wizard-e2e", () => {
  test.setTimeout(30_000);

  test("green default → red consent-shortfall → green recovery → amber splits → FIRB chip on foreign-gov", async ({
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

    const wizard = page.getByTestId("acquisition-wizard");
    const mounted = (await wizard.count()) > 0;
    test.skip(
      !mounted,
      `Acquisition wizard not visible on ${ROUTE} — likely a tier gate redirect for ${FOUNDER_EMAIL} (requires growth+).`,
    );

    const result = page.getByTestId("acquisition-wizard-result");

    // ── Seeded ~90/10 template + no consents → green baseline ──────────────
    await expect(wizard).toHaveAttribute("data-signal", "green");
    await expect(result).toHaveAttribute("data-band", "green");
    await expect(page.getByTestId("acquisition-wizard-firb")).toHaveCount(0);

    // ── Consents 50% trips the change-of-control red floor (< 70%) ────────
    await page.getByTestId("acquisition-input-consents").fill("50");
    await expect(wizard).toHaveAttribute("data-signal", "red");
    await expect(result).toHaveAttribute("data-band", "red");

    // ── Consents back to 95% → green (template still matches) ─────────────
    await page.getByTestId("acquisition-input-consents").fill("95");
    await expect(wizard).toHaveAttribute("data-signal", "green");
    await expect(result).toHaveAttribute("data-band", "green");

    // ── 80/20 split diverges from the 85-95 / 5-15 band → amber ───────────
    await page.getByTestId("acquisition-input-cash-pct").fill("80");
    await page.getByTestId("acquisition-input-rsu-pct").fill("20");
    await expect(wizard).toHaveAttribute("data-signal", "amber");
    await expect(result).toHaveAttribute("data-band", "amber");

    // ── Reset splits + toggle foreign-gov → green + FIRB chip ─────────────
    await page.getByTestId("acquisition-input-cash-pct").fill("90");
    await page.getByTestId("acquisition-input-rsu-pct").fill("10");
    await expect(wizard).toHaveAttribute("data-signal", "green");
    await page.getByTestId("acquisition-toggle-foreign-gov").click();
    const firb = page.getByTestId("acquisition-wizard-firb");
    await expect(firb).toBeVisible();
    await expect(firb).toHaveAttribute(
      "data-firb-reason",
      "foreign_govt_influence",
    );
    // FIRB is procedural — signal stays green because the template still matches
    await expect(wizard).toHaveAttribute("data-signal", "green");
  });
});
