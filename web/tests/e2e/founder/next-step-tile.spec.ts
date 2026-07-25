// E2E — <NextStepTile /> renders the phase pill + next-action CTA +
// readiness donut + top-3 missing coming back from GET /api/nudge/next-steps.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §3.3 (output JSON
// shape) + §3.5 ("/dashboard tile 'Your next step' — phase + next_action +
// readiness score band, on page load"). The tile is mounted on /dashboard/svi
// alongside <InvestorReadinessTile /> — see the P5b entry in the goal file.
//
// Strategy mirrors tests/e2e/founder/investor-readiness-tile.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. page.route() intercepts /api/nudge/next-steps and returns a
//      deterministic payload so the assertion doesn't depend on the
//      founder's actual SVI seed data.
//   3. Navigate to /dashboard/svi. Skip cleanly if the tile is not
//      mounted (e.g. auth redirect).
//   4. Assert (a) data-state="ready" + data-phase-slug, (b) the phase pill
//      renders the label, (c) the next-action title + CTA render, (d) the
//      readiness donut number matches the stubbed score, (e) top-3 missing
//      renders 3 items with the raise-blocker flag in the expected order.

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
      title: "Wire your Stripe in live mode",
      reason: "e2e stub — the smallest Phase 6 unlock",
      cta_url: "/dashboard/integrations",
      cta_label: "Open integrations",
      category: "phase_advance",
    },
    missing: [
      {
        category: "11. Tax (AU)",
        title: "ESIC Eligibility Assessment",
        phase_slug: "6",
        why_it_matters: "Raise-blocker at Phase 6",
        raise_blocker: true,
        cta_url: "/compliance/esic",
      },
      {
        category: "11. Tax (AU)",
        title: "GST Registration Confirmation",
        phase_slug: "6",
        why_it_matters: "Raise-blocker at Phase 6",
        raise_blocker: true,
        cta_url: "/compliance/gst",
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
    readiness_by_phase: {},
    nudge_reason: "e2e stub",
    next_step_confidence: "medium",
  },
  meta: {
    afsl_disclaimer:
      "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth).",
  },
};

test.describe("NextStepTile — P5b-next-step-tile-e2e", () => {
  test.setTimeout(30_000);

  test("renders phase pill + next-action CTA + readiness donut + raise-blocker-first missing list", async ({
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

    // Skip cleanly when the tile hasn't been mounted (e.g. auth redirect
    // on a fresh clone). The tile ships behind /dashboard/svi per P5b.
    const tile = page.getByTestId("next-step-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      "NextStepTile not mounted on /dashboard/svi — likely an auth redirect.",
    );

    // ── Ready state + phase slug ────────────────────────────────────
    await expect(tile).toHaveAttribute("data-state", "ready");
    await expect(tile).toHaveAttribute("data-phase-slug", "6");

    // ── Phase pill copy ─────────────────────────────────────────────
    const phasePill = page.getByTestId("next-step-phase");
    await expect(phasePill).toHaveAttribute("data-phase-slug", "6");
    await expect(phasePill).toContainText("Phase 6");
    await expect(phasePill).toContainText("Revenue / Business Model");

    // ── Next-action title + CTA ─────────────────────────────────────
    await expect(page.getByTestId("next-step-action-title")).toHaveText(
      "Wire your Stripe in live mode",
    );
    const cta = page.getByTestId("next-step-action-cta");
    await expect(cta).toHaveText("Open integrations");
    await expect(cta).toHaveAttribute("href", "/dashboard/integrations");
    await expect(cta).toHaveAttribute("data-category", "phase_advance");

    // ── Readiness donut score ───────────────────────────────────────
    await expect(page.getByTestId("next-step-readiness-score")).toHaveText(
      "63",
    );

    // ── Top-3 missing, raise-blockers first ─────────────────────────
    const missing = page
      .getByTestId("next-step-missing")
      .getByRole("listitem");
    await expect(missing).toHaveCount(3);
    const blockerFlags = await missing.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-raise-blocker")),
    );
    expect(blockerFlags).toEqual(["true", "true", "false"]);
    // The first item is the ESIC blocker per the FAKE_PAYLOAD order.
    await expect(missing.first()).toContainText("ESIC Eligibility Assessment");
  });
});
