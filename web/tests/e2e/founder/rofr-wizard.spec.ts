// E2E — <RofrWizardClient /> (P10-rofr-workflow-ui) on /compliance/s708
// runs the pure assessRofrWorkflow helper in-browser and lets a founder
// paste a cap table + proposed transfer to see status + pro-rata
// entitlement + tag-along + s707 flags flip live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — closes the
// P10-rofr-workflow-ui-e2e follow-up (a Playwright spec pinning the
// wizard's data-status / data-band attributes across the sample-data
// happy path + the related-body-corporate short-circuit branch).
//
// Strategy mirrors tests/e2e/founder/acquisition-wizard.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. Navigate to /compliance/s708 and skip cleanly when the wizard is
//      not mounted (auth-only page today, no tier gate — but keep the
//      skip so a fresh clone without seeded fixtures stays green).
//   3. Assert the empty initial posture (grey band, pending_notice).
//   4. Click "Load sample data" — sample seeds a 3-holder register
//      (Alice 6000 founder, Bob 3000 founder, Carol 1000 angel), a
//      2026-06-01 notice, a Carol waiver + Bob 200-share exercise, and
//      a 2023-01-15 original-issue date (>12mo → no s707 flag). With
//      "now" past the 15-day notice window and outstanding=0, the
//      calculator lands on partially_exercised → amber. Bob's block
//      is 1000/6000 = 16.67% < 50% tag-along floor → no flags row.
//   5. Toggle related-body-corporate → status short-circuits to
//      not_applicable → grey.
//   6. Untoggle → status returns to partially_exercised → amber.
//   7. Click "Clear" → wizard resets to empty (pending_notice / grey).

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/s708";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_ROFR_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("RofrWizardClient — P10-rofr-workflow-ui-e2e", () => {
  test.setTimeout(30_000);

  test("empty → load sample → related-body toggle → clear", async ({
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

    const wizard = page.getByTestId("rofr-wizard");
    const mounted = (await wizard.count()) > 0;
    test.skip(
      !mounted,
      `ROFR wizard not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    const result = page.getByTestId("rofr-wizard-result");
    const entitlement = page.getByTestId("rofr-wizard-entitlement-table");

    // ── Empty state: no notice, no cap table → pending_notice / grey ─────
    await expect(wizard).toHaveAttribute("data-status", "pending_notice");
    await expect(wizard).toHaveAttribute("data-band", "grey");
    await expect(result).toHaveAttribute("data-band", "grey");
    await expect(entitlement).toHaveCount(0);
    await expect(page.getByTestId("rofr-wizard-flags")).toHaveCount(0);

    // ── Load sample data → partially_exercised / amber ───────────────────
    await page.getByRole("button", { name: "Load sample data" }).click();
    await expect(wizard).toHaveAttribute("data-status", "partially_exercised");
    await expect(wizard).toHaveAttribute("data-band", "amber");
    await expect(result).toHaveAttribute("data-band", "amber");
    // Bob + Carol are the two pre-emption holders; Alice (seller) is excluded.
    await expect(entitlement).toBeVisible();
    await expect(entitlement.locator("tbody tr")).toHaveCount(2);
    // Alice's 1000/6000 = 16.67% sale is below the 50% tag-along floor and the
    // 2023-01-15 original issue is > 12 months old, so neither flag fires.
    await expect(page.getByTestId("rofr-wizard-flags")).toHaveCount(0);

    // ── Related-body-corporate short-circuit → not_applicable / grey ─────
    const relatedBodyToggle = page.getByRole("switch", {
      name: /Related-body-corporate/,
    });
    await relatedBodyToggle.click();
    await expect(wizard).toHaveAttribute("data-status", "not_applicable");
    await expect(wizard).toHaveAttribute("data-band", "grey");
    // Entitlement table drops out because the pool is skipped entirely.
    await expect(entitlement).toHaveCount(0);

    // ── Untoggle → status returns to partially_exercised / amber ─────────
    await relatedBodyToggle.click();
    await expect(wizard).toHaveAttribute("data-status", "partially_exercised");
    await expect(wizard).toHaveAttribute("data-band", "amber");

    // ── Clear → back to empty pending_notice / grey ──────────────────────
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(wizard).toHaveAttribute("data-status", "pending_notice");
    await expect(wizard).toHaveAttribute("data-band", "grey");
    await expect(entitlement).toHaveCount(0);
  });
});
