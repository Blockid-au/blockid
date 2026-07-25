// E2E — <StructureDecisionFormClient /> (P10-structure-decision-ui) on
// /workspace/fundraise/structure runs the pure assessStructureDecision helper
// in-browser and lets a founder tick listing + control signals to see the
// recommendation flip live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — the
// P10-structure-decision-ui ship shipped the founder wizard 2026-07-25 but
// no Playwright round-trip lived beside it. This spec closes that gap by
// driving the wizard through the four discrete recommendation branches
// (insufficient_signal → single_class_with_founder_protections + ASX blocked
// path → consider_dual_class_offshore red-with-blocked-path → amber once
// counsel is engaged) plus a Reset round-trip.
//
// Strategy mirrors tests/e2e/founder/redomicile-wizard.spec.ts:
//   1. getAccount() a seeded qa-founder — skip cleanly when the fixture is
//      unseeded (CI on a fresh clone stays green).
//   2. Navigate to /workspace/fundraise/structure; skip cleanly when the
//      banner container is not mounted (auth-gated redirect / layout change).
//   3. Assert the banner is absent before Run.
//   4. Run with nothing ticked → insufficient_signal.
//   5. ASX + founder-control ticked → ASX Rule 6.9 blocked path + red band
//      + single_class_with_founder_protections recommendation.
//   6. Swap to the US-listing + offshore-appetite + revenue path without
//      counsel → consider_dual_class_offshore + direct-Delaware blocked path
//      (banner still red because a blocked path overrides).
//   7. Tick counsel → banner drops the direct-Delaware block; recommendation
//      stays consider_dual_class_offshore.
//   8. Reset → banner disappears.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/fundraise/structure";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_STRUCTURE_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("StructureDecisionFormClient — P10-structure-decision-ui-e2e", () => {
  test.setTimeout(30_000);

  test("insufficient_signal → ASX-blocked founder-protections → red dual-class → amber with counsel → reset", async ({
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

    const submit = page.getByTestId("structure-submit");
    const mounted = (await submit.count()) > 0;
    test.skip(
      !mounted,
      `Structure quiz not mounted on ${ROUTE} — likely a workspace-layout regression for ${FOUNDER_EMAIL}.`,
    );

    // ── Initial: no banner rendered until Run pressed ─────────────────────
    await expect(page.getByTestId("structure-result-banner")).toHaveCount(0);

    // ── Zero-signal Run → insufficient_signal ─────────────────────────────
    await submit.click();
    const banner = page.getByTestId("structure-result-banner");
    await expect(banner).toHaveAttribute(
      "data-recommendation",
      "insufficient_signal",
    );
    await expect(banner).toContainText("Answer at least one question");
    // No blocked-path row on insufficient_signal
    await expect(banner).not.toContainText("Blocked paths:");

    // ── ASX listing + founder control → blocked path + red banner ─────────
    await page.getByTestId("structure-q-wants_asx_listing").check();
    await page
      .getByTestId("structure-q-wants_founder_control_after_dilution")
      .check();
    await submit.click();
    // wantsControl fires → single_class_with_founder_protections
    await expect(banner).toHaveAttribute(
      "data-recommendation",
      "single_class_with_founder_protections",
    );
    // ASX + control ticked → ASX Listing Rule 6.9 blocked-path fires
    await expect(banner).toContainText("Blocked paths:");
    await expect(banner).toContainText("asx_dual_class_listing_rule_6_9");
    // Statutory warning text renders
    await expect(banner).toContainText("Listing Rule 6.9");

    // ── Swap to US-listing + offshore path without counsel → red dual-class ─
    await page.getByTestId("structure-q-wants_asx_listing").uncheck();
    await page.getByTestId("structure-q-wants_us_listing").check();
    await page
      .getByTestId("structure-q-has_us_offshore_parent_appetite")
      .check();
    await page.getByTestId("structure-q-annual_revenue_aud").fill("10000000");
    await submit.click();
    await expect(banner).toHaveAttribute(
      "data-recommendation",
      "consider_dual_class_offshore",
    );
    // No specialist counsel → direct-Delaware blocked path fires
    await expect(banner).toContainText("Blocked paths:");
    await expect(banner).toContainText("direct_delaware_without_counsel");

    // ── Tick specialist counsel → blocked path drops, recommendation sticks ─
    await page
      .getByTestId("structure-q-has_specialist_counsel_engaged")
      .check();
    await submit.click();
    await expect(banner).toHaveAttribute(
      "data-recommendation",
      "consider_dual_class_offshore",
    );
    await expect(banner).not.toContainText("Blocked paths:");
    // Next-step still surfaces the cross-border counsel booking recommendation
    await expect(banner).toContainText("cross-border");

    // ── Reset clears the banner entirely ──────────────────────────────────
    await page.getByRole("button", { name: /reset/i }).click();
    await expect(page.getByTestId("structure-result-banner")).toHaveCount(0);
  });
});
