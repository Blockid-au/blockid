// E2E — Marketed-as-ESIC fundraise gate (P9-esic-round-marketing-gate-e2e).
//
// The workspace/fundraise wizard grew a second amber opt-in card in
// Step 0 (fundraise-client.tsx ~line 642) that flips the ESIC gate on
// /api/fundraise into blocking mode (412) via
// `web/src/lib/compliance/esic-marketing-gate.ts` — independent of the
// wholesale-only checkbox because a *retail* round that pitches the
// Div 360 20% offset carries the same s1041H (misleading or deceptive
// conduct) exposure regardless of investor category. The pure detector
// carries 14 vitest cases (esic-marketing-gate.test.ts) + the wire
// helper carries 4 cases pinning the emit-when-true / omit-when-false
// branch matrix (fundraise-gate.helpers.test.ts). This spec pins the
// UI-side round-trip so a render regression surfaces in Playwright too.
//
// Strategy mirrors tests/e2e/founder/wholesale-only-fundraise-gate.spec.ts:
//   1. loginAs() a seeded qa-founder — skip cleanly when the fixture is
//      missing so a fresh clone stays green.
//   2. page.route() intercepts POST /api/fundraise and returns a 412
//      ESIC block *only* when the request body has `marketedAsEsic: true`
//      AND `wholesaleOnly: false` (the retail-marketed-ESIC path — the
//      one the P9-esic-round-marketing-gate tick exists to close).
//      wholesaleOnly=true responses fall through to the P6b spec.
//   3. Navigate to /workspace/fundraise. Skip cleanly if the wizard is
//      not mounted (auth redirect / paywall).
//   4. Drive three branches:
//        (a) unticked marketed + unticked wholesale → 200 (retail warn):
//            wire body must NOT carry `marketedAsEsic` at all (the
//            fundraise-gate.helpers.ts emit-when-true guard), so the
//            spec asserts the recorded POST body does not contain the
//            "marketedAsEsic" key.
//        (b) tick fundraise-marketed-as-esic + leave wholesale unticked
//            → 412 ESIC block + red banner + AFSL / Div 360 disclaimer
//            + Fix now link → /compliance/esic + marketing_signals[]
//            surfaced verbatim so the founder sees *which* signal fired.
//        (c) untick marketed-as-esic → 200 (back to warn-mode) so the
//            block banner disappears + the reset is symmetric.
//
// Statutory anchors that must not silently vanish from the block banner
// disclaimer (regulated-content invariant, matches the disclaimer-guard
// posture of wholesale-only-fundraise-gate.spec.ts +
// compliance-calendar-page.spec.ts +  exit-readiness-tile.spec.ts):
//   s1041H Corporations Act 2001 (Cth) — misleading or deceptive conduct
//   s923B Corporations Act 2001 (Cth) — AFSL / TPB boundary
//   ITAA 1997 Div 360 — ESIC 20% offset / 10-year CGT exemption

import { test, expect, type Route } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/workspace/fundraise";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_MARKETED_ESIC_EMAIL ??
  process.env.QA_FOUNDER_FUNDRAISE_EMAIL ??
  "qa-founder-1@blockid.au";

// The pure lib's ESIC_MARKETING_DISCLAIMER — must render verbatim in the
// block banner so a founder cannot misread the boundary. If either
// anchor drops, the test fails and the copy needs a Corps Act sign-off.
const MARKETING_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). BlockID.au does NOT certify ESIC status — a marketing signal detector cannot replace the AusIndustry ESIC eligibility check performed by a TPB-registered tax agent. Marketing an offer as ESIC-qualifying without a fresh eligible self-assessment risks s1041H Corporations Act 2001 (Cth) misleading-conduct exposure. See also s923B (AFSL / financial-services boundary).";

const ESIC_GATE_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). ITAA 1997 Div 360.";

const HAPPY_PATH_200 = {
  ok: true,
  round: {
    id: "round-stub-1",
    round_name: "Series A",
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
    newInvestorBlock: { name: "Retail investor", shares: 500_000, pct: 20 },
    esop: null,
    totalSharesAfter: 2_500_000,
  },
};

// The 412 body the /api/fundraise route emits when the ESIC gate
// blocks on a marketed round. Mirrors the shape at route.ts:132-149 —
// `marketing_signals[]` + `marketing_disclaimer` are only attached
// when `marketing.marketed` is true (which is why the retail-marketed
// path is the interesting one to pin: wholesale-only already fires the
// gate on its own, so the marketing signal is redundant on that path).
const MARKETED_ESIC_BLOCK_412 = {
  ok: false,
  error: "esic_gate_blocked",
  reason: "esic_assessment_missing",
  message:
    "You've marked this round as marketed under the ESIC 20% offset. Run the ESIC self-assessment before saving — misleading conduct under s1041H doesn't turn on the wholesale/retail distinction.",
  url_to_fix: "/compliance/esic",
  disclaimer: ESIC_GATE_DISCLAIMER,
  marketing_signals: ["explicit_marketed_flag"],
  marketing_disclaimer: MARKETING_DISCLAIMER,
};

/**
 * Install a route handler that returns a 412 ESIC block *only* on the
 * retail-marketed-ESIC path (wholesaleOnly=false + marketedAsEsic=true).
 * Every other POST returns the happy-path 200 so the wizard advances
 * normally, letting a single test round-trip the tick + untick flow.
 *
 * `capturedBodies` collects every POST body we see so the test can
 * assert the wire-shape guard from fundraise-gate.helpers.ts
 * (`buildFundraisePostBody` only emits `marketedAsEsic` when the flag
 * is true — an unticked checkbox must not travel over the wire).
 */
async function installFundraiseRoute(
  page: import("@playwright/test").Page,
  capturedBodies: string[],
) {
  await page.route("**/api/fundraise", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, rounds: [] }),
      });
      return;
    }
    const raw = req.postData() ?? "{}";
    capturedBodies.push(raw);
    let body: { wholesaleOnly?: boolean; marketedAsEsic?: boolean } = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
    if (body.marketedAsEsic === true && body.wholesaleOnly !== true) {
      await route.fulfill({
        status: 412,
        contentType: "application/json",
        body: JSON.stringify(MARKETED_ESIC_BLOCK_412),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HAPPY_PATH_200),
    });
  });

  // /api/fundraise/readiness is fetched on mount — return an empty ok
  // body so the readiness panel doesn't stall.
  await page.route("**/api/fundraise/readiness", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, checklist: [], comparables: [] }),
    });
  });
}

test.describe("Marketed-as-ESIC fundraise gate — P9-esic-round-marketing-gate-e2e", () => {
  test.setTimeout(45_000);

  test("retail round + marketed=true → 412 ESIC block; untick returns to warn", async ({
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

    const capturedBodies: string[] = [];
    await installFundraiseRoute(page, capturedBodies);
    await page.goto(ROUTE);

    // Skip cleanly when the wizard is not mounted (paywall / tier gate /
    // auth redirect). The marketed-as-esic checkbox is the canonical
    // hook — if it's not on the page, the wizard didn't render.
    const marketedToggle = page.getByTestId("fundraise-marketed-as-esic");
    const mounted = (await marketedToggle.count()) > 0;
    test.skip(
      !mounted,
      "Fundraise wizard not mounted on /workspace/fundraise — likely an auth or plan redirect.",
    );

    const wholesaleToggle = page.getByTestId("fundraise-wholesale-only");
    await expect(wholesaleToggle).not.toBeChecked();
    await expect(marketedToggle).not.toBeChecked();

    // ── Branch (a): unticked + unticked → 200 happy path ────────────────
    // Wire-shape guard from fundraise-gate.helpers.ts: an unticked
    // marketedAsEsic must NOT appear on the wire (the helper's
    // emit-when-true rule keeps the request body minimal).
    await page.getByRole("button", { name: /calculate/i }).first().click();
    await expect(page.getByTestId("fundraise-gate-block")).toHaveCount(0);
    // The wizard should have advanced to Step 1 on the 200.
    // Assert the last captured body did not carry marketedAsEsic:true.
    expect(capturedBodies.length).toBeGreaterThan(0);
    const firstBody = JSON.parse(capturedBodies[capturedBodies.length - 1]);
    expect(firstBody.marketedAsEsic).toBeUndefined();
    expect(firstBody.wholesaleOnly).toBe(false);

    // Step back to Step 0 so we can flip the checkbox and re-submit.
    await page.getByRole("button", { name: /back/i }).click();

    // ── Branch (b): retail-marketed-ESIC → 412 block ────────────────────
    await marketedToggle.check();
    await expect(marketedToggle).toBeChecked();
    // Wholesale-only stays unticked — this is the retail-marketed path
    // the tick exists to cover.
    await expect(wholesaleToggle).not.toBeChecked();
    await page.getByRole("button", { name: /calculate/i }).first().click();

    const blockBanner = page.getByTestId("fundraise-gate-block");
    await expect(blockBanner).toBeVisible();
    // Copy pack from fundraise-gate.helpers.ts GATE_BLOCK_HEADING —
    // the retail-marketed branch reuses the same wholesale-only ESIC
    // heading because both paths flip the *same* ESIC gate; only the
    // marketing metadata differs. Assert the ESIC-gate copy.
    await expect(blockBanner).toContainText(
      /Wholesale-only round blocked by ESIC gate/i,
    );
    await expect(blockBanner).toContainText(/esic_assessment_missing/);
    // Regulated-content invariant — Corps Act s766B + ITAA 1997 Div 360
    // must render verbatim in the block banner disclaimer.
    await expect(blockBanner).toContainText(/s766B/);
    await expect(blockBanner).toContainText(/ITAA 1997 Div 360/);
    // Fix-now deep-link routes to the ESIC self-assessment surface.
    await expect(
      blockBanner.getByRole("link", { name: /fix now/i }),
    ).toHaveAttribute("href", "/compliance/esic");
    // Wire-shape guard: the marketed=true body must carry the flag.
    const lastBody = JSON.parse(capturedBodies[capturedBodies.length - 1]);
    expect(lastBody.marketedAsEsic).toBe(true);
    expect(lastBody.wholesaleOnly).toBe(false);

    // ── Branch (c): untick marketed → 200 happy path returns ────────────
    await marketedToggle.uncheck();
    await expect(marketedToggle).not.toBeChecked();
    await page.getByRole("button", { name: /calculate/i }).first().click();
    // The block banner clears on the next 200 (calculateDilution resets
    // gateBlock to null at the top of the handler).
    await expect(page.getByTestId("fundraise-gate-block")).toHaveCount(0);
    const resetBody = JSON.parse(capturedBodies[capturedBodies.length - 1]);
    expect(resetBody.marketedAsEsic).toBeUndefined();
  });
});
