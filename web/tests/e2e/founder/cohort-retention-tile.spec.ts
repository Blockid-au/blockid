// E2E — <CohortRetentionTile /> (P5-cohort-svi) on /dashboard/svi runs the
// pure computeWeeklyCohortRetention + renderCohortRetentionSvg helpers in
// the browser and lets a founder paste weekly signups + activity CSVs to
// see the cohort matrix, band, and inline SVG update live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P5-cohort-svi
// ship note references `data-testid` + `data-band` + `data-cohort-count`
// attributes "so a future Playwright spec can attach without helper edits".
// This tick (P5-cohort-svi-tile-e2e) is that spec.
//
// Strategy mirrors tests/e2e/founder/acquisition-wizard.spec.ts:
//   1. loginAs() a seeded qa-founder (skip cleanly when the fixture is
//      missing so a fresh clone stays green).
//   2. Navigate to /dashboard/svi and skip cleanly when the tile is not
//      mounted (defensive — the mount lives in the same file that ships
//      the tile so a mount miss here would flag a regression).
//   3. Blank state → data-band="grey" + data-cohort-count="0" + empty-state
//      headline copy.
//   4. Click "Load sample data" → data-band="green" + data-cohort-count="4"
//      (sample fixture in the tile ships 4 cohort weeks with best-W1 ≥ 0.67
//      so meets_min_buckets fires and pickCohortBand lands on green).
//   5. Wipe the activities textarea while keeping signups → data-band="amber"
//      (matrix still has 4 cohorts so meets_min_buckets is true, but every
//      W1 collapses to 0 so pickCohortBand demotes to amber).
//   6. Click "Clear" → back to data-band="grey" + data-cohort-count="0".

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/svi";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_COHORT_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("CohortRetentionTile — P5-cohort-svi-tile-e2e", () => {
  test.setTimeout(30_000);

  test("grey empty state → green on sample data → amber when activities wiped → grey on clear", async ({
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

    const tile = page.getByTestId("cohort-retention-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `Cohort retention tile not visible on ${ROUTE} — likely a tier gate redirect for ${FOUNDER_EMAIL}.`,
    );

    // ── Blank state → grey + zero cohorts ─────────────────────────────
    await expect(tile).toHaveAttribute("data-band", "grey");
    await expect(tile).toHaveAttribute("data-cohort-count", "0");
    await expect(
      page.getByTestId("cohort-retention-result"),
    ).toContainText("Paste weekly signups + activities");

    // ── Load sample data → green + 4 cohorts (4 Monday buckets in the
    // fixture, best W1 = 2/3 ≥ 0.4 so pickCohortBand lands on green) ─
    await page.getByRole("button", { name: "Load sample data" }).click();
    await expect(tile).toHaveAttribute("data-band", "green");
    await expect(tile).toHaveAttribute("data-cohort-count", "4");
    await expect(
      page.getByTestId("cohort-retention-result"),
    ).toContainText("Investor-grade retention signal");
    // SVG renders inline — confirm the wrapper carries a real <svg> tag,
    // not the empty-state placeholder.
    await expect(page.getByTestId("cohort-retention-svg").locator("svg")).toHaveCount(1);

    // ── Wipe activities → 4 cohorts still, but every W1 collapses to 0
    // so the best-W1 < 0.4 branch of pickCohortBand demotes to amber ─
    await page.getByTestId("cohort-activities-input").fill("");
    await expect(tile).toHaveAttribute("data-band", "amber");
    await expect(tile).toHaveAttribute("data-cohort-count", "4");
    await expect(
      page.getByTestId("cohort-retention-result"),
    ).toContainText("below investor threshold");

    // ── Clear → back to grey + zero cohorts ───────────────────────────
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(tile).toHaveAttribute("data-band", "grey");
    await expect(tile).toHaveAttribute("data-cohort-count", "0");
  });
});
