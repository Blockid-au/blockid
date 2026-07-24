// E2E — <InvestorReadinessTile /> renders the 5-dimension readiness pack
// coming back from GET /api/nudge/next-steps.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score.
//
// Strategy:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. page.route() intercepts /api/nudge/next-steps and returns a
//      deterministic readiness_score payload so the assertion doesn't
//      depend on the founder's actual SVI seed data.
//   3. Navigate to the SVI dashboard page (the only surface that mounts
//      the sibling NextStepTile today; the InvestorReadinessTile is
//      spec'd to mount alongside it — see the mount-instruction comment
//      in web/src/components/dashboard/investor-readiness-tile.tsx).
//   4. If the tile is mounted, assert overall score + band + 5 bars.
//      If not (sibling agent hasn't wired it yet), skip cleanly.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/svi";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_NUDGE_EMAIL ?? "qa-founder-1@blockid.au";

const FAKE_PAYLOAD = {
  ok: true,
  result: {
    current_phase: {
      slug: "6",
      label: "Revenue / Business Model",
      label_vi: "Doanh thu",
      canonical_stage: "revenue",
      growth_phase_id: "revenue",
      phase_order: 6,
    },
    next_action: {
      title: "Close a Compliance gap",
      reason: "e2e stub",
      cta_url: "/dashboard/data-room",
      cta_label: "Open data room",
      category: "compliance",
    },
    missing: [],
    readiness_score: {
      overall: 63,
      sub_scores: {
        market: 80,
        team: 55,
        tech: 60,
        financial: 40,
        compliance: 30,
      },
    },
    nudge_reason: "e2e stub",
    next_step_confidence: "medium",
  },
  meta: {
    afsl_disclaimer:
      "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth).",
  },
};

test.describe("InvestorReadinessTile — P5 readiness surfacing", () => {
  test.setTimeout(30_000);

  test("renders overall + 5 sub-score bars for a founder fixture", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      // fall through — fixture missing.
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    // Intercept the nudge endpoint so this spec is deterministic even on
    // a founder with no SVI data.
    await page.route("**/api/nudge/next-steps", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_PAYLOAD),
      });
    });

    await page.goto(ROUTE);

    // Skip cleanly when the tile hasn't been mounted yet — the sibling
    // agent owns the dashboard-shell wiring, so the tile ships behind
    // its own mount decision.
    const tile = page.getByTestId("investor-readiness-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      "InvestorReadinessTile not mounted on /dashboard/svi yet — see mount-instruction comment in investor-readiness-tile.tsx",
    );

    // ── Overall score + band ────────────────────────────────────────
    await expect(tile).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("investor-readiness-overall")).toHaveText(
      "63",
    );
    await expect(page.getByTestId("investor-readiness-band")).toHaveText(
      "warming up",
    );

    // ── Five bars, in the spec order ────────────────────────────────
    const bars = page.getByTestId("investor-readiness-bars").getByRole("listitem");
    await expect(bars).toHaveCount(5);
    const keys = await bars.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-key")),
    );
    expect(keys).toEqual(["market", "team", "tech", "financial", "compliance"]);

    const values = await bars.evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute("data-value"))),
    );
    expect(values).toEqual([80, 55, 60, 40, 30]);

    // ── Weakest hint should call out compliance (lowest at 30) ──────
    const hint = page.getByTestId("investor-readiness-hint");
    await expect(hint).toContainText(/compliance/i);
  });
});
