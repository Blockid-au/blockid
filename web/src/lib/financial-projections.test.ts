// src/lib/financial-projections.test.ts
//
// Tests for the T0120 3-year financial projections engine.
// Determinism, scenario monotonicity, tax on/off, runway calc, CSV shape.

import { describe, it, expect } from "vitest";
import {
  generateProjection,
  projectionToCsv,
  isProjectionScenario,
  type ProjectionInput,
} from "./financial-projections";

const BASE: ProjectionInput = {
  sector: "saas",
  startingMrrAud: 20_000,
  startingBurnAud: 40_000,
  founderCount: 2,
  startDate: "2026-01-01",
  scenario: "moderate",
  includeTaxIncentives: false,
};

describe("financial-projections — T0120", () => {
  it("is deterministic: same input yields identical output", () => {
    const a = generateProjection({ ...BASE });
    const b = generateProjection({ ...BASE });
    // Full structural equality — every number, every date must match.
    expect(a).toEqual(b);
    expect(a.months).toHaveLength(36);
    expect(a.months[0].date).toBe("2026-01-01");
    expect(a.months[35].date).toBe("2028-12-01");
  });

  it("produces exactly 36 monthly rows with monotonically increasing dates", () => {
    const p = generateProjection({ ...BASE, startDate: "2026-06-15" });
    expect(p.months).toHaveLength(36);
    expect(p.months[0].date).toBe("2026-06-01");
    expect(p.months[1].date).toBe("2026-07-01");
    expect(p.months[11].date).toBe("2027-05-01");
    expect(p.months[35].date).toBe("2029-05-01");
  });

  it("aggressive > moderate > conservative revenue in year 3", () => {
    const agg = generateProjection({ ...BASE, scenario: "aggressive" });
    const mod = generateProjection({ ...BASE, scenario: "moderate" });
    const con = generateProjection({ ...BASE, scenario: "conservative" });
    expect(agg.summary.revenueYear3).toBeGreaterThan(mod.summary.revenueYear3);
    expect(mod.summary.revenueYear3).toBeGreaterThan(con.summary.revenueYear3);
    // Also monotonic in year 1
    expect(agg.summary.revenueYear1).toBeGreaterThan(mod.summary.revenueYear1);
    expect(mod.summary.revenueYear1).toBeGreaterThan(con.summary.revenueYear1);
  });

  it("tax-on offset is strictly greater than tax-off (given sufficient R&D spend)", () => {
    const off = generateProjection({ ...BASE, includeTaxIncentives: false });
    const on = generateProjection({ ...BASE, includeTaxIncentives: true });
    const totalOff = off.months.reduce((s, m) => s + m.taxOffsetAud, 0);
    const totalOn = on.months.reduce((s, m) => s + m.taxOffsetAud, 0);
    expect(totalOff).toBe(0);
    expect(totalOn).toBeGreaterThan(0);
    // Total year-1 burn should be lower (or equal) when tax offset applied.
    expect(on.summary.burnYear1).toBeLessThanOrEqual(off.summary.burnYear1);
  });

  it("cash outflow is never negative — floors at 0 when cash-positive", () => {
    // High MRR, low burn — should be cash-positive from month 1.
    const p = generateProjection({
      ...BASE,
      startingMrrAud: 500_000,
      startingBurnAud: 20_000,
    });
    for (const m of p.months) {
      expect(m.cashOutflowAud).toBeGreaterThanOrEqual(0);
    }
    // Cumulative cash outflow stays at 0 for a cash-positive company.
    expect(p.months[35].cumCashAud).toBe(0);
  });

  it("runway (months to EBITDA positive) computed when trajectory turns positive", () => {
    // Cash-positive from month 1 → runwayMonths = 1
    const positive = generateProjection({
      ...BASE,
      startingMrrAud: 500_000,
      startingBurnAud: 20_000,
    });
    expect(positive.summary.runwayMonths).toBe(1);

    // Growth cannot reach break-even in 36 months → runwayMonths = null.
    const negative = generateProjection({
      ...BASE,
      scenario: "conservative",
      startingMrrAud: 1_000,
      startingBurnAud: 200_000,
    });
    expect(negative.summary.runwayMonths).toBeNull();
  });

  it("clamps negative inputs and unknown sector to safe defaults", () => {
    const p = generateProjection({
      ...BASE,
      sector: "not-a-real-sector",
      startingMrrAud: -5000,
      startingBurnAud: -100,
      founderCount: 0,
    });
    expect(p.sectorNormsUsed.sector).toBe("default");
    // Starting MRR floored to 0 → month 1 revenue = 0.
    expect(p.months[0].revenueAud).toBe(0);
    // Starting burn floored to 0 → month 1 opex = 0.
    expect(p.months[0].opexAud).toBe(0);
    // Headcount at least 1 (founders clamped up).
    expect(p.months[0].headcount).toBeGreaterThanOrEqual(1);
  });

  it("CSV export has header + 36 monthly rows + blank + 3 YoY rows", () => {
    const p = generateProjection({ ...BASE });
    const csv = projectionToCsv(p);
    const lines = csv.trim().split("\n");
    // 1 header + 36 monthly + 1 blank + 3 YoY = 41 lines
    expect(lines).toHaveLength(41);
    expect(lines[0]).toContain("period");
    expect(lines[0]).toContain("revenue_aud");
    expect(lines[1].startsWith("monthly,1,")).toBe(true);
    expect(lines[36].startsWith("monthly,36,")).toBe(true);
    // Blank spacer
    expect(lines[37]).toBe("");
    expect(lines[38].startsWith("yoy_year_1,")).toBe(true);
    expect(lines[39].startsWith("yoy_year_2,")).toBe(true);
    expect(lines[40].startsWith("yoy_year_3,")).toBe(true);
  });

  it("isProjectionScenario type guard accepts allowed values only", () => {
    expect(isProjectionScenario("aggressive")).toBe(true);
    expect(isProjectionScenario("moderate")).toBe(true);
    expect(isProjectionScenario("conservative")).toBe(true);
    expect(isProjectionScenario("silly")).toBe(false);
    expect(isProjectionScenario(42)).toBe(false);
    expect(isProjectionScenario(undefined)).toBe(false);
  });
});
