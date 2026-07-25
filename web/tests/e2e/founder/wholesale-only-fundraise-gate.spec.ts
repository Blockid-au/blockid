// E2E — wholesale-only fundraise gate (P6b-test).
//
// The workspace/fundraise wizard grew a `wholesaleOnly` opt-in card in
// Step 0 (fundraise-client.tsx line ~594) that flips the ESIC + Div 83A
// compliance gates on /api/fundraise from warn-mode to blocking-mode
// (412). The gate wire shape + heading copy pack is unit-tested via
// fundraise-gate.helpers.test.ts; this spec pins the UI-side branch
// matrix so a render regression shows up in Playwright too.
//
// Strategy mirrors tests/e2e/founder/next-step-tile.spec.ts:
//   1. loginAs() a seeded qa-founder (skip cleanly when the fixture is
//      missing so a fresh clone stays green).
//   2. page.route() intercepts POST /api/fundraise and returns a
//      deterministic body keyed on the wholesaleOnly flag in the request.
//   3. Navigate to /workspace/fundraise. Skip cleanly if the wizard is
//      not mounted (auth redirect / paywall).
//   4. Drive three branches:
//        (a) wholesaleOnly=false + ESIC warn → amber warn banner renders,
//            wizard advances (fundraise-gate-warn testid present),
//        (b) wholesaleOnly=true  + ESIC block → red block banner renders
//            with the "Fix now" link pointing at /compliance/esic
//            (fundraise-gate-block testid present, disclaimer visible),
//        (c) wholesaleOnly=true  + Div 83A block → block banner heading
//            swaps to the Div 83A copy pack + "Fix now" points at
//            /compliance/div83a.
//
// Statutory anchors that must not silently vanish from the block banner
// disclaimer (regulated-content invariant, matches the disclaimer-guard
// posture of exit-readiness-tile.spec.ts + compliance-calendar-page.spec.ts):
//   s708(8) / s708(11) / s761G(7) Corporations Act 2001 (Cth)
//   ITAA 1997 Subdiv 83A-B / 83A-C
//   ITAA 1997 Div 360 (ESIC)

import { test, expect, type Route } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/fundraise";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_FUNDRAISE_EMAIL ?? "qa-founder-1@blockid.au";

const AFSL_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). ITAA 1997 Div 360.";

const HAPPY_PATH_WITH_ESIC_WARN = {
  ok: true,
  round: {
    id: "round-stub-1",
    round_name: "Pre-Seed",
    target_amount: 500_000,
    pre_money_valuation: 2_000_000,
    instrument_type: "safe",
    safe_discount: 20,
    safe_cap: 5_000_000,
    share_price: 1,
    new_shares: 500_000,
    dilution_pct: 20,
    status: "draft",
    created_at: "2026-07-25T00:00:00Z",
  },
  dilutionTable: [],
  newCapTable: {
    shareholders: [],
    newInvestorBlock: { name: "Wholesale-only investor", shares: 500_000, pct: 20 },
    esop: null,
    totalSharesAfter: 2_500_000,
  },
  esic_warn: {
    reason: "esic_assessment_missing",
    message:
      "Run the ESIC self-assessment before you rely on the 20% offset in investor materials.",
    url_to_fix: "/compliance/esic",
  },
};

const ESIC_BLOCK_412 = {
  error: "esic_gate_blocked",
  reason: "esic_assessment_missing",
  message:
    "This round is marked wholesale-only and pitches the ESIC 20% offset. Complete the ESIC self-assessment before saving.",
  url_to_fix: "/compliance/esic",
  disclaimer: AFSL_DISCLAIMER,
};

const DIV83A_BLOCK_412 = {
  error: "div83a_gate_blocked",
  reason: "grants_ineligible",
  message:
    "At least one active ESOP grant fails the Div 83A start-up concession. Wholesale-only rounds cannot claim the concession while a grant is ineligible.",
  url_to_fix: "/compliance/div83a",
  disclaimer:
    "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). ITAA 1997 Subdiv 83A-B / 83A-C.",
};

/**
 * Install a route handler that dispatches on the `wholesaleOnly` flag in
 * the POST body so a single spec run can exercise all three branches
 * without re-routing. `activeBlock` picks which 412 body to return when
 * wholesaleOnly=true.
 */
async function installFundraiseRoute(
  page: import("@playwright/test").Page,
  activeBlock: "esic" | "div83a",
) {
  await page.route("**/api/fundraise", async (route: Route) => {
    const req = route.request();
    // Only intercept POSTs — the wizard also does a GET on mount for
    // past rounds; we let those fall through with an empty list.
    if (req.method() !== "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, rounds: [] }),
      });
      return;
    }
    let body: { wholesaleOnly?: boolean } = {};
    try {
      body = JSON.parse(req.postData() ?? "{}");
    } catch {
      body = {};
    }
    if (body.wholesaleOnly === true) {
      const payload = activeBlock === "esic" ? ESIC_BLOCK_412 : DIV83A_BLOCK_412;
      await route.fulfill({
        status: 412,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HAPPY_PATH_WITH_ESIC_WARN),
    });
  });

  // /api/fundraise/readiness is also fetched on mount — return an empty
  // ok body so the readiness panel doesn't stall.
  await page.route("**/api/fundraise/readiness", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, checklist: [], comparables: [] }),
    });
  });
}

test.describe("Wholesale-only fundraise gate — P6b-test", () => {
  test.setTimeout(45_000);

  test("warns on non-wholesale, blocks on wholesale-only ESIC + Div 83A branches", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      // fixture missing — fall through to skip below.
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    // Start with the ESIC block branch — we'll reset the route between
    // the ESIC and Div 83A branches so a single page load can cover both.
    await installFundraiseRoute(page, "esic");
    await page.goto(ROUTE);

    // Skip cleanly when the wizard is not mounted (paywall / tier gate /
    // auth redirect). The wholesale-only checkbox is the canonical hook.
    const wholesaleToggle = page.getByTestId("fundraise-wholesale-only");
    const mounted = (await wholesaleToggle.count()) > 0;
    test.skip(
      !mounted,
      "Fundraise wizard not mounted on /workspace/fundraise — likely an auth or plan redirect.",
    );

    // ── Branch (a): warn-mode (wholesaleOnly=false) ────────────────────
    await expect(wholesaleToggle).not.toBeChecked();
    await page.getByRole("button", { name: /calculate/i }).first().click();
    const warnBanner = page.getByTestId("fundraise-gate-warn");
    await expect(warnBanner).toBeVisible();
    await expect(warnBanner).toContainText(/compliance follow-ups outstanding/i);
    await expect(
      warnBanner.getByRole("link", { name: /resolve/i }).first(),
    ).toHaveAttribute("href", "/compliance/esic");
    // No block banner should be present in warn-mode.
    await expect(page.getByTestId("fundraise-gate-block")).toHaveCount(0);

    // The wizard advanced to Step 1 on the 200 response. Step back to
    // Step 0 so we can flip the toggle and re-submit.
    await page.getByRole("button", { name: /back/i }).click();

    // ── Branch (b): blocking-mode ESIC 412 (wholesaleOnly=true) ────────
    await wholesaleToggle.check();
    await expect(wholesaleToggle).toBeChecked();
    await page.getByRole("button", { name: /calculate/i }).first().click();
    const blockBanner = page.getByTestId("fundraise-gate-block");
    await expect(blockBanner).toBeVisible();
    await expect(blockBanner).toContainText(
      /Wholesale-only round blocked by ESIC gate/i,
    );
    await expect(blockBanner).toContainText(/esic_assessment_missing/);
    // Regulated-content invariant — the AFSL / Div 360 disclaimer must
    // render verbatim inside the block banner.
    await expect(blockBanner).toContainText(/s766B/);
    await expect(blockBanner).toContainText(/ITAA 1997 Div 360/);
    await expect(
      blockBanner.getByRole("link", { name: /fix now/i }),
    ).toHaveAttribute("href", "/compliance/esic");

    // ── Branch (c): blocking-mode Div 83A 412 (wholesaleOnly=true) ─────
    // Re-install the route so the next 412 returns the Div 83A body.
    await page.unroute("**/api/fundraise");
    await installFundraiseRoute(page, "div83a");
    await page.getByRole("button", { name: /calculate/i }).first().click();
    await expect(blockBanner).toBeVisible();
    await expect(blockBanner).toContainText(
      /Wholesale-only round blocked by Div 83A ESOP gate/i,
    );
    await expect(blockBanner).toContainText(/grants_ineligible/);
    await expect(blockBanner).toContainText(/Subdiv 83A-B \/ 83A-C/);
    await expect(
      blockBanner.getByRole("link", { name: /fix now/i }),
    ).toHaveAttribute("href", "/compliance/div83a");
  });
});
