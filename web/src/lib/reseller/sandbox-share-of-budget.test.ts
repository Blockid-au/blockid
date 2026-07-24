import { describe, expect, it } from "vitest";
import {
  computeSandboxShare,
  formatWeeklyDigestSandboxShareSection,
  type SandboxShareRow,
} from "./sandbox-share-of-budget";

describe("computeSandboxShare", () => {
  it("returns all-zero and null pcts on empty input", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 0,
      grant_credits_used: 0,
      monthly_credit_budget: 0,
    });
    expect(s.sandbox_credits_used).toBe(0);
    expect(s.grant_credits_used).toBe(0);
    expect(s.total_credits_used).toBe(0);
    expect(s.monthly_credit_budget).toBe(0);
    expect(s.share_of_consumption_pct).toBeNull();
    expect(s.share_of_budget_pct).toBeNull();
  });

  it("computes share_of_consumption_pct as sandbox / (sandbox + grant)", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 250,
      grant_credits_used: 750,
      monthly_credit_budget: 10000,
    });
    // 250 * 100 / (250 + 750) = 25
    expect(s.share_of_consumption_pct).toBe(25);
  });

  it("computes share_of_budget_pct as sandbox / monthly_credit_budget", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 500,
      grant_credits_used: 4500,
      monthly_credit_budget: 10000,
    });
    // 500 * 100 / 10000 = 5
    expect(s.share_of_budget_pct).toBe(5);
  });

  it("floors the pct when it does not divide evenly", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 333,
      grant_credits_used: 667,
      monthly_credit_budget: 10000,
    });
    // 333 * 100 / 1000 = 33.3 → floor = 33
    expect(s.share_of_consumption_pct).toBe(33);
  });

  it("clamps share_of_budget_pct at 999 when sandbox blows past the budget", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 1_000_000,
      grant_credits_used: 0,
      monthly_credit_budget: 100,
    });
    expect(s.share_of_budget_pct).toBe(999);
  });

  it("returns null share_of_consumption_pct when nothing has been spent", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 0,
      grant_credits_used: 0,
      monthly_credit_budget: 10000,
    });
    expect(s.share_of_consumption_pct).toBeNull();
    expect(s.share_of_budget_pct).toBe(0);
  });

  it("returns null share_of_budget_pct when monthly_credit_budget is zero", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 250,
      grant_credits_used: 750,
      monthly_credit_budget: 0,
    });
    expect(s.share_of_budget_pct).toBeNull();
    expect(s.share_of_consumption_pct).toBe(25);
  });

  it("computes 100% consumption share when all spend is sandbox", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 500,
      grant_credits_used: 0,
      monthly_credit_budget: 10000,
    });
    expect(s.share_of_consumption_pct).toBe(100);
    expect(s.share_of_budget_pct).toBe(5);
  });

  it("computes 0% consumption share when all spend is grants", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 0,
      grant_credits_used: 500,
      monthly_credit_budget: 10000,
    });
    expect(s.share_of_consumption_pct).toBe(0);
    expect(s.share_of_budget_pct).toBe(0);
  });

  it("clamps negative counts to 0", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: -50,
      grant_credits_used: -100,
      monthly_credit_budget: -1000,
    });
    expect(s.sandbox_credits_used).toBe(0);
    expect(s.grant_credits_used).toBe(0);
    expect(s.total_credits_used).toBe(0);
    expect(s.monthly_credit_budget).toBe(0);
    expect(s.share_of_consumption_pct).toBeNull();
    expect(s.share_of_budget_pct).toBeNull();
  });

  it("clamps non-finite inputs to 0 without corrupting the ratio", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: NaN as unknown as number,
      grant_credits_used: Infinity as unknown as number,
      monthly_credit_budget: 10000,
    });
    expect(s.sandbox_credits_used).toBe(0);
    expect(s.grant_credits_used).toBe(0);
    expect(s.share_of_consumption_pct).toBeNull();
    expect(s.share_of_budget_pct).toBe(0);
  });

  it("floors fractional counts to whole integers", () => {
    const s = computeSandboxShare({
      sandbox_credits_used: 250.9,
      grant_credits_used: 749.9,
      monthly_credit_budget: 10000.9,
    });
    expect(s.sandbox_credits_used).toBe(250);
    expect(s.grant_credits_used).toBe(749);
    expect(s.total_credits_used).toBe(999);
    expect(s.monthly_credit_budget).toBe(10000);
  });
});

describe("formatWeeklyDigestSandboxShareSection", () => {
  const rows: SandboxShareRow[] = [
    {
      reseller_id: "r-info",
      reseller_code: "INFOVISION",
      reseller_display_name: "InfoVision",
      share: {
        sandbox_credits_used: 250,
        grant_credits_used: 750,
        total_credits_used: 1000,
        monthly_credit_budget: 20000,
        share_of_consumption_pct: 25,
        share_of_budget_pct: 1,
      },
    },
    {
      reseller_id: "r-alpha",
      reseller_code: "ALPHA",
      reseller_display_name: "Alpha",
      share: {
        sandbox_credits_used: 0,
        grant_credits_used: 0,
        total_credits_used: 0,
        monthly_credit_budget: 10000,
        share_of_consumption_pct: null,
        share_of_budget_pct: 0,
      },
    },
  ];

  it("returns empty string for empty input", () => {
    expect(formatWeeklyDigestSandboxShareSection([], "2026-07")).toBe("");
  });

  it("renders the section header with the column labels", () => {
    const html = formatWeeklyDigestSandboxShareSection(rows, "2026-07");
    expect(html).toContain("Sandbox share of budget (2026-07)");
    expect(html).toContain("<th>Code</th>");
    expect(html).toContain("<th>Display name</th>");
    expect(html).toContain("<th>Sandbox used</th>");
    expect(html).toContain("<th>Grants used</th>");
    expect(html).toContain("<th>Total used</th>");
    expect(html).toContain("<th>Budget</th>");
    expect(html).toContain("<th>Consumption %</th>");
    expect(html).toContain("<th>Budget %</th>");
  });

  it("sorts resellers by reseller_code", () => {
    const html = formatWeeklyDigestSandboxShareSection(rows, "2026-07");
    const alphaIdx = html.indexOf("ALPHA");
    const infoIdx = html.indexOf("INFOVISION");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(infoIdx).toBeGreaterThan(alphaIdx);
  });

  it("renders pct cells as N% and — for null", () => {
    const html = formatWeeklyDigestSandboxShareSection(rows, "2026-07");
    expect(html).toContain(">25%<");
    expect(html).toContain(">1%<");
    expect(html).toContain(">0%<");
    expect(html).toContain("&mdash;");
  });

  it("HTML-escapes the display name", () => {
    const html = formatWeeklyDigestSandboxShareSection(
      [
        {
          reseller_id: "r-x",
          reseller_code: "XSS",
          reseller_display_name: "<script>alert(1)</script>",
          share: {
            sandbox_credits_used: 100,
            grant_credits_used: 100,
            total_credits_used: 200,
            monthly_credit_budget: 1000,
            share_of_consumption_pct: 50,
            share_of_budget_pct: 10,
          },
        },
      ],
      "2026-07",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("HTML-escapes the monthKey label", () => {
    const html = formatWeeklyDigestSandboxShareSection(
      [rows[0]],
      "2026-07&<>",
    );
    expect(html).toContain("2026-07&amp;&lt;&gt;");
    expect(html).not.toContain("2026-07&<");
  });

  it("emits a <tfoot> Total row summing counts and portfolio pcts", () => {
    const html = formatWeeklyDigestSandboxShareSection(rows, "2026-07");
    expect(html).toContain("<tfoot>");
    // Total sandbox = 250, grants = 750, total = 1000, budget = 30000
    // consumption_pct = 250/1000 = 25%
    // budget_pct = 250/30000 = 0% (floor)
    expect(html).toContain(">250<");
    expect(html).toContain(">750<");
    expect(html).toContain(">1000<");
    expect(html).toContain(">30000<");
  });

  it("renders portfolio consumption % as — when no reseller has consumed anything", () => {
    const html = formatWeeklyDigestSandboxShareSection(
      [
        {
          reseller_id: "r-a",
          reseller_code: "A",
          reseller_display_name: "A",
          share: {
            sandbox_credits_used: 0,
            grant_credits_used: 0,
            total_credits_used: 0,
            monthly_credit_budget: 1000,
            share_of_consumption_pct: null,
            share_of_budget_pct: 0,
          },
        },
      ],
      "2026-07",
    );
    // Two rows (body + tfoot) each with a — in the Consumption % cell
    expect((html.match(/&mdash;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("renders portfolio budget % as — when the whole portfolio has no budget", () => {
    const html = formatWeeklyDigestSandboxShareSection(
      [
        {
          reseller_id: "r-a",
          reseller_code: "A",
          reseller_display_name: "A",
          share: {
            sandbox_credits_used: 100,
            grant_credits_used: 100,
            total_credits_used: 200,
            monthly_credit_budget: 0,
            share_of_consumption_pct: 50,
            share_of_budget_pct: null,
          },
        },
      ],
      "2026-07",
    );
    // Budget % = — in body and tfoot
    expect((html.match(/&mdash;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("renders 8 <td> cells per body row (code, display, sandbox, grants, total, budget, cons%, budget%)", () => {
    const html = formatWeeklyDigestSandboxShareSection([rows[0]], "2026-07");
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).not.toBeNull();
    const cellCount = (bodyMatch![1].match(/<td/g) ?? []).length;
    expect(cellCount).toBe(8);
  });

  it("renders the portfolio Total row with the correct floor-computed pcts", () => {
    const html = formatWeeklyDigestSandboxShareSection(
      [
        {
          reseller_id: "r-a",
          reseller_code: "A",
          reseller_display_name: "A",
          share: {
            sandbox_credits_used: 333,
            grant_credits_used: 667,
            total_credits_used: 1000,
            monthly_credit_budget: 5000,
            share_of_consumption_pct: 33,
            share_of_budget_pct: 6,
          },
        },
        {
          reseller_id: "r-b",
          reseller_code: "B",
          reseller_display_name: "B",
          share: {
            sandbox_credits_used: 167,
            grant_credits_used: 333,
            total_credits_used: 500,
            monthly_credit_budget: 5000,
            share_of_consumption_pct: 33,
            share_of_budget_pct: 3,
          },
        },
      ],
      "2026-07",
    );
    // totalSandbox=500, totalGrant=1000, totalConsumption=1500, totalBudget=10000
    // portfolioConsumptionPct = floor(500*100/1500) = 33
    // portfolioBudgetPct = floor(500*100/10000) = 5
    const tfootMatch = html.match(/<tfoot>([\s\S]*?)<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    expect(tfootMatch![1]).toContain(">500<");
    expect(tfootMatch![1]).toContain(">1000<");
    expect(tfootMatch![1]).toContain(">1500<");
    expect(tfootMatch![1]).toContain(">10000<");
    expect(tfootMatch![1]).toContain(">33%<");
    expect(tfootMatch![1]).toContain(">5%<");
  });
});
