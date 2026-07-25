// E2E — <LandingPagePreviewPanel /> (P4a-preview-ui) mounted on the public
// Chapter 4 marketing guide route /guide/04-mvp. Runs the pure landing-page
// preview renderer via the POST /api/landing-page/preview route
// (P4a-publish-route) and shows the returned HTML in a sandboxed iframe.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P4a-landing-page-
// preview tail-note references three follow-ups (P4a-publish-route already
// shipped, P4a-publish-storage / P4a-cmo-draft) plus P4a-preview-ui shipped
// the panel. This spec is P4a-preview-ui-e2e: a Playwright round-trip that
// exercises the panel end-to-end against the running route so a regression
// in the panel's fetch wiring or the route's response shape surfaces here.
//
// Strategy — public route, no login needed:
//   1. Force-anonymous storage state (matches smoke/showcase-atlassian-...).
//   2. Navigate to /guide/04-mvp and skip cleanly if the panel isn't mounted
//      (defensive — some rebuild edge cases hide chapter panels).
//   3. Assert initial idle status + submit disabled on blank form.
//   4. Fill the minimum happy path (headline + subheadline + 1 bullet + CTA)
//      → submit → assert data-status="success", iframe present, validation
//      "valid".
//   5. Break the CTA href to `javascript:alert(1)` → resubmit → assert
//      validation flips to invalid with the cta_href_invalid reason chip.
//   6. Toggle the CMO auto-draft panel + populate one-liner + benefits →
//      click Apply → assert form fields non-empty afterwards.

import { test, expect } from "@playwright/test";

const ROUTE = "/guide/04-mvp";

test.describe("LandingPagePreviewPanel — P4a-preview-ui-e2e", () => {
  test.setTimeout(30_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test("blank → happy path preview → invalid CTA href → CMO auto-draft apply", async ({
    page,
  }) => {
    await page.goto(ROUTE);

    const panel = page.getByTestId("landing-page-preview-panel");
    const mounted = (await panel.count()) > 0;
    test.skip(!mounted, `Landing-page preview panel not visible on ${ROUTE}`);

    // ── Initial idle posture ──────────────────────────────────────────────
    await expect(panel).toHaveAttribute("data-status", "idle");
    const submit = page.getByTestId("landing-page-preview-submit");
    await expect(submit).toBeDisabled();

    // ── Happy-path fill → submit → success + iframe + valid ───────────────
    await page.getByTestId("landing-page-preview-headline").fill("Dataroom that assembles itself");
    await page
      .getByTestId("landing-page-preview-subheadline")
      .fill("For Australian pre-seed founders who want to raise without a 40-hour dataroom sprint.");
    await page.getByTestId("landing-page-preview-bullets").fill("Cut dataroom prep from 3 weeks to 3 days");
    await page.getByTestId("landing-page-preview-cta-label").fill("Start free");
    await page.getByTestId("landing-page-preview-cta-href").fill("/signup");

    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(panel).toHaveAttribute("data-status", "success");
    await expect(page.getByTestId("landing-page-preview-iframe")).toBeVisible();
    await expect(page.getByTestId("landing-page-preview-validation")).toHaveAttribute(
      "data-valid",
      "true",
    );
    await expect(page.getByTestId("landing-page-preview-markdown")).toContainText(
      "Dataroom that assembles itself",
    );

    // ── Break CTA href to javascript: → resubmit → invalid + reason chip ──
    await page.getByTestId("landing-page-preview-cta-href").fill("javascript:alert(1)");
    await submit.click();
    await expect(panel).toHaveAttribute("data-status", "success");
    await expect(page.getByTestId("landing-page-preview-validation")).toHaveAttribute(
      "data-valid",
      "false",
    );
    await expect(
      page.locator('[data-testid="landing-page-preview-validation"] [data-reason="cta_href_invalid"]'),
    ).toHaveCount(1);

    // ── CMO auto-draft toggle → populate → apply fills empty fields ───────
    const cmoToggle = page.getByTestId("landing-page-preview-cmo-toggle");
    await cmoToggle.click();
    const cmoPanel = page.getByTestId("landing-page-preview-cmo-panel");
    await expect(cmoPanel).toBeVisible();

    await page.getByTestId("landing-page-preview-cmo-oneliner").fill(
      "The dataroom that assembles itself",
    );
    await page.getByTestId("landing-page-preview-cmo-benefits").fill(
      "Ship a raise-ready dataroom in a weekend\nSee investor-readiness score every week",
    );

    const apply = page.getByTestId("landing-page-preview-cmo-apply");
    await expect(apply).toBeEnabled();
    await apply.click();

    // `applyCmoDraft` is non-destructive — every main-form field was already
    // populated by the happy-path step, so nothing should be blanked out.
    // Verify the previously-typed headline survived the merge and the
    // bullets textarea is still non-empty.
    await expect(page.getByTestId("landing-page-preview-headline")).toHaveValue(
      "Dataroom that assembles itself",
    );
    const bulletsValue = await page
      .getByTestId("landing-page-preview-bullets")
      .inputValue();
    expect(bulletsValue.trim().length).toBeGreaterThan(0);
  });
});
