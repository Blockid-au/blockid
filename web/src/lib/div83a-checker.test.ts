import { describe, it, expect } from "vitest";
import { checkDiv83A, type Div83AGrantInput, type Div83AProjectInput } from "./div83a-checker";

function baseGrant(overrides: Partial<Div83AGrantInput> = {}): Div83AGrantInput {
  return {
    grantDate: "2025-07-01",
    strikePriceAud: 0.1,
    vestingYears: 4,
    cliffMonths: 12,
    ...overrides,
  };
}

function baseProject(overrides: Partial<Div83AProjectInput> = {}): Div83AProjectInput {
  return {
    hasEsicRuling: true,
    isListed: false,
    aggregatedTurnoverAud: 2_500_000,
    incorporatedAt: "2022-01-01",
    ...overrides,
  };
}

describe("checkDiv83A", () => {
  it("returns unsure when the employee-status test is not overridden", () => {
    const result = checkDiv83A(baseGrant(), baseProject(), 1.5);
    // The employee-status criterion is always null (proxy required).
    expect(result.status).toBe("unsure");
    const employee = result.criteria.find((c) => c.key === "grantee_is_employee");
    expect(employee?.met).toBeNull();
    expect(result.guidance).toMatch(/grantee_is_employee/);
  });

  it("returns ineligible when aggregated turnover exceeds A$50m", () => {
    const result = checkDiv83A(
      baseGrant(),
      baseProject({ aggregatedTurnoverAud: 75_000_000 }),
      1.5,
    );
    expect(result.status).toBe("ineligible");
    const turnover = result.criteria.find((c) => c.key === "turnover_cap");
    expect(turnover?.met).toBe(false);
    expect(result.guidance).toMatch(/turnover_cap/);
  });

  it("returns ineligible when the company is 10+ years old at grant time", () => {
    const result = checkDiv83A(
      baseGrant({ grantDate: "2025-06-01" }),
      baseProject({ incorporatedAt: "2010-01-01" }),
      1.5,
    );
    expect(result.status).toBe("ineligible");
    const age = result.criteria.find((c) => c.key === "age_lt_10y");
    expect(age?.met).toBe(false);
  });

  it("returns ineligible when the company is listed", () => {
    const result = checkDiv83A(baseGrant(), baseProject({ isListed: true }), 1.5);
    expect(result.status).toBe("ineligible");
    const unlisted = result.criteria.find((c) => c.key === "unlisted");
    expect(unlisted?.met).toBe(false);
  });

  it("returns ineligible when grantee post-grant ownership exceeds 10%", () => {
    const result = checkDiv83A(baseGrant(), baseProject(), 12.5);
    expect(result.status).toBe("ineligible");
    const ownership = result.criteria.find((c) => c.key === "ownership_cap");
    expect(ownership?.met).toBe(false);
  });

  it("returns ineligible when strike is zero and no forfeiture / holding test met", () => {
    const result = checkDiv83A(
      baseGrant({ strikePriceAud: 0, vestingYears: 1, cliffMonths: 0 }),
      baseProject(),
      1.5,
    );
    expect(result.status).toBe("ineligible");
    const market = result.criteria.find((c) => c.key === "market_value");
    const holding = result.criteria.find((c) => c.key === "holding_or_forfeiture");
    expect(market?.met).toBe(false);
    expect(holding?.met).toBe(false);
  });

  it("returns ineligible when ESIC ruling is explicitly false", () => {
    const result = checkDiv83A(baseGrant(), baseProject({ hasEsicRuling: false }), 1.5);
    expect(result.status).toBe("ineligible");
    const esic = result.criteria.find((c) => c.key === "esic_eligible");
    expect(esic?.met).toBe(false);
  });

  it("marks holding-or-forfeiture met via 12-month cliff even with 2-year vesting", () => {
    const result = checkDiv83A(
      baseGrant({ vestingYears: 2, cliffMonths: 12 }),
      baseProject(),
      1.5,
    );
    const holding = result.criteria.find((c) => c.key === "holding_or_forfeiture");
    expect(holding?.met).toBe(true);
  });

  it("carries the AFSL-style disclaimer in guidance regardless of outcome", () => {
    const eligibleAttempt = checkDiv83A(baseGrant(), baseProject(), 1.5);
    const ineligibleAttempt = checkDiv83A(
      baseGrant(),
      baseProject({ isListed: true }),
      1.5,
    );
    expect(eligibleAttempt.guidance).toMatch(/registered tax agent/i);
    expect(ineligibleAttempt.guidance).toMatch(/registered tax agent/i);
  });
});
