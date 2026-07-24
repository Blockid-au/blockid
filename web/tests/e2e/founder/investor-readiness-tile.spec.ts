// E2E — <InvestorReadinessTile /> renders the per-phase readiness pack
// (§P5a — readiness_by_phase[currentPhase]) coming back from
// GET /api/nudge/next-steps.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score + §P5a per-phase view.
//
// Strategy:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. page.route() intercepts /api/nudge/next-steps and returns a
//      deterministic payload (readiness_by_phase + missing_top3) so the
//      assertion doesn't depend on the founder's actual SVI seed data.
//   3. Navigate to the SVI dashboard page (the only surface that mounts
//      the sibling NextStepTile today; the InvestorReadinessTile is
//      spec'd to mount alongside it — see the mount-instruction comment
//      in web/src/components/dashboard/investor-readiness-tile.tsx).
//   4. If the tile is mounted, assert the per-phase view (score, band,
//      12-phase mini-series, top-3 missing). If not, skip cleanly.

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
    readiness_by_phase: {
      "1": { score: 82, band: "investor-ready", missing_top3: [] },
      "2": { score: 70, band: "warming-up", missing_top3: [] },
      "3": { score: 55, band: "warming-up", missing_top3: [] },
      "4": { score: 48, band: "not-ready", missing_top3: [] },
      "5": { score: 60, band: "warming-up", missing_top3: [] },
      "6": {
        score: 63,
        band: "warming-up",
        missing_top3: [
          {
            category: "11. Tax (AU)",
            title: "ESIC Eligibility Assessment",
            phase_slug: "6",
            why_it_matters: "Raise-blocker at Phase 6",
            raise_blocker: true,
            cta_url: "/dashboard/data-room?add=11.%20Tax%20(AU)",
          },
          {
            category: "11. Tax (AU)",
            title: "GST Registration Confirmation",
            phase_slug: "6",
            why_it_matters: "Raise-blocker at Phase 6",
            raise_blocker: true,
            cta_url: "/dashboard/data-room?add=11.%20Tax%20(AU)",
          },
          {
            category: "3. Financial Projections",
            title: "Cohort Revenue Analysis",
            phase_slug: "5",
            why_it_matters: "Standard due-diligence artefact for Phase 5",
            raise_blocker: false,
            cta_url: "/dashboard/data-room?add=3.%20Financial%20Projections",
          },
        ],
      },
      "7": { score: 30, band: "not-ready", missing_top3: [] },
      "8": { score: 20, band: "not-ready", missing_top3: [] },
      "9": { score: 10, band: "not-ready", missing_top3: [] },
      "10": { score: 0, band: "not-ready", missing_top3: [] },
      "11": { score: 0, band: "not-ready", missing_top3: [] },
      "12": { score: 0, band: "not-ready", missing_top3: [] },
    },
    nudge_reason: "e2e stub",
    next_step_confidence: "medium",
  },
  meta: {
    afsl_disclaimer:
      "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth).",
  },
};

test.describe("InvestorReadinessTile — P5a per-phase readiness surfacing", () => {
  test.setTimeout(30_000);

  test("renders current-phase score + 12-phase mini-series + top-3 missing", async ({
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

    // ── Per-phase score + band ──────────────────────────────────────
    await expect(tile).toHaveAttribute("data-state", "ready");
    await expect(tile).toHaveAttribute("data-view", "per-phase");
    await expect(page.getByTestId("investor-readiness-overall")).toHaveText(
      "63",
    );
    await expect(page.getByTestId("investor-readiness-band")).toHaveText(
      "warming up",
    );

    // ── 12-phase mini-series, current phase (6) highlighted ─────────
    const bars = page
      .getByTestId("investor-readiness-phase-series")
      .getByRole("listitem");
    await expect(bars).toHaveCount(12);
    const slugs = await bars.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-key")),
    );
    expect(slugs).toEqual([
      "1", "2", "3", "4", "5", "6",
      "7", "8", "9", "10", "11", "12",
    ]);
    const currentFlags = await bars.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-current")),
    );
    expect(currentFlags.filter((f) => f === "true")).toHaveLength(1);
    expect(currentFlags[5]).toBe("true"); // phase 6 (index 5)

    // ── Top-3 missing, raise-blockers first ─────────────────────────
    const missing = page
      .getByTestId("investor-readiness-missing")
      .getByRole("listitem");
    await expect(missing).toHaveCount(3);
    const blockerFlags = await missing.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-raise-blocker")),
    );
    expect(blockerFlags).toEqual(["true", "true", "false"]);
  });
});
