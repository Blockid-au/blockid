// E2E — <MarketSizeTile /> IBISWorld deep-links block (P3-ibisworld-tile-wire)
// on /dashboard/market-size renders the IBISWorld report list — or its
// empty-state fallback — driven by the pure findIbisworldDeeplinks() lib
// consumed server-side.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md — P3-ibisworld-tile-wire
// ship note flagged this Playwright coverage as a natural follow-up
// (P3-ibisworld-tile-e2e):
//   "Playwright coverage of the new block (asserting `market-size-ibisworld`
//    presence, exactly one of empty-state vs report list,
//    `data-ibisworld-report-id` on populated rows, disclaimer verbatim
//    under `/not personal financial product advice/i` regex) is a natural
//    follow-up under P3-ibisworld-tile-e2e mirroring the
//    `market-size-tile.spec.ts` / `redomicile-wizard.spec.ts` posture."
//
// Two deterministic ANZSIC query variants exercise both branches of the
// server-side pipeline without touching seed data:
//   (a) ?anzsic=J5810 (Software Publishing) — has one IBISWorld source in
//       web/src/lib/market/au-market-lookup.ts (line 117) → populated list
//       branch fires with data-ibisworld-report-id on the row.
//   (b) ?anzsic=M6910 (Scientific Research Services / Deeptech) — has NO
//       IBISWorld source → empty-state branch fires ("No IBISWorld report
//       is seeded for this sector yet").
//
// Both variants share two invariants that regulatory drift would break:
//   - The "Browse the AU industry index" fallback link resolves to the
//     IBISWORLD_INDEX_URL constant (dropping it strands founders whose
//     sector is not in the seeded set).
//   - IBISWORLD_DEEPLINKS_DISCLAIMER renders verbatim under the s766B
//     "not personal financial product advice" regex — dropping the hedge
//     is a Corps Act 2001 (Cth) exposure, not a copy nit.
//
// Skip strategy mirrors market-size-tile.spec.ts and redomicile-wizard.spec.ts:
//   1. getAccount()-gated skip when the qa-founder fixture is missing so
//      CI on a fresh clone stays green.
//   2. loginAs() then check for the tile root; if missing (auth redirect
//      on unseeded fixture) skip cleanly with a diagnostic rather than
//      false-failing.

import { test, expect } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/market-size";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_IBISWORLD_TILE_EMAIL ?? "qa-founder-1@blockid.au";
const IBISWORLD_INDEX_URL_PREFIX = "https://www.ibisworld.com/au/industry";
const DISCLAIMER_REGEX = /not personal financial product advice/i;

test.describe("MarketSizeTile IBISWorld block — P3-ibisworld-tile-e2e", () => {
  test.setTimeout(30_000);

  test("populated report row (?anzsic=J5810) → empty state (?anzsic=M6910)", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    // ── (a) Populated list — J5810 SaaS has one IBISWorld report ────────
    await page.goto(`${ROUTE}?anzsic=J5810`);
    let tile = page.getByTestId("market-size-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `Market-size tile not visible on ${ROUTE} — likely an auth redirect for ${FOUNDER_EMAIL}.`,
    );
    await expect(tile).toHaveAttribute("data-anzsic", "J5810");

    const ibisworld = page.getByTestId("market-size-ibisworld");
    await expect(ibisworld).toBeVisible();
    // Populated branch — data-report-count must be > 0 and match the row count.
    const reportCount = Number(
      (await ibisworld.getAttribute("data-report-count")) ?? "0",
    );
    expect(reportCount).toBeGreaterThan(0);

    const rows = ibisworld.getByTestId("market-size-ibisworld-row");
    expect(await rows.count()).toBe(reportCount);

    // Every row carries a non-empty data-ibisworld-report-id (the parsed
    // trailing path segment on the IBISWorld URL); a null/empty attribute
    // would indicate extractIbisworldReportId regressed on the canonical
    // /au/industry/<slug>/<id>/ URL shape.
    for (const row of await rows.all()) {
      const anzsic = await row.getAttribute("data-anzsic");
      expect(anzsic).toBe("J5810");
      const reportId = await row.getAttribute("data-ibisworld-report-id");
      expect(reportId).toBeTruthy();
      expect(reportId).not.toBe("");
    }

    // Empty-state paragraph MUST NOT render on the populated branch.
    await expect(
      ibisworld.locator("text=No IBISWorld report is seeded"),
    ).toHaveCount(0);

    // Fallback "Browse the AU industry index" link is always present.
    const indexLink = ibisworld.getByRole("link", {
      name: /Browse the AU industry index/i,
    });
    await expect(indexLink).toBeVisible();
    const indexHref = await indexLink.getAttribute("href");
    expect(indexHref ?? "").toContain(IBISWORLD_INDEX_URL_PREFIX);

    // Disclaimer travels with every render — dropping it is a s766B risk.
    await expect(ibisworld).toContainText(DISCLAIMER_REGEX);

    // ── (b) Empty state — M6910 Deeptech has no IBISWorld source ────────
    await page.goto(`${ROUTE}?anzsic=M6910`);
    tile = page.getByTestId("market-size-tile");
    await expect(tile).toHaveAttribute("data-anzsic", "M6910");

    const ibisworldEmpty = page.getByTestId("market-size-ibisworld");
    await expect(ibisworldEmpty).toBeVisible();
    await expect(ibisworldEmpty).toHaveAttribute("data-report-count", "0");
    await expect(
      ibisworldEmpty.getByTestId("market-size-ibisworld-row"),
    ).toHaveCount(0);
    // Empty-state copy is the founder-visible signal that the sector is
    // outside the seeded set — copy-rename guard.
    await expect(ibisworldEmpty).toContainText(
      /No IBISWorld report is seeded for this sector yet/i,
    );

    // Fallback link + disclaimer must still render in the empty branch —
    // that is the whole point of the empty-state (give the founder a
    // pointer at the portal instead of a dead end).
    const emptyIndexLink = ibisworldEmpty.getByRole("link", {
      name: /Browse the AU industry index/i,
    });
    await expect(emptyIndexLink).toBeVisible();
    const emptyIndexHref = await emptyIndexLink.getAttribute("href");
    expect(emptyIndexHref ?? "").toContain(IBISWORLD_INDEX_URL_PREFIX);
    await expect(ibisworldEmpty).toContainText(DISCLAIMER_REGEX);
  });
});
