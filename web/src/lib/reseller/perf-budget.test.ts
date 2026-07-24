import { describe, expect, it } from "vitest";
import {
  RESELLER_CONSOLE_ROUTES,
  TTFB_P95_BUDGET_MS,
  computePercentile,
  evaluatePerfAudit,
  evaluateRouteBudget,
  formatPerfAuditReport,
} from "./perf-budget";

describe("RESELLER_CONSOLE_ROUTES", () => {
  it("covers the 8 canonical /reseller/* pages", () => {
    expect(RESELLER_CONSOLE_ROUTES).toEqual([
      "/reseller",
      "/reseller/customers",
      "/reseller/codes",
      "/reseller/credits",
      "/reseller/create-startup",
      "/reseller/reports",
      "/reseller/requests",
      "/reseller/settings",
    ]);
  });

  it("has no duplicates", () => {
    const set = new Set(RESELLER_CONSOLE_ROUTES);
    expect(set.size).toBe(RESELLER_CONSOLE_ROUTES.length);
  });

  it("every entry starts with /reseller", () => {
    for (const route of RESELLER_CONSOLE_ROUTES) {
      expect(route.startsWith("/reseller")).toBe(true);
    }
  });
});

describe("TTFB_P95_BUDGET_MS", () => {
  it("locks the goal-file budget at 500ms", () => {
    expect(TTFB_P95_BUDGET_MS).toBe(500);
  });
});

describe("computePercentile", () => {
  it("returns null for empty input", () => {
    expect(computePercentile([], 95)).toBeNull();
  });

  it("returns the sole sample for any percentile", () => {
    expect(computePercentile([123], 50)).toBe(123);
    expect(computePercentile([123], 95)).toBe(123);
    expect(computePercentile([123], 99)).toBe(123);
  });

  it("nearest-rank p95 on 20-sample series returns the 19th value", () => {
    const samples = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    // sorted values: 10..200; ceil(0.95 * 20) = 19 → sorted[18] = 190
    expect(computePercentile(samples, 95)).toBe(190);
  });

  it("handles unsorted input", () => {
    expect(computePercentile([300, 100, 200, 50, 400], 50)).toBe(200);
  });

  it("clamps percentiles above 100 to the max sample", () => {
    expect(computePercentile([10, 20, 30], 150)).toBe(30);
  });

  it("clamps negative percentiles to the min sample", () => {
    expect(computePercentile([10, 20, 30], -5)).toBe(10);
  });
});

describe("evaluateRouteBudget", () => {
  it("passes when p95 is well under 500ms", () => {
    const result = evaluateRouteBudget({
      route: "/reseller",
      samples: [120, 130, 140, 150, 160, 170, 180, 190, 200, 210],
    });
    expect(result.passed).toBe(true);
    expect(result.p95).toBeLessThanOrEqual(TTFB_P95_BUDGET_MS);
    expect(result.reason).toMatch(/within_budget/);
  });

  it("passes at the boundary p95 == 500ms", () => {
    const samples = [100, 200, 300, 400, 500];
    const result = evaluateRouteBudget({ route: "/reseller", samples });
    expect(result.p95).toBe(500);
    expect(result.passed).toBe(true);
  });

  it("fails when p95 is 1ms over the budget", () => {
    // Build 20 samples where the 19th sorted value is 501.
    const samples = [
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      100, 100, 100, 100, 501, 999,
    ];
    const result = evaluateRouteBudget({ route: "/reseller/customers", samples });
    expect(result.p95).toBe(501);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/over_budget/);
  });

  it("fails with no_samples when the runner captured zero data", () => {
    const result = evaluateRouteBudget({ route: "/reseller/codes", samples: [] });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("no_samples");
    expect(result.sampleCount).toBe(0);
    expect(result.p95).toBeNull();
  });

  it("respects a custom budget override", () => {
    const result = evaluateRouteBudget(
      { route: "/reseller/reports", samples: [800, 900, 950] },
      1000,
    );
    expect(result.passed).toBe(true);
  });
});

describe("evaluatePerfAudit", () => {
  it("passes overall when every route stays within budget", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller", samples: [100, 150, 200] },
      { route: "/reseller/customers", samples: [110, 160, 210] },
    ]);
    expect(report.overallPassed).toBe(true);
    expect(report.overSlaCount).toBe(0);
    expect(report.emptySampleCount).toBe(0);
  });

  it("fails overall when any single route exceeds budget", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller", samples: [100, 150, 200] },
      { route: "/reseller/reports", samples: [600, 700, 800] },
    ]);
    expect(report.overallPassed).toBe(false);
    expect(report.overSlaCount).toBe(1);
  });

  it("fails overall when any route has zero samples", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller", samples: [100, 200, 300] },
      { route: "/reseller/settings", samples: [] },
    ]);
    expect(report.overallPassed).toBe(false);
    expect(report.emptySampleCount).toBe(1);
  });

  it("fails on an empty input list (nothing to audit is a runner bug)", () => {
    const report = evaluatePerfAudit([]);
    expect(report.overallPassed).toBe(false);
    expect(report.routes).toEqual([]);
  });
});

describe("formatPerfAuditReport", () => {
  it("emits PASS subject when overall passed", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller", samples: [100, 120, 140] },
    ]);
    const out = formatPerfAuditReport(report);
    expect(out.subject).toMatch(/PASS/);
    expect(out.subject).not.toMatch(/off budget/);
    expect(out.html).toContain("/reseller");
    expect(out.text).toContain("PASS");
  });

  it("emits FAIL subject with off-budget count on failure", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller", samples: [700, 800, 900] },
      { route: "/reseller/customers", samples: [] },
    ]);
    const out = formatPerfAuditReport(report);
    expect(out.subject).toMatch(/FAIL/);
    expect(out.subject).toMatch(/2 routes off budget/);
    expect(out.text).toMatch(/no_samples/);
  });

  it("escapes HTML in the report body", () => {
    const report = evaluatePerfAudit([
      { route: "/reseller/<script>", samples: [100] },
    ]);
    const out = formatPerfAuditReport(report);
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});
