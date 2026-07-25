// E2E — /compliance/s708 founder form UI walk-through
// (P1n-s708-form-ui-e2e — closes the P1n-gst-form-ui-e2e tail-note "Playwright
// coverage under P1n-s708-form-ui-e2e) remains the next natural follow-up now
// that GST is at parity — the s708 form is a stateless preview tool (no
// persistence yet — the durable events[] source is still owned by the sibling
// share-register-schema tick), so the s708 spec will drive the pure
// assessS708SmallScale() branch matrix through the form UI rather than the
// wire round-trip", bringing S708CounterFormClient (P1n-s708-form) to parity
// with WgeaFormClient / ModernSlaveryFormClient / GstFormClient.
//
// Strategy mirrors tests/e2e/compliance/gst-form.spec.ts:
//   1. getAccount(QA_EMAIL) → skip cleanly when the fixture is missing so
//      CI on a fresh clone stays green.
//   2. loginAs() a seeded qa-founder and navigate to /compliance/s708.
//   3. Skip when the counter heading is not visible (auth-gated redirect on
//      unseeded fixtures — matches the mount-gate the sibling gst-form spec
//      uses).
//   4. Paste 2 accepted personal offers (2 unique investors, A$50k each) →
//      Run counter → banner renders with the "s708(1) exemption still
//      available" ok headline + "2 / 20" investor tally + "A$100,000" raised.
//   5. Enable the preview panel + add 25 new investors → resubmit → banner
//      flips to the "s708(1) exemption blocked" red headline (preview would
//      breach the 20-investor cap → wouldBreachInvestor → block).
//
// Zero source-code churn — S708CounterFormClient already exposes
// data-testid="s708-counter-result-banner" from the P1n-s708-form ship.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/compliance/s708";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_S708_FORM_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("S708CounterFormClient — P1n-s708-form-ui-e2e", () => {
  test.setTimeout(30_000);

  test("2 offers → ok banner; preview 25 new investors → block banner", async ({
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

    const heading = page.getByRole("heading", {
      name: "Model the next tranche",
    });
    const mounted = (await heading.count()) > 0;
    test.skip(
      !mounted,
      `s708(1) counter not visible on ${ROUTE} — page may have redirected for ${FOUNDER_EMAIL}.`,
    );

    // ── Fill 2 personal offers (2 investors, A$50k each) → ok banner ──────
    const events = page.getByLabel("Personal-offer events");
    await events.fill(
      [
        "2026-01-05, alice@example.com, 50000, primary",
        "2026-02-10, bob@example.com, 50000, primary",
      ].join("\n"),
    );

    await page.getByRole("button", { name: "Run s708(1) counter" }).click();

    const banner = page.getByTestId("s708-counter-result-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("s708(1) exemption still available");
    // investor tally "2 / 20" surfaced from result.investor_count_12mo /
    // result.investor_cap.
    await expect(banner).toContainText("2 / 20");
    // dollars raised "A$100,000" (2 × A$50,000) surfaced from
    // result.dollars_raised_12mo_aud.
    await expect(banner).toContainText("A$100,000");
    // dollar cap "A$2,000,000" surfaced from result.dollar_cap_aud.
    await expect(banner).toContainText("A$2,000,000");

    // ── Enable preview + 25 new investors → block banner ─────────────────
    await page
      .getByLabel("Show what happens if we accept this next tranche")
      .check();

    await page.getByLabel("New investors added").fill("25");

    await page.getByRole("button", { name: "Run s708(1) counter" }).click();

    // Preview of +25 investors on top of the existing 2 would land at 27 —
    // over the 20-investor cap → wouldBreachInvestor → block. Headline
    // sourced from HEADLINES[result.status] in s708-counter-form-client.tsx.
    await expect(banner).toContainText("s708(1) exemption blocked");
    // reason string calls out the 20-investor cap.
    await expect(banner).toContainText("20-investor cap");
  });
});
