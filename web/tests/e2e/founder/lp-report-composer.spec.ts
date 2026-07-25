// E2E — <LpReportComposerClient /> (P12c-lp-report-ui) on /workspace/lp-report
// runs the pure `assessLpReportSlot()` policy library in-browser so a founder
// can preview k-anonymity + APP 6 redactions live before locking a slot.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P12c-lp-report-ui
// tail-note ships the composer without a Playwright round-trip; this spec
// closes that gap (P12c-lp-report-ui-e2e) by driving the composer through
// four distinct band transitions:
//   1. blank cohort size    → grey / ok=true / no redactions
//   2. cohort_size = 3      → red / ok=false / `cohort_below_k` redaction
//   3. cohort_size = 8      → green / ok=true / `company_name_stripped`
//                             redaction / no warnings
//   4. peers_in_band = 2    → amber / `founder_isolated_in_band` redaction +
//                             warning ("share your growth band …")
//
// Mirrors the redomicile-wizard.spec.ts posture: loginAs a seeded QA founder,
// skip cleanly when the fixture is missing or the surface hasn't been mounted
// (plan gate can redirect), then walk the state machine via labels + testids
// already exposed by the composer.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/lp-report";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_LP_REPORT_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("LpReportComposerClient — P12c-lp-report-ui-e2e", () => {
  test.setTimeout(30_000);

  test("grey empty → red below k → green ok → amber isolated in band", async ({
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

    const composer = page.getByTestId("lp-report-composer");
    const mounted = (await composer.count()) > 0;
    test.skip(
      !mounted,
      `LP report composer not visible on ${ROUTE} — likely a plan-gate redirect for ${FOUNDER_EMAIL}.`,
    );

    const redactions = page.getByTestId("lp-report-composer-redactions");
    const warnings = page.getByTestId("lp-report-composer-warnings");
    const cohortSize = page.getByLabel(/Cohort size/i);
    const peers = page.getByLabel(/Peers in your growth band/i);
    const companyName = page.getByLabel(/Company name/i);

    // ── 1. Blank cohort size → grey / no redactions block ──────────────
    await expect(composer).toHaveAttribute("data-band", "grey");
    await expect(redactions).toHaveCount(0);
    await expect(warnings).toHaveCount(0);

    // ── 2. Below k=5 → red + `cohort_below_k` redaction ────────────────
    await cohortSize.fill("3");
    await expect(composer).toHaveAttribute("data-band", "red");
    await expect(composer).toHaveAttribute("data-ok", "false");
    await expect(
      redactions.locator('[data-redaction-kind="cohort_below_k"]'),
    ).toHaveCount(1);

    // ── 3. Meets k, name typed, no isolated-in-band signal → green ─────
    await cohortSize.fill("8");
    await companyName.fill("Contoso Pty Ltd");
    await expect(composer).toHaveAttribute("data-band", "green");
    await expect(composer).toHaveAttribute("data-ok", "true");
    await expect(
      redactions.locator('[data-redaction-kind="company_name_stripped"]'),
    ).toHaveCount(1);
    await expect(warnings).toHaveCount(0);

    // ── 4. Peers = 2 (< k-1=4) → amber + isolated-in-band warning ──────
    await peers.fill("2");
    await expect(composer).toHaveAttribute("data-band", "amber");
    await expect(
      redactions.locator('[data-redaction-kind="founder_isolated_in_band"]'),
    ).toHaveCount(1);
    await expect(warnings).toContainText(/share your growth band/i);
  });
});
