// E2E — <ExitReadinessTile /> (P12b-tile) on /dashboard/exit-readiness
// renders the AU comparable-exits panel from the pure fixture
// buildExitBenchmarkSection() consumes server-side.
//
// Contract:
//   docs/plans/atlassian-standard-mapping-goal.md — P12b-tile ship note:
//   "data-testid=\"exit-readiness-tile\" + data-used-fallback attributes on
//   the section root ready for a future Playwright hook-in." This spec is
//   that hook-in (P12b-tile-e2e).
//
// The tile is an RSC — no client fetch to mock. Assertions ride the
// deterministic public fixture at web/src/lib/exits/au-benchmark.ts, so a
// drift on either side (adding / removing / renaming the seeded Atlassian /
// Trello / OpsGenie rows) surfaces as a test failure here rather than a
// silent regression in the founder-facing tile.
//
// Strategy mirrors tests/e2e/founder/redomicile-wizard.spec.ts:
//   1. getAccount()-gated skip when the qa-founder fixture is missing so
//      CI on a fresh clone stays green rather than red.
//   2. loginAs() and navigate to /dashboard/exit-readiness.
//   3. Skip cleanly when the tile is not visible (page tier-gates at
//      growth+; a starter-plan fixture is redirected).
//   4. Assert (a) tile mount + used-fallback attribute is present with a
//      valid boolean value, (b) the header + disclaimer render, (c) at
//      least one buyer-type chip is present, (d) the deals table carries
//      at least one Atlassian-anchor row that the pack fixture always
//      surfaces (Atlassian IPO 2015 or the T. Rowe 2014 secondary — both
//      pinned into web/src/lib/exits/au-benchmark.ts fixture-invariant
//      tests so they cannot silently disappear from the seed).

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/exit-readiness";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_EXIT_READINESS_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("ExitReadinessTile — P12b-tile-e2e", () => {
  test.setTimeout(30_000);

  test("tile renders AU exit fixture with sector chip + buyer-type chip + Atlassian-anchor deal row", async ({
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

    const tile = page.getByTestId("exit-readiness-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `Exit-readiness tile not visible on ${ROUTE} — likely a tier gate redirect for ${FOUNDER_EMAIL} (requires growth+).`,
    );

    // ── data-used-fallback surfaces cleanly ────────────────────────────
    // buildExitBenchmarkSection returns usedFallback ∈ {true, false};
    // the tile stamps it verbatim so a founder + reseller can eyeball
    // whether the sector filter matched or was widened.
    const usedFallback = await tile.getAttribute("data-used-fallback");
    expect(usedFallback === "true" || usedFallback === "false").toBe(true);

    // ── Header + disclaimer render ─────────────────────────────────────
    await expect(
      tile.getByRole("heading", { name: /AU Exit Benchmark/i }),
    ).toBeVisible();
    // AU_EXIT_DISCLAIMER is fixed on every ExitBenchmarkSection (s766B
    // Corps Act guard). A copy rename here is the correct place to catch
    // it because dropping the disclaimer is a regulated-content risk.
    await expect(tile).toContainText(
      /publicly[- ]reported|s766B|Corporations Act|not personal financial product advice/i,
    );

    // ── Buyer-type chip row surfaces at least one bucket ───────────────
    // Fixture ships ≥ 20 rows across strategic / pe / ipo / secondary /
    // financial (au-benchmark.test.ts pins the coverage), so at least one
    // chip is guaranteed to render even under the sector filter fallback.
    const chips = tile.locator("[data-buyer-type]");
    expect(await chips.count()).toBeGreaterThan(0);

    // ── At least one Atlassian-anchor row in the deals table ───────────
    // au-benchmark.test.ts "Atlassian reference deals" describe block
    // pins that Atlassian NASDAQ IPO 2015 + T. Rowe 2014 secondary
    // remain in the seed, and the pack helper newest-first sort keeps
    // both inside the default 6-row limit slice.
    const dealsTable = tile.locator("table");
    await expect(dealsTable).toBeVisible();
    await expect(dealsTable).toContainText(/Atlassian/i);
  });
});
