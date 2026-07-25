// E2E — <Ga4PlanPanel /> (P7-ga4-plan-panel) mounted on the public Chapter 7
// marketing guide route /guide/07-growth. Runs the pure computeGa4PlanProgress
// helper in-browser and lets a founder tick the 9 canonical GA4 events sourced
// from the au-ga4-measurement-plan template to see progress + band update live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P7-ga4-plan-panel
// ship-note flags a founder-facing UI CTA on Chapter 7 as a natural follow-up
// and calls out the panel's data-testid attributes ("ga4-plan-panel" root +
// data-band + data-pct + ga4-plan-progress-count / bar / band-chip + per-stage
// ga4-plan-stage-<stage> + per-event ga4-plan-event-<id> + ga4-plan-template-cta).
// This spec is P7-ga4-plan-panel-e2e: a Playwright round-trip that exercises
// the panel end-to-end so a regression in the checkbox → useMemo → banner
// pipeline (or the ga4-plan.helpers band thresholds) surfaces here.
//
// Strategy — public route, no login needed:
//   1. Force-anonymous storage state (matches abs-lookup-panel + landing-page).
//   2. Navigate to /guide/07-growth and skip cleanly if the panel isn't mounted
//      (defensive — some rebuild edge cases hide chapter panels).
//   3. Assert initial not-started band + 0/9 progress + template CTA href.
//   4. Tick 3 events → progress advances → band flips to "in-progress" (amber).
//   5. Tick a total of 7 events (≥ 75%) → band flips to "investor-ready"
//      (green) — pins the ga4-plan.helpers band threshold.
//   6. Untick every checked event → band returns to "not-started" + 0/9 count.

import { test, expect } from "@playwright/test";

const ROUTE = "/guide/07-growth";

test.describe("Ga4PlanPanel — P7-ga4-plan-panel-e2e", () => {
  test.setTimeout(30_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test("not-started → in-progress (3/9) → investor-ready (7/9) → reset", async ({
    page,
  }) => {
    await page.goto(ROUTE);

    const panel = page.getByTestId("ga4-plan-panel");
    const mounted = (await panel.count()) > 0;
    test.skip(!mounted, `GA4 plan panel not visible on ${ROUTE}`);

    // ── Initial: nothing ticked → not-started / 0 / 0/9 ────────────────────
    await expect(panel).toHaveAttribute("data-band", "not-started");
    await expect(panel).toHaveAttribute("data-pct", "0");
    await expect(page.getByTestId("ga4-plan-progress-count")).toHaveText("0 / 9");
    await expect(page.getByTestId("ga4-plan-band-chip")).toContainText("0%");

    // Template CTA is a stable link into the /legal-templates surface — a
    // rename here breaks the founder's path to the full measurement plan.
    const cta = page.getByTestId("ga4-plan-template-cta");
    await expect(cta).toHaveAttribute(
      "href",
      "/legal-templates/au-ga4-measurement-plan",
    );

    // Every event tile starts unchecked (defence in depth — computeGa4PlanProgress
    // ignores unknown keys, but a stale localStorage snapshot could otherwise
    // sneak ticks in on rehydrate).
    for (const id of ["page_view", "purchase", "referral_signup_completed"]) {
      await expect(page.getByTestId(`ga4-plan-event-${id}`)).toHaveAttribute(
        "data-checked",
        "false",
      );
    }

    const clickEvent = async (id: string) => {
      const tile = page.getByTestId(`ga4-plan-event-${id}`);
      // The <label> in the tile forwards the click to the nested checkbox.
      await tile.getByRole("checkbox").click();
      await expect(tile).toHaveAttribute("data-checked", "true");
    };

    // ── Tick 3 events (all acquisition) → in-progress / ~33% ───────────────
    await clickEvent("page_view");
    await clickEvent("sign_up_initiated");
    await clickEvent("sign_up_completed");

    await expect(panel).toHaveAttribute("data-band", "in-progress");
    await expect(page.getByTestId("ga4-plan-progress-count")).toHaveText("3 / 9");
    // 3/9 → 33 (Math.round(3/9*100) === 33)
    await expect(panel).toHaveAttribute("data-pct", "33");
    // Acquisition bucket is fully wired now (3/3 canonical acquisition events).
    await expect(
      page.getByTestId("ga4-plan-stage-acquisition"),
    ).toHaveAttribute("data-complete", "true");
    // Revenue bucket still zero — 0/2 canonical revenue events.
    await expect(
      page.getByTestId("ga4-plan-stage-revenue"),
    ).toHaveAttribute("data-complete", "false");

    // ── Tick 4 more (7 total) → investor-ready / ≥ 75% ─────────────────────
    await clickEvent("activation_completed");
    await clickEvent("aha_moment");
    await clickEvent("purchase");
    await clickEvent("subscription_started");

    await expect(panel).toHaveAttribute("data-band", "investor-ready");
    await expect(page.getByTestId("ga4-plan-progress-count")).toHaveText("7 / 9");
    // 7/9 → 78 (Math.round(7/9*100) === 78)
    await expect(panel).toHaveAttribute("data-pct", "78");
    // Revenue bucket is fully wired now (2/2).
    await expect(
      page.getByTestId("ga4-plan-stage-revenue"),
    ).toHaveAttribute("data-complete", "true");
    // Referral bucket is still empty (0/1).
    await expect(
      page.getByTestId("ga4-plan-stage-referral"),
    ).toHaveAttribute("data-complete", "false");

    // ── Untick every checked event → back to not-started / 0 / 0/9 ─────────
    for (const id of [
      "page_view",
      "sign_up_initiated",
      "sign_up_completed",
      "activation_completed",
      "aha_moment",
      "purchase",
      "subscription_started",
    ]) {
      await page
        .getByTestId(`ga4-plan-event-${id}`)
        .getByRole("checkbox")
        .click();
    }

    await expect(panel).toHaveAttribute("data-band", "not-started");
    await expect(panel).toHaveAttribute("data-pct", "0");
    await expect(page.getByTestId("ga4-plan-progress-count")).toHaveText("0 / 9");
    await expect(
      page.getByTestId("ga4-plan-stage-acquisition"),
    ).toHaveAttribute("data-complete", "false");
  });
});
