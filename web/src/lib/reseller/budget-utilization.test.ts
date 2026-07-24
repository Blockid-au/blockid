import { describe, expect, it } from "vitest";
import {
  computeBudgetUtilization,
  formatWeeklyDigestBudgetSection,
  type BudgetUtilizationInput,
  type BudgetUtilizationRow,
} from "./budget-utilization";

function input(overrides: Partial<BudgetUtilizationInput> = {}): BudgetUtilizationInput {
  return {
    monthly_credit_budget: 1000,
    monthly_sandbox_credits: 500,
    grant_credits_used: 250,
    sandbox_credits_used: 100,
    ...overrides,
  };
}

describe("computeBudgetUtilization", () => {
  it("computes floor percent for both grant + sandbox within cap", () => {
    const u = computeBudgetUtilization(input());
    expect(u.grant_used).toBe(250);
    expect(u.grant_budget).toBe(1000);
    expect(u.grant_pct).toBe(25);
    expect(u.sandbox_used).toBe(100);
    expect(u.sandbox_cap).toBe(500);
    expect(u.sandbox_pct).toBe(20);
  });

  it("floors partial percents so 749/1000 renders as 74%", () => {
    const u = computeBudgetUtilization(input({ grant_credits_used: 749 }));
    expect(u.grant_pct).toBe(74);
  });

  it("returns pct=null when the cap is zero (no denominator)", () => {
    const u = computeBudgetUtilization(
      input({ monthly_credit_budget: 0, monthly_sandbox_credits: 0 }),
    );
    expect(u.grant_pct).toBeNull();
    expect(u.sandbox_pct).toBeNull();
    expect(u.grant_budget).toBe(0);
    expect(u.sandbox_cap).toBe(0);
  });

  it("returns pct=0 when used=0 and cap>0", () => {
    const u = computeBudgetUtilization(
      input({ grant_credits_used: 0, sandbox_credits_used: 0 }),
    );
    expect(u.grant_pct).toBe(0);
    expect(u.sandbox_pct).toBe(0);
  });

  it("clamps runaway over-budget approvals to 999%", () => {
    const u = computeBudgetUtilization(
      input({ grant_credits_used: 1_000_000, monthly_credit_budget: 100 }),
    );
    expect(u.grant_pct).toBe(999);
  });

  it("coerces negative + non-finite inputs to zero without crashing", () => {
    const u = computeBudgetUtilization({
      monthly_credit_budget: Number.NaN,
      monthly_sandbox_credits: -50,
      grant_credits_used: -10,
      sandbox_credits_used: Number.POSITIVE_INFINITY,
    });
    expect(u.grant_used).toBe(0);
    expect(u.grant_budget).toBe(0);
    expect(u.grant_pct).toBeNull();
    expect(u.sandbox_used).toBe(0);
    expect(u.sandbox_cap).toBe(0);
    expect(u.sandbox_pct).toBeNull();
  });

  it("reports 100% at exact cap boundary", () => {
    const u = computeBudgetUtilization(
      input({ grant_credits_used: 1000, sandbox_credits_used: 500 }),
    );
    expect(u.grant_pct).toBe(100);
    expect(u.sandbox_pct).toBe(100);
  });
});

function row(
  code: string,
  display: string,
  overrides: Partial<BudgetUtilizationInput> = {},
): BudgetUtilizationRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    utilization: computeBudgetUtilization(input(overrides)),
  };
}

describe("formatWeeklyDigestBudgetSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestBudgetSection([], "2026-07")).toBe("");
  });

  it("renders the section header with the month key", () => {
    const html = formatWeeklyDigestBudgetSection([row("ALPHA", "Alpha")], "2026-07");
    expect(html).toContain("Credit-budget utilization (2026-07)");
    expect(html).toContain("monthly_credit_budget");
    expect(html).toContain("monthly_sandbox_credits");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestBudgetSection(
      [row("ZULU", "Zulu"), row("ALPHA", "Alpha")],
      "2026-07",
    );
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("renders — for null percent cells when a cap is zero", () => {
    const html = formatWeeklyDigestBudgetSection(
      [row("ZEROCAP", "Zero", { monthly_credit_budget: 0, monthly_sandbox_credits: 0 })],
      "2026-07",
    );
    expect(html).toContain("—");
    // Suffix with % rather than —% for a real number cell.
    expect(html).not.toContain("null%");
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestBudgetSection(
      [row("XSS", "<script>alert(1)</script>")],
      "2026-07",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("HTML-escapes hostile month key so a caller cannot inject markup via the header", () => {
    const html = formatWeeklyDigestBudgetSection(
      [row("ALPHA", "Alpha")],
      "<script>",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders a % suffix for numeric percent cells", () => {
    const html = formatWeeklyDigestBudgetSection(
      [row("ALPHA", "Alpha", { grant_credits_used: 500, sandbox_credits_used: 250 })],
      "2026-07",
    );
    expect(html).toContain("50%"); // 500/1000
    expect(html).toContain("50%"); // 250/500
  });
});
