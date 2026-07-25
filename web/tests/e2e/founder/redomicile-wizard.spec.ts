// E2E — <RedomicileWizardClient /> (P12d-redomicile-wizard) on
// /dashboard/exit-readiness runs the pure assessRedomicile helper in-browser
// and lets a founder flip triggers to see recommendation + band update live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P12d-redomicile-
// wizard tail-note references a P12d-redomicile-wizard-e2e follow-up (a
// Playwright spec that drives the wizard through at least two distinct
// recommendation branches and pins the mechanism label + trigger count).
//
// Strategy mirrors tests/e2e/founder/investor-readiness-tile.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. Navigate to /dashboard/exit-readiness and skip cleanly when the
//      wizard is not mounted (tier gate can redirect a starter-plan founder).
//   3. Assert the neutral initial posture (grey band, "hold", 0 triggers).
//   4. Flip triggers to reach a "prepare" state (amber) — pins the s411
//      mechanism label so a copy rename surfaces as a regression.
//   5. Flip enough triggers with runway to reach "proceed" (amber, 3
//      triggers, s411).
//   6. Drop the burn to reach "reconsider" (red) — the honest branch when
//      a founder has triggers but not the money.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/exit-readiness";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_REDOMICILE_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("RedomicileWizardClient — P12d-redomicile-wizard-e2e", () => {
  test.setTimeout(30_000);

  test("initial grey/hold → prepare (amber, s411) → proceed → reconsider", async ({
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

    const wizard = page.getByTestId("redomicile-wizard");
    const mounted = (await wizard.count()) > 0;
    test.skip(
      !mounted,
      `Redomicile wizard not visible on ${ROUTE} — likely a tier gate redirect for ${FOUNDER_EMAIL} (requires growth+).`,
    );

    // ── Initial: no input → grey / hold / 0 triggers / no mechanism chip ──
    await expect(wizard).toHaveAttribute("data-band", "grey");
    await expect(wizard).toHaveAttribute("data-recommendation", "hold");
    await expect(page.getByTestId("redomicile-trigger-count")).toHaveText("0");
    await expect(page.getByTestId("redomicile-mechanism")).toHaveCount(0);

    // ── One trigger → prepare, amber, s411 mechanism label ────────────────
    await page.getByTestId("redomicile-toggle-delaware-acquirer").click();
    await expect(wizard).toHaveAttribute("data-recommendation", "prepare");
    await expect(wizard).toHaveAttribute("data-band", "amber");
    await expect(page.getByTestId("redomicile-trigger-count")).toHaveText("1");
    await expect(page.getByTestId("redomicile-mechanism")).toContainText("s411");

    // ── Two+ triggers WITHOUT funded burn → reconsider (red) ──────────────
    await page.getByTestId("redomicile-toggle-scrip-only").click();
    await expect(wizard).toHaveAttribute("data-recommendation", "reconsider");
    await expect(wizard).toHaveAttribute("data-band", "red");
    await expect(page.getByTestId("redomicile-trigger-count")).toHaveText("2");
    // reconsider surfaces the "runway looks tight" warning
    await expect(page.getByTestId("redomicile-warnings")).toContainText(
      "Runway looks tight",
    );

    // ── Add annual burn A$500k → proceed (amber) ──────────────────────────
    const burnInput = page.getByTestId("redomicile-input-annual-burn");
    await burnInput.fill("500000");
    await expect(wizard).toHaveAttribute("data-recommendation", "proceed");
    await expect(wizard).toHaveAttribute("data-band", "amber");
    // s411 mechanism sticks because delaware_acquirer is still on
    await expect(page.getByTestId("redomicile-mechanism")).toContainText("s411");

    // ── Pre-Series-A override sends recommendation back to hold ───────────
    await page.getByTestId("redomicile-toggle-pre-series-a").click();
    await expect(wizard).toHaveAttribute("data-recommendation", "hold");
    // band goes green (some input present, recommendation hold)
    await expect(wizard).toHaveAttribute("data-band", "green");
    // mechanism chip is dropped when recommendation is hold
    await expect(page.getByTestId("redomicile-mechanism")).toHaveCount(0);
  });
});
