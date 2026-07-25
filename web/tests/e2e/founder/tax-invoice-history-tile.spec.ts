// E2E — <TaxInvoiceHistoryTile /> (P5-tax-invoice-checker-tile) mounted on
// /dashboard/compliance renders the saved-snapshot count + latest-band chip
// coming back from GET /api/compliance/tax-invoice-check.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 5 P1 gap
// "ATO tax-invoice format checker absent" — end-to-end chain now ships pure
// lib (P5-tax-invoice-checker) → founder wizard (P5-tax-invoice-checker-ui)
// → POST/GET route + persistence table (P5-tax-invoice-checker-persist) →
// Save button in the wizard (P5-tax-invoice-checker-save) → read-only tile
// on the compliance panel (P5-tax-invoice-checker-tile) → Playwright round-
// trip (this spec — the P5-tax-invoice-checker-tile-e2e follow-up).
//
// Strategy mirrors tests/e2e/founder/next-step-tile.spec.ts +
// tests/e2e/founder/investor-readiness-tile.spec.ts:
//   1. getAccount() + loginAs() the seeded qa-founder (skip when the
//      fixture is missing so CI on a fresh clone stays green).
//   2. page.route() intercepts /api/compliance/tax-invoice-check and
//      returns a deterministic payload — the tile fetches once on mount
//      so we reload between branches to swap the stub.
//   3. Navigate to /dashboard/compliance. Skip cleanly when the tile
//      isn't mounted (e.g. auth redirect on a fresh clone).
//   4. Drive the tile through the four discrete branches from
//      pickHistoryTileView (slate / red / amber / emerald) so a helper
//      drift surfaces here rather than on next-day production traffic.

import { test, expect, type Page } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/compliance";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_TAX_INVOICE_TILE_EMAIL ??
  process.env.QA_FOUNDER_TAX_INVOICE_EMAIL ??
  "qa-founder-1@blockid.au";

type LatestFixture = {
  ok: boolean;
  band: "under_threshold" | "standard" | "large";
  gst_inclusive_total_aud: number;
  computed_gst_component_aud: number;
  missing_field_count: number;
  warning_count: number;
  computed_at: string;
};

function makeBody(total: number, latest: LatestFixture | null) {
  return {
    ok: true,
    total,
    result: latest,
  };
}

async function stubTaxInvoiceHistory(
  page: Page,
  body: ReturnType<typeof makeBody>,
) {
  await page.unroute("**/api/compliance/tax-invoice-check").catch(() => {
    /* no prior route — first install */
  });
  await page.route("**/api/compliance/tax-invoice-check", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("TaxInvoiceHistoryTile — P5-tax-invoice-checker-tile-e2e", () => {
  test.setTimeout(45_000);

  test("slate (empty) → red (missing fields) → amber (warnings) → emerald (clean)", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    // ── slate branch ──────────────────────────────────────────────────
    // total=0 → pickHistoryTileView returns the empty-state slate chip
    // "None saved". Also serves as the "tile is reachable at all" mount
    // gate so downstream branches don't spuriously fail.
    await stubTaxInvoiceHistory(page, makeBody(0, null));
    await page.goto(ROUTE);

    const tile = page.getByTestId("tax-invoice-history-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `TaxInvoiceHistoryTile not mounted on ${ROUTE} — likely an auth redirect.`,
    );

    await expect(tile).toHaveAttribute("data-colour", "slate");
    await expect(tile).toHaveAttribute("data-total", "0");
    await expect(tile).toContainText(/None saved/i);
    await expect(tile).toContainText(/Run a receipt through the ATO tax-invoice checker/i);
    // Empty state must NOT surface a "Last checked" secondary line.
    await expect(tile).not.toContainText(/Last checked/i);
    // Deep-link target is stable — a rename of /workspace/tax-invoice-
    // checker without updating the tile would silently strand a founder.
    await expect(tile).toHaveAttribute("href", "/workspace/tax-invoice-checker");

    // ── red branch ────────────────────────────────────────────────────
    // Latest snapshot fails the ATO checklist (missing_field_count > 0).
    // pickHistoryTileView returns "3 missing" chip + red colour; grammar
    // pluralises the "fields" copy for count > 1.
    await stubTaxInvoiceHistory(
      page,
      makeBody(4, {
        ok: false,
        band: "standard",
        gst_inclusive_total_aud: 330,
        computed_gst_component_aud: 30,
        missing_field_count: 3,
        warning_count: 0,
        computed_at: new Date().toISOString(),
      }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-colour", "red");
    await expect(tile).toHaveAttribute("data-total", "4");
    await expect(tile).toContainText(/3 missing/i);
    await expect(tile).toContainText(/4 saved/i);
    await expect(tile).toContainText(/A\$82\.50 – A\$1,000/);
    await expect(tile).toContainText(/3 missing fields/i);
    await expect(tile).toContainText(/Last checked today/i);

    // ── amber branch ──────────────────────────────────────────────────
    // Latest snapshot passes (ok=true, missing_field_count=0) but
    // carries warnings. Singular "1 warning" grammar is pinned so a
    // grammar-drift on the helper surfaces here.
    await stubTaxInvoiceHistory(
      page,
      makeBody(1, {
        ok: true,
        band: "large",
        gst_inclusive_total_aud: 1200,
        computed_gst_component_aud: 109.09,
        missing_field_count: 0,
        warning_count: 1,
        computed_at: new Date().toISOString(),
      }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-colour", "amber");
    await expect(tile).toHaveAttribute("data-total", "1");
    await expect(tile).toContainText(/1 warning\b/i);
    // total=1 uses the "1 saved" singular form.
    await expect(tile).toContainText(/1 saved/i);
    await expect(tile).toContainText(/A\$1,000\+/);
    await expect(tile).toContainText(/passed with 1 warning/i);

    // ── emerald branch ────────────────────────────────────────────────
    // Latest snapshot passes cleanly — no missing fields, no warnings.
    // Data-room folder 3 anchor must survive as the "safe to file"
    // copy pointer (regulated-content invariant against a rename of
    // the destination folder in data-room-templates.ts).
    await stubTaxInvoiceHistory(
      page,
      makeBody(7, {
        ok: true,
        band: "under_threshold",
        gst_inclusive_total_aud: 55,
        computed_gst_component_aud: 5,
        missing_field_count: 0,
        warning_count: 0,
        computed_at: new Date().toISOString(),
      }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-colour", "emerald");
    await expect(tile).toHaveAttribute("data-total", "7");
    await expect(tile).toContainText(/7 saved/i);
    await expect(tile).toContainText(/Under A\$82\.50/);
    await expect(tile).toContainText(/data-room folder 3/i);
  });
});
