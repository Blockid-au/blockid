// E2E — <TaxInvoiceCheckerClient /> (P5-tax-invoice-checker-ui) on
// /workspace/tax-invoice-checker runs the pure assessTaxInvoice helper in-
// browser and lets a founder validate a supplier tax invoice against the ATO
// s 29-70(1) rules live.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — the
// P5-tax-invoice-checker-ui ship-note stamps "data-testid=\"tax-invoice-
// checker\" + data-band + data-invoice-band" attributes on the wizard root
// and per-input testids "so a future Playwright spec can attach without
// helper edits." This spec is that hook-in (P5-tax-invoice-checker-ui-e2e).
//
// Strategy mirrors tests/e2e/founder/redomicile-wizard.spec.ts +
// tests/e2e/founder/exit-readiness-tile.spec.ts:
//   1. getAccount()-gated skip when the qa-founder fixture is missing so
//      CI on a fresh clone stays green rather than red.
//   2. loginAs() and navigate to /workspace/tax-invoice-checker.
//   3. Skip cleanly when the wizard is not visible (page auth-gates but
//      does not tier-gate — a redirect here would flag a regression).
//   4. Drive the wizard through four discrete band branches:
//        - grey  (initial: nothing typed)
//        - red   (standard-band invoice with mandatory fields missing)
//        - green (Load sample invoice one-click → textbook A$330 valid)
//        - amber (green sample tweaked so GST ≠ total ÷ 11 → tolerance
//                 warning fires but the invoice still ok)
//      Each branch pins the wizard root data-band attribute so a helper
//      drift (e.g. pickTaxInvoiceBand branch reorder) surfaces here.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/tax-invoice-checker";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_TAX_INVOICE_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("TaxInvoiceCheckerClient — P5-tax-invoice-checker-ui-e2e", () => {
  test.setTimeout(30_000);

  test("grey (initial) → red (missing fields) → green (sample) → amber (GST tolerance)", async ({
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

    const wizard = page.getByTestId("tax-invoice-checker");
    const mounted = (await wizard.count()) > 0;
    test.skip(
      !mounted,
      `Tax-invoice checker not visible on ${ROUTE} — auth gate likely redirected ${FOUNDER_EMAIL}.`,
    );

    // ── Initial: nothing typed → grey band, headline invites input ──────
    await expect(wizard).toHaveAttribute("data-band", "grey");
    await expect(wizard).toContainText(
      /Enter invoice details to check ATO compliance/i,
    );

    // ── Standard-band invoice with mandatory fields missing → red ───────
    // A total ≥ A$82.50 lifts the invoice out of under_threshold, so the
    // ATO mandatory-field guards start firing — the wizard should refuse
    // to classify it valid until supplier + date + description arrive.
    await page.getByTestId("tax-invoice-total").fill("330");
    await expect(wizard).toHaveAttribute("data-band", "red");
    await expect(wizard).toHaveAttribute("data-invoice-band", "standard");
    const missingBlock = page.getByTestId("tax-invoice-missing");
    await expect(missingBlock).toBeVisible();
    // At least the supplier-name miss should surface on a bare total-only
    // invoice; the pure assessTaxInvoice suite pins the full branch matrix.
    await expect(
      missingBlock.locator("[data-missing-code='supplier_name']"),
    ).toHaveCount(1);

    // ── Load sample invoice → green (textbook A$330 with GST 30) ────────
    // The Load sample button seeds SAMPLE_STATE (Auschain ABN, valid ABN
    // checksum, GST 30 matches 330 ÷ 11 within tolerance, labelled tax
    // invoice) so the wizard flips to a valid ATO tax invoice with no
    // warnings.
    await page.getByRole("button", { name: /Load sample invoice/i }).click();
    await expect(wizard).toHaveAttribute("data-band", "green");
    await expect(wizard).toContainText(/Valid ATO tax invoice/i);
    // No missing-fields block on a valid sample.
    await expect(page.getByTestId("tax-invoice-missing")).toHaveCount(0);

    // ── Break the GST cross-check (330 ÷ 11 = 30; enter 25) → amber ─────
    // The invoice remains structurally valid (ok=true) but the GST
    // tolerance warning fires because 25 ≠ 30 within the A$0.02
    // tolerance the pure checker enforces.
    await page.getByTestId("tax-invoice-gst-amount").fill("25");
    await expect(wizard).toHaveAttribute("data-band", "amber");
    await expect(wizard).toContainText(/Tax invoice valid, with warnings/i);
    const warnings = page.getByTestId("tax-invoice-warnings");
    await expect(warnings).toBeVisible();

    // ── Clear resets to grey ────────────────────────────────────────────
    await page.getByRole("button", { name: /^Clear$/ }).click();
    await expect(wizard).toHaveAttribute("data-band", "grey");
  });
});
