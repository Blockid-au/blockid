/**
 * Smoke/unit tests for the C-Level Reports hub page.
 *
 * We deliberately test pure helpers used by the page (sparkline math + role
 * lookup) rather than the async server component, which would require a
 * heavy Supabase/auth mock. E2E coverage of the page render lives in
 * tests/e2e/c-level-reports.spec.ts (to be added by the QA pass).
 */
import { describe, it, expect } from "vitest";
import {
  primaryMetricForRole,
  compareTrendAcross12Weeks,
  type TrendSnapshot,
} from "@/lib/c-level/compare-trend";

const ROLES = ["cfo", "ceo", "cto", "cmo", "cdo"] as const;

describe("c-level-reports hub: role → metric wiring", () => {
  it("wires all 5 supported roles to a primary metric", () => {
    for (const role of ROLES) {
      expect(primaryMetricForRole(role)).toBeTruthy();
    }
  });

  it("CFO card renders base DCF as its primary metric", () => {
    expect(primaryMetricForRole("cfo")).toBe("dcf_valuation_base");
  });

  it("CEO card renders runway as its primary metric", () => {
    expect(primaryMetricForRole("ceo")).toBe("runway_months");
  });

  it("CMO card renders CAC payback as its primary metric", () => {
    expect(primaryMetricForRole("cmo")).toBe("cac_payback_months");
  });
});

describe("c-level-reports hub: trend arrow direction rules", () => {
  it("displays 'up' for improving valuation", () => {
    const snaps: TrendSnapshot[] = [
      { week_number: 1, snapshot_date: "2026-07-01", dcf_valuation_base: 1_000_000 },
      { week_number: 2, snapshot_date: "2026-07-08", dcf_valuation_base: 1_200_000 },
    ];
    expect(compareTrendAcross12Weeks(snaps, "dcf_valuation_base").direction).toBe("up");
  });

  it("displays 'down' for shrinking runway", () => {
    const snaps: TrendSnapshot[] = [
      { week_number: 1, snapshot_date: "2026-07-01", runway_months: 18 },
      { week_number: 2, snapshot_date: "2026-07-08", runway_months: 12 },
    ];
    expect(compareTrendAcross12Weeks(snaps, "runway_months").direction).toBe("down");
  });

  it("shows 'insufficient-data' when only one snapshot exists", () => {
    const snaps: TrendSnapshot[] = [
      { week_number: 1, snapshot_date: "2026-07-01", runway_months: 18 },
    ];
    expect(compareTrendAcross12Weeks(snaps, "runway_months").direction).toBe("insufficient-data");
  });

  it("shows 'insufficient-data' when the DB has snapshots but the metric is missing", () => {
    const snaps: TrendSnapshot[] = [
      { week_number: 1, snapshot_date: "2026-07-01" },
      { week_number: 2, snapshot_date: "2026-07-08" },
    ];
    expect(compareTrendAcross12Weeks(snaps, "runway_months").direction).toBe("insufficient-data");
  });
});

describe("c-level-reports hub: multi-startup safety (scoping)", () => {
  it("only ranks snapshots by their own project's dates (no cross-project bleed at helper layer)", () => {
    // The compare helper is scope-agnostic; scoping is enforced at the SQL
    // layer via .eq('project_id', ...). This test asserts the helper does not
    // add any implicit ordering or aggregation that would blur scopes.
    const snaps: TrendSnapshot[] = [
      { week_number: 1, snapshot_date: "2026-07-01", arr_aud: 100 },
      { week_number: 2, snapshot_date: "2026-07-08", arr_aud: 200 },
    ];
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.sparkline).toEqual([100, 200]);
    expect(r.startValue).toBe(100);
    expect(r.endValue).toBe(200);
  });
});
