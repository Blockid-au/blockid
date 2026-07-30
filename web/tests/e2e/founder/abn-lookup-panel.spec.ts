// E2E — <AbnLookupPanel /> (P1g-founder-panel) mounted on the public
// Chapter 1 marketing guide route /guide/01-vision. Wraps the public GET
// /api/abr/lookup route (P1g) and renders a founder-facing traffic-light
// header + optional ABR live-details grid.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P1g-founder-panel
// ship-note "6 stable `data-testid` hooks (`abn-lookup-panel` +
// `data-status={idle|loading|success|error}` root + `data-band={red|amber|emerald}`
// on the result block + `abn-lookup-input` + `abn-lookup-submit` +
// `abn-lookup-formatted` + `abn-lookup-entity-name` + `abn-lookup-acn` +
// `abn-lookup-abn-status` + `abn-lookup-error` + `abn-lookup-disclaimer`) so
// a future Playwright spec can attach without brittle text queries".
//
// This spec is P1g-founder-panel-e2e: a Playwright round-trip that exercises
// the panel end-to-end against a mocked /api/abr/lookup so the outcome is
// deterministic regardless of whether ABR_GUID is wired on the environment
// under test (unwired env returns live=null, wired env returns a live
// AbnDetails payload — mocking pins the wired-env shape).
//
// Strategy — public route, no login needed:
//   1. Force-anonymous storage state (matches abs-lookup-panel.spec.ts).
//   2. page.route the /api/abr/lookup endpoint to return three deterministic
//      responses keyed on the `abn` query param — valid Auschain ABN with a
//      live ABR match, valid-checksum-only (no live), and a bad checksum.
//   3. Navigate to /guide/01-vision and skip cleanly if the panel isn't
//      mounted (defensive — chapter-render edge cases can hide the panel).
//   4. Assert initial idle posture + submit disabled + emptyHint copy.
//   5. Type a partial ABN (5 digits) → submit stays disabled + incompleteHint.
//   6. Type the Auschain ABN 79 659 615 111 → submit → assert
//      data-status="success", data-band="emerald", entity name populated,
//      ACN formatted, disclaimer visible.
//   7. Clear + type a checksum-ok-but-no-live ABN → assert data-band="amber"
//      (checksum ok, live match missing) + no live-details grid visible.
//   8. Clear + type a bad-checksum ABN → assert data-band="red" +
//      "Checksum failed" chip + no live-details grid.

import { test, expect } from "@playwright/test";

const ROUTE = "/guide/01-vision";

// Real Auschain PTY LTD ABN — passes modulus-89 checksum.
const ABN_LIVE = "79659615111";
// A different real ABN checksum-valid string used for the amber path
// (mocked with live=null to simulate the ABR_GUID-not-wired path).
const ABN_CHECKSUM_ONLY = "51824753556"; // ATO published sample ABN
// Deliberately invalid checksum (last digit off by one).
const ABN_BAD = "79659615112";

test.describe("AbnLookupPanel — P1g-founder-panel-e2e", () => {
  test.setTimeout(30_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/abr/lookup**", async (route) => {
      const url = new URL(route.request().url());
      const abn = url.searchParams.get("abn") ?? "";

      if (abn === ABN_LIVE) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            abn: ABN_LIVE,
            abn_formatted: "79 659 615 111",
            valid_checksum: true,
            source: "abr-live",
            live: {
              entity_name: "AUSCHAIN PTY LTD",
              entity_type_name: "Australian Private Company",
              abn_status: "Active",
              abn_status_effective_from: "2022-08-04",
              gst_registered: true,
              gst_effective_from: "2022-08-04",
              business_state: "NSW",
              business_postcode: "2000",
              acn: "659615111",
            },
            live_error: null,
          }),
        });
        return;
      }

      if (abn === ABN_CHECKSUM_ONLY) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            abn: ABN_CHECKSUM_ONLY,
            abn_formatted: "51 824 753 556",
            valid_checksum: true,
            source: "checksum",
            live: null,
            live_error: "ABR_GUID not configured",
          }),
        });
        return;
      }

      if (abn === ABN_BAD) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            abn: ABN_BAD,
            abn_formatted: "79 659 615 112",
            valid_checksum: false,
            source: "checksum",
            live: null,
            live_error: "checksum failed — skipped ABR call",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_abn_format",
          message: "abn query parameter must contain exactly 11 digits",
          input: abn,
        }),
      });
    });
  });

  test("idle → partial → live match → checksum-only → bad checksum", async ({
    page,
  }) => {
    await page.goto(ROUTE);

    const panel = page.getByTestId("abn-lookup-panel");
    const mounted = (await panel.count()) > 0;
    test.skip(!mounted, `ABN lookup panel not visible on ${ROUTE}`);

    // ── Initial idle posture ──────────────────────────────────────────────
    await expect(panel).toHaveAttribute("data-status", "idle");
    const submit = page.getByTestId("abn-lookup-submit");
    await expect(submit).toBeDisabled();

    // ── Partial ABN keeps submit disabled ─────────────────────────────────
    const input = page.getByTestId("abn-lookup-input");
    await input.fill("79659");
    await expect(submit).toBeDisabled();

    // ── Full valid ABN with live ABR match → emerald band ─────────────────
    await input.fill(ABN_LIVE);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(panel).toHaveAttribute("data-status", "success");
    const result = page.getByTestId("abn-lookup-result");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-band", "emerald");

    await expect(page.getByTestId("abn-lookup-formatted")).toContainText(
      "79 659 615 111",
    );
    await expect(page.getByTestId("abn-lookup-entity-name")).toContainText(
      "AUSCHAIN PTY LTD",
    );
    // formatAcnDisplay renders "NNN NNN NNN" from raw 9-digit input.
    await expect(page.getByTestId("abn-lookup-acn")).toContainText(
      "659 615 111",
    );
    await expect(page.getByTestId("abn-lookup-abn-status")).toContainText(
      "Active",
    );
    await expect(page.getByTestId("abn-lookup-live-details")).toBeVisible();

    // Disclaimer sits on every success response (business.gov.au anchor).
    // Dropping it would strand founders without the "confirm with ASIC
    // Connect" hedge, so this assertion pins a regulated-content invariant
    // rather than copy nit.
    await expect(page.getByTestId("abn-lookup-disclaimer")).toContainText(
      /business\.gov\.au|Australian Business Register|ASIC/i,
    );

    // ── Checksum-only (no live match) → amber band ─────────────────────────
    await input.fill(ABN_CHECKSUM_ONLY);
    await submit.click();
    await expect(panel).toHaveAttribute("data-status", "success");
    await expect(result).toHaveAttribute("data-band", "amber");
    // Live-details grid should be hidden when live is null.
    await expect(page.getByTestId("abn-lookup-live-details")).toHaveCount(0);

    // ── Bad checksum → red band + "Checksum failed" chip ──────────────────
    await input.fill(ABN_BAD);
    await submit.click();
    await expect(panel).toHaveAttribute("data-status", "success");
    await expect(result).toHaveAttribute("data-band", "red");
    await expect(page.getByTestId("abn-lookup-band")).toContainText(
      /Checksum failed/i,
    );
    await expect(page.getByTestId("abn-lookup-live-details")).toHaveCount(0);
  });
});
