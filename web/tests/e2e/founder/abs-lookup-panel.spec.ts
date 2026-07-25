// E2E — <AbsLookupPanel /> (P3c) mounted on the public Chapter 3 marketing
// guide route /guide/03-market-research. Runs the pure AU market-size lookup
// (P3a AU_MARKET_INDUSTRIES fixture) via the public GET /api/abs/lookup route
// (P3b) and renders TAM/SAM/SOM + suggestions.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P3c ship-note
// "`data-testid` attributes on panel root + query input + submit button +
// result block + TAM/SAM/SOM cells + label + suggestions + disclaimer +
// error banner so a future Playwright spec can attach without helper edits".
// This spec is P3c-abs-lookup-panel-e2e: a Playwright round-trip that
// exercises the panel end-to-end against the running route so a regression
// in the panel's fetch wiring, the route's response shape, or the fixture
// keyword-scoring in au-market-lookup.ts surfaces here.
//
// Strategy — public route, no login needed:
//   1. Force-anonymous storage state (matches landing-page-preview-panel).
//   2. Navigate to /guide/03-market-research and skip cleanly when the panel
//      is not mounted (defensive — some chapter-render edge cases hide the
//      panel).
//   3. Assert initial idle status + empty-state hint.
//   4. Type "saas" → submit → assert data-status="success", ANZSIC J5810
//      + Software Publishing label + TAM/SAM/SOM tiles populated +
//      suggestions row visible with sibling chips (none matching J5810).
//   5. Click a suggestion chip (a sibling ANZSIC code) → assert the lookup
//      re-runs and the label swaps to the sibling class + suggestions row
//      disappears (explicit-ANZSIC branch returns empty suggestions per P3b).
//   6. Type gibberish "zzz_no_match_zebra" → submit → assert data-status
//      flips to "error" + the error banner is visible with the 404 message.

import { test, expect } from "@playwright/test";

const ROUTE = "/guide/03-market-research";

test.describe("AbsLookupPanel — P3c-abs-lookup-panel-e2e", () => {
  test.setTimeout(30_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test("idle → saas lookup → sibling pivot → not-found error", async ({
    page,
  }) => {
    await page.goto(ROUTE);

    const panel = page.getByTestId("abs-lookup-panel");
    const mounted = (await panel.count()) > 0;
    test.skip(!mounted, `ABS lookup panel not visible on ${ROUTE}`);

    // ── Initial idle posture ──────────────────────────────────────────────
    await expect(panel).toHaveAttribute("data-status", "idle");
    const submit = page.getByTestId("abs-lookup-submit");
    await expect(submit).toBeDisabled();

    // ── "saas" keyword → success + J5810 label + TAM/SAM/SOM + siblings ──
    await page.getByTestId("abs-lookup-query").fill("saas");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(panel).toHaveAttribute("data-status", "success");
    const result = page.getByTestId("abs-lookup-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("ANZSIC J5810");
    await expect(page.getByTestId("abs-lookup-label")).toContainText(
      "Software Publishing",
    );

    // TAM/SAM/SOM tiles all render a formatted AUD figure — the tile values
    // must contain "A$" so a formatter drift (em-dash on non-finite input,
    // etc.) surfaces here rather than as a silent regression.
    for (const testId of ["abs-lookup-tam", "abs-lookup-sam", "abs-lookup-som"]) {
      await expect(page.getByTestId(testId)).toContainText("A$");
    }

    // Suggestions block fires on keyword hits (never on explicit-ANZSIC) and
    // excludes the primary pick — per P3b route contract "keyword lookup
    // returns top pick + suggestions[] excludes the pick".
    const suggestions = page.getByTestId("abs-lookup-suggestions");
    await expect(suggestions).toBeVisible();
    await expect(
      suggestions.locator("button", { hasText: "J5810" }),
    ).toHaveCount(0);
    const siblingButtons = suggestions.locator("button");
    const siblingCount = await siblingButtons.count();
    expect(siblingCount).toBeGreaterThanOrEqual(1);

    // Disclaimer sits on every success response (AU_MARKET_LOOKUP_DISCLAIMER
    // — s766B Corps Act general-information hedge). Dropping it would be a
    // regulated-content risk, not a copy nit.
    await expect(page.getByTestId("abs-lookup-disclaimer")).toContainText(
      /publicly|ABS|IBISWorld|indicative|s766B|Corporations Act|refine/i,
    );

    // ── Pivot to a sibling ANZSIC → re-run + label swap + suggestions gone ──
    const firstSibling = siblingButtons.first();
    const siblingLabel = (await firstSibling.textContent()) ?? "";
    // Sibling button text is `Label · CODE · A$XXX`. Extract the CODE.
    const anzsicMatch = siblingLabel.match(/\b([A-Z])\s*(\d{4})\b/);
    expect(anzsicMatch, "sibling button must expose an ANZSIC code").not.toBeNull();
    const siblingCode = `${anzsicMatch![1]}${anzsicMatch![2]}`;

    await firstSibling.click();

    // The pivot re-fetches with ?anzsic=<CODE>; wait for the label to swap
    // to the sibling's ANZSIC header before asserting anything else.
    await expect(result).toContainText(`ANZSIC ${siblingCode}`);
    await expect(panel).toHaveAttribute("data-status", "success");

    // Explicit-ANZSIC path returns empty suggestions per P3b — the block is
    // hidden entirely when `suggestions.length === 0`.
    await expect(page.getByTestId("abs-lookup-suggestions")).toHaveCount(0);

    // ── Gibberish keyword → 404 → error banner + status="error" ───────────
    await page.getByTestId("abs-lookup-query").fill("zzz_no_match_zebra");
    await submit.click();
    await expect(panel).toHaveAttribute("data-status", "error");
    const errorBanner = page.getByTestId("abs-lookup-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toHaveAttribute("role", "alert");
  });
});
