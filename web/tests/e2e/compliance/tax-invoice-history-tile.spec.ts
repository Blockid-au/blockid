// E2E — <TaxInvoiceHistoryTile /> (P5-tax-invoice-checker-tile) renders
// the saved-snapshot chip from GET /api/compliance/tax-invoice-check and
// deep-links to /workspace/tax-invoice-checker on click.
//
// Contract:
//   docs/plans/atlassian-standard-mapping-goal.md — P5-tax-invoice-checker-tile
//   (compliance-panel tile) tail-note: "Playwright E2E spec exercising the
//   tile → wizard round-trip (mock the GET response + click the tile →
//   verify wizard mounts) remains a follow-up under
//   P5-tax-invoice-checker-tile-e2e".
//
// Strategy mirrors tests/e2e/founder/investor-readiness-tile.spec.ts:
//   1. loginAs() a seeded qa-founder (skip when the fixture is missing).
//   2. page.route() intercepts /api/compliance/tax-invoice-check with a
//      deterministic payload so the assertion is independent of DB seed.
//   3. Navigate to the compliance-panel host route and skip cleanly when
//      the tile hasn't been mounted (CompliancePanel is still shell-less).
//   4. When mounted, assert (a) chip colour matches the mocked band,
//      (b) saved count is exposed via data-total, (c) clicking the tile
//      lands on /workspace/tax-invoice-checker.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const QA_EMAIL =
  process.env.QA_FOUNDER_TAX_INVOICE_EMAIL ?? "qa-founder-1@blockid.au";

// Candidate host routes for the CompliancePanel. Iterated in order until
// the tile is found; skips cleanly if none render it (shell wiring is
// owned by a sibling agent — see the mount comment in
// web/src/components/dashboard/tax-invoice-history-tile.tsx).
const HOST_ROUTES = [
  "/dashboard/compliance",
  "/dashboard",
  "/dashboard/svi",
] as const;

const AMBER_LATEST = {
  ok: true,
  band: "standard" as const,
  missing_field_count: 0,
  warnings: ["Recipient name shown but ABN missing"],
  computed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  disclaimer:
    "General information only, not tax advice. Confirm with a registered tax agent.",
};

const FAKE_PAYLOAD = {
  ok: true,
  total: 4,
  result: AMBER_LATEST,
};

test.describe("TaxInvoiceHistoryTile — P5-tax-invoice-checker-tile-e2e", () => {
  test.setTimeout(30_000);

  test("chip + saved count reflect the mocked snapshot; click opens the wizard", async ({
    page,
  }) => {
    try {
      getAccount(QA_EMAIL);
    } catch {
      test.skip(true, `${QA_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, QA_EMAIL);

    await page.route("**/api/compliance/tax-invoice-check", async (route) => {
      // Only stub the GET the tile issues on mount; leave POSTs (from the
      // wizard) untouched so the click-through hits the real handler.
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_PAYLOAD),
      });
    });

    let tile = page.getByTestId("tax-invoice-history-tile");
    let mounted = false;
    for (const route of HOST_ROUTES) {
      await page.goto(route);
      tile = page.getByTestId("tax-invoice-history-tile");
      if ((await tile.count()) > 0) {
        mounted = true;
        break;
      }
    }
    test.skip(
      !mounted,
      "CompliancePanel host route not mounted yet — see mount comment in tax-invoice-history-tile.tsx",
    );

    // ── Chip colour + saved count reflect the mocked snapshot ─────────
    // AMBER_LATEST has 0 missing fields but 1 warning → amber branch.
    await expect(tile).toHaveAttribute("data-colour", "amber");
    await expect(tile).toHaveAttribute("data-total", "4");

    // ── Click-through lands on the wizard route ───────────────────────
    await Promise.all([
      page.waitForURL("**/workspace/tax-invoice-checker*"),
      tile.click(),
    ]);
    expect(new URL(page.url()).pathname).toBe("/workspace/tax-invoice-checker");
  });
});
