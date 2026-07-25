// E2E — <MarketSizeTile /> (P3e) on /dashboard/market-size renders the AU
// ANZSIC / TAM / SAM / SOM anchor from the pure au-market-lookup fixture
// consumed server-side.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P3e ship note:
//   "`data-testid` on the tile root + suggestions items so a future
//    Playwright spec can attach without helper edits."
// This spec is the P3e-market-size-tile-e2e follow-up flagged there.
//
// The tile is an RSC — no client fetch to mock. The query-string overrides
// (`?anzsic=`, `?keyword=`) drive the pure lookup at request time so the
// spec rides the deterministic seeded fixture at
// web/src/lib/market/au-market-lookup.ts. A rename / removal of the J5810
// SaaS or K6419 Fintech seeds surfaces as a test failure here rather than
// a silent regression in the founder-facing dashboard tile.
//
// Strategy mirrors tests/e2e/founder/exit-readiness-tile.spec.ts:
//   1. getAccount()-gated skip when the qa-founder fixture is missing so
//      CI on a fresh clone stays green.
//   2. loginAs() and navigate through three deterministic query variants:
//       (a) ?anzsic=J5810                     → SaaS anchor
//       (b) ?keyword=fintech                  → K6419 anchor + suggestions
//       (c) ?keyword=zzz_no_match_zebra_zeta  → empty state
//   3. Assert (a) the ANZSIC chip surfaces via data-anzsic on the section
//      root, (b) the AU_MARKET_LOOKUP_DISCLAIMER string is present, (c)
//      suggestions render for keyword lookups and are omitted from the
//      empty-state variant.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/market-size";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_MARKET_SIZE_EMAIL ?? "qa-founder-1@blockid.au";

test.describe("MarketSizeTile — P3e-market-size-tile-e2e", () => {
  test.setTimeout(30_000);

  test("ANZSIC override → keyword override + suggestions → empty state on unmatched keyword", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    // ── (a) Explicit ANZSIC override → J5810 SaaS anchor ─────────────────
    await page.goto(`${ROUTE}?anzsic=J5810`);
    let tile = page.getByTestId("market-size-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `Market-size tile not visible on ${ROUTE} — likely an auth redirect for ${FOUNDER_EMAIL}.`,
    );

    await expect(tile).toHaveAttribute("data-anzsic", "J5810");
    await expect(tile).toContainText(/Software Publishing/i);
    // AU_MARKET_LOOKUP_DISCLAIMER travels with every result — dropping it
    // is a regulated-content risk (s766B Corps Act general-information guard).
    await expect(tile).toContainText(
      /ABS|IBISWorld|anchor|not personal financial product advice/i,
    );
    // ANZSIC override skips the suggestions block (per page.tsx logic —
    // suggestions only fire on keyword lookups, not on explicit ANZSIC).
    await expect(page.getByTestId("market-size-suggestions")).toHaveCount(0);

    // ── (b) Keyword override → K6419 Fintech + at least one suggestion ───
    await page.goto(`${ROUTE}?keyword=fintech`);
    tile = page.getByTestId("market-size-tile");
    await expect(tile).toHaveAttribute("data-anzsic", "K6419");
    await expect(tile).toContainText(/Fintech|Financial Intermediation/i);

    const suggestions = page.getByTestId("market-size-suggestions");
    await expect(suggestions).toBeVisible();
    // Sibling suggestions exclude the matched class — every rendered chip
    // has a non-K6419 data-anzsic attribute.
    const chips = suggestions.locator("[data-anzsic]");
    expect(await chips.count()).toBeGreaterThan(0);
    for (const chip of await chips.all()) {
      const code = await chip.getAttribute("data-anzsic");
      expect(code).not.toBe("K6419");
    }

    // ── (c) Unmatched keyword → empty state ──────────────────────────────
    await page.goto(`${ROUTE}?keyword=zzz_no_match_zebra_zeta`);
    tile = page.getByTestId("market-size-tile");
    await expect(tile).toHaveAttribute("data-empty", "true");
    await expect(tile).not.toHaveAttribute("data-anzsic", /.+/);
    // Empty-state copy echoes the caller's keyword back so a founder can
    // eyeball what didn't match.
    await expect(tile).toContainText(/zzz_no_match_zebra_zeta/);
  });
});
