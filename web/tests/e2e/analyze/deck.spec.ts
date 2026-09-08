/**
 * Block 5 Phase 1 — /analyze deck-variant smoke.
 *
 * Uploads the fixture PDF into SmartIntake, confirms the cost modal, and
 * asserts the DeckReaderPanel mounts with its section-chip strip. The live
 * SSE pipeline is not exercised here (that lives in Block 6); this spec
 * pins the shell so a regression in the intake → confirm → live handoff
 * fails the deploy gate.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";

const ASSERT_TIMEOUT = 15_000;
const DECK_FIXTURE = path.join(
  __dirname,
  "..",
  "fixtures",
  "analyze",
  "sample-deck.pdf",
);

test.describe("/analyze — deck upload", () => {
  test.setTimeout(45_000);

  test("PDF upload lights the deck-reader panel + section chips", async ({ page }) => {
    await page.goto("/analyze");

    const intake = page.getByTestId("smart-intake");
    await expect(intake).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // The hidden <input type=file> is queried by test-id.
    const fileInput = page.getByTestId("smart-intake-file");
    await fileInput.setInputFiles(DECK_FIXTURE);

    // Fast classifier should morph the CTA to the deck action.
    const cta = page.getByTestId("smart-intake-cta");
    await expect(cta).toContainText(/read my deck/i, { timeout: ASSERT_TIMEOUT });

    await cta.click();

    // Cost modal — confirm to enter LIVE phase.
    const modal = page.getByTestId("analyze-cost-modal");
    await expect(modal).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await page.getByTestId("cost-confirm").click();

    // Deck reader panel mounts (LiveAnalysisStage → DeckReaderPanel).
    const panel = page.getByTestId("deck-reader-panel");
    await expect(panel).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // Section-chip strip is always rendered (grey until parser lights them).
    for (const s of ["problem", "solution", "traction"]) {
      await expect(page.getByTestId(`deck-section-${s}`)).toBeVisible({
        timeout: ASSERT_TIMEOUT,
      });
    }
  });
});
