// E2E — <SbomLicenseRiskTile /> (P7-sbom-license-risk-tile) mounted on
// /dashboard/data-room renders the traffic-light band + counts + top
// runtime-risky rows returned by GET /api/dataroom/sbom.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §2 data-room
// folder 7.9 (Open-Source License Inventory) + 4.9 (Third-Party
// Dependency Inventory). Chain now ships pure lib (buildSbom +
// classifySbomLicenseRisk) → public route (/api/dataroom/sbom with
// license_risk) → helpers (pickSbomTileView / countHiddenRisky —
// vitest covered) → dashboard tile mount → Playwright round-trip
// (this spec — the P7-sbom-license-risk-tile-e2e follow-up).
//
// Strategy mirrors tests/e2e/founder/tax-invoice-history-tile.spec.ts:
//   1. getAccount() + loginAs() the seeded qa-founder (skip when the
//      fixture is missing so CI on a fresh clone stays green).
//   2. page.route() intercepts /api/dataroom/sbom and returns a
//      deterministic payload — the tile fetches once on mount so we
//      reload between branches to swap the stub.
//   3. Navigate to /dashboard/data-room. Skip cleanly when the tile
//      isn't mounted (auth redirect on a fresh clone).
//   4. Drive the tile through the four discrete band branches from
//      pickSbomTileBand (slate / emerald / amber / red) plus the
//      error branch so a helper drift surfaces here rather than on
//      next-day production traffic.

import { test, expect, type Page } from "@playwright/test";
import { getAccount, loginAs } from "../fixtures/accounts";

const ROUTE = "/dashboard/data-room";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_SBOM_TILE_EMAIL ?? "qa-founder-1@blockid.au";

type Band =
  | "strong_copyleft"
  | "proprietary"
  | "weak_copyleft"
  | "unknown"
  | "permissive"
  | "other";

interface RiskEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly dev: boolean;
  readonly band: Band;
}

interface Counts {
  readonly strong_copyleft: number;
  readonly proprietary: number;
  readonly weak_copyleft: number;
  readonly unknown: number;
  readonly permissive: number;
  readonly other: number;
}

const ZERO_COUNTS: Counts = {
  strong_copyleft: 0,
  proprietary: 0,
  weak_copyleft: 0,
  unknown: 0,
  permissive: 0,
  other: 0,
};

const DISCLAIMER =
  "Risk bands are heuristic — they map SPDX-style license identifiers onto strong-copyleft / proprietary / weak-copyleft / permissive / unknown buckets to help spot exposure. This is not a legal opinion. Runtime AGPL / SSPL / GPL, proprietary (UNLICENSED or 'SEE LICENSE IN …') and UNKNOWN packages should be confirmed with counsel before shipping a distributed product; dev-only entries usually do not trigger distribution obligations but should still be tracked. A dual-licensed 'A OR B' package is banded on the least restrictive option, since the licensee chooses.";

function makeBody({
  runtime,
  dev,
  risky,
}: {
  runtime: Partial<Counts>;
  dev?: Partial<Counts>;
  risky?: RiskEntry[];
}) {
  return {
    root_name: "blockid-web",
    root_version: "1.0.0",
    lockfile_version: 3,
    generated_at: "2026-07-25T00:00:00.000Z",
    entries: [],
    summary: {
      total: 0,
      runtime: 0,
      dev: 0,
      unknown_license: 0,
      by_license: [],
    },
    disclaimer: "sbom disclaimer",
    license_risk: {
      generated_at: "2026-07-25T00:00:00.000Z",
      root_name: "blockid-web",
      root_version: "1.0.0",
      counts_runtime: { ...ZERO_COUNTS, ...runtime },
      counts_dev: { ...ZERO_COUNTS, ...(dev ?? {}) },
      runtime_risky: risky ?? [],
      disclaimer: DISCLAIMER,
    },
  };
}

async function stubSbom(
  page: Page,
  body: ReturnType<typeof makeBody> | null,
  { status = 200 }: { status?: number } = {},
) {
  await page.unroute("**/api/dataroom/sbom").catch(() => {
    /* no prior route — first install */
  });
  await page.route("**/api/dataroom/sbom", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (body === null) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      });
      return;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test.describe("SbomLicenseRiskTile — P7-sbom-license-risk-tile-e2e", () => {
  test.setTimeout(45_000);

  test("slate (no runtime) → emerald (permissive) → amber (unknown) → red (strong-copyleft) → error", async ({
    page,
  }) => {
    try {
      getAccount(FOUNDER_EMAIL);
    } catch {
      test.skip(true, `${FOUNDER_EMAIL} not seeded`);
      return;
    }
    await loginAs(page, FOUNDER_EMAIL);

    // ── slate branch ────────────────────────────────────────────────
    // No runtime dependencies at all — pickSbomTileBand short-circuits
    // to slate. Also serves as the mount gate so downstream branches
    // don't spuriously fail on an unmounted tile.
    await stubSbom(page, makeBody({ runtime: {}, dev: { permissive: 3 } }));
    await page.goto(ROUTE);

    const tile = page.getByTestId("sbom-license-risk-tile");
    const mounted = (await tile.count()) > 0;
    test.skip(
      !mounted,
      `SbomLicenseRiskTile not mounted on ${ROUTE} — likely an auth redirect.`,
    );

    await expect(tile).toHaveAttribute("data-state", "ready");
    await expect(tile).toHaveAttribute("data-band", "slate");
    await expect(tile).toHaveAttribute("data-runtime-total", "0");
    await expect(tile).toHaveAttribute("data-dev-total", "3");
    await expect(tile).toContainText(/No runtime deps/i);
    await expect(tile).toContainText(/no runtime dependencies/i);
    // Disclaimer is regulated-content copy — must survive verbatim.
    await expect(tile).toContainText(/not a legal opinion/i);
    // Deep-link targets are stable — a rename of the API route without
    // updating the tile would silently strand the founder.
    await expect(page.getByTestId("sbom-license-risk-json-link")).toHaveAttribute(
      "href",
      "/api/dataroom/sbom",
    );
    await expect(page.getByTestId("sbom-license-risk-csv-link")).toHaveAttribute(
      "href",
      "/api/dataroom/sbom?format=csv",
    );
    // Risky-rows list is hidden when the report has none.
    await expect(page.getByTestId("sbom-license-risk-rows")).toHaveCount(0);

    // ── emerald branch ──────────────────────────────────────────────
    // Runtime is permissive-only (MIT / Apache-2.0 / BSD-3-Clause).
    // pickSbomTileBand returns emerald + "All permissive" chip.
    await stubSbom(
      page,
      makeBody({ runtime: { permissive: 42 }, dev: { permissive: 10 } }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-band", "emerald");
    await expect(tile).toHaveAttribute("data-runtime-total", "42");
    await expect(tile).toContainText(/All permissive/i);
    await expect(tile).toContainText(/runtime is permissive/i);
    // Counts row surfaces the split even when zero — the permissive
    // cell must report 42, and the strong-copyleft cell 0.
    const permissiveCell = page
      .getByTestId("sbom-license-risk-counts")
      .locator('[data-band="permissive"]');
    await expect(permissiveCell).toHaveAttribute("data-count", "42");
    const strongCell = page
      .getByTestId("sbom-license-risk-counts")
      .locator('[data-band="strong_copyleft"]');
    await expect(strongCell).toHaveAttribute("data-count", "0");
    await expect(page.getByTestId("sbom-license-risk-rows")).toHaveCount(0);

    // ── amber branch ────────────────────────────────────────────────
    // Runtime has one unknown-license package (weak_copyleft would
    // also trigger amber; we exercise unknown here). Chip copy is
    // "1 unknown license" from formatChip.
    await stubSbom(
      page,
      makeBody({
        runtime: { permissive: 30, unknown: 1 },
        risky: [
          {
            name: "mystery-pkg",
            version: "0.4.2",
            license: "",
            dev: false,
            band: "unknown",
          },
        ],
      }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-band", "amber");
    await expect(tile).toContainText(/1 unknown license/i);
    await expect(tile).toContainText(/unknown-license packages in runtime/i);
    // Runtime-risky row surfaces with band + license attributes so a
    // future spec can attach without helper edits.
    const rows = page.getByTestId("sbom-license-risk-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-band", "unknown");
    await expect(rows.first()).toHaveAttribute("data-license", "UNKNOWN");
    await expect(rows.first()).toContainText(/mystery-pkg/);

    // ── red branch ──────────────────────────────────────────────────
    // Runtime carries a strong-copyleft entry (AGPL-3.0) — worst-band
    // wins in pickSbomTileBand so this dominates the header colour.
    // Also seed 6 risky rows against the default rowCap=5 so the
    // "+N more" pointer fires (countHiddenRisky = 1).
    await stubSbom(
      page,
      makeBody({
        runtime: { permissive: 20, strong_copyleft: 1, unknown: 2, weak_copyleft: 3 },
        risky: [
          { name: "surveil-sdk", version: "2.1.0", license: "AGPL-3.0", dev: false, band: "strong_copyleft" },
          { name: "unknown-a", version: "1.0.0", license: "", dev: false, band: "unknown" },
          { name: "unknown-b", version: "1.0.0", license: "", dev: false, band: "unknown" },
          { name: "weak-a", version: "1.0.0", license: "LGPL-3.0", dev: false, band: "weak_copyleft" },
          { name: "weak-b", version: "1.0.0", license: "MPL-2.0", dev: false, band: "weak_copyleft" },
          { name: "weak-c", version: "1.0.0", license: "EPL-2.0", dev: false, band: "weak_copyleft" },
        ],
      }),
    );
    await page.reload();
    await expect(tile).toHaveAttribute("data-band", "red");
    await expect(tile).toContainText(/1 strong-copyleft/i);
    await expect(tile).toContainText(/strong-copyleft in runtime/i);
    await expect(page.getByTestId("sbom-license-risk-rows")).toHaveCount(1);
    // rowCap defaults to 5; we seeded 6 risky rows so exactly 1 is
    // hidden and the "+1 more" pointer must render.
    await expect(page.getByTestId("sbom-license-risk-row")).toHaveCount(5);
    await expect(page.getByTestId("sbom-license-risk-more")).toContainText(
      /\+1 more/i,
    );
    // Strong-copyleft row sorts first per RISKY_BAND_RANK.
    const firstRow = page.getByTestId("sbom-license-risk-row").first();
    await expect(firstRow).toHaveAttribute("data-band", "strong_copyleft");
    await expect(firstRow).toHaveAttribute("data-license", "AGPL-3.0");

    // ── error branch ────────────────────────────────────────────────
    // Server returns 500 — tile flips to data-state="error" with the
    // Retry button rendered so a founder can recover without navigating
    // away. Regression guard on the error-state render path.
    await stubSbom(page, null, { status: 500 });
    await page.reload();
    await expect(tile).toHaveAttribute("data-state", "error");
    await expect(tile).toContainText(/SBOM license-risk unavailable/i);
    await expect(page.getByTestId("sbom-license-risk-error")).toContainText(
      /HTTP 500/,
    );
    await expect(page.getByTestId("sbom-license-risk-retry")).toBeVisible();
  });
});
