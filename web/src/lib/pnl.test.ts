import { describe, it, expect } from "vitest";
import { generatePnL } from "./pnl";

const baseArgs = {
  revenue: 30000,
  expenses: {
    aiApiCosts: 3000,
    hosting: 1500,
    marketing: 500,
    legal: 200,
    other: 100,
  },
  cashOnHand: 50000,
};

describe("generatePnL — happy path & totals", () => {
  it("returns the canonical PnLReport shape with the requested period", () => {
    const report = generatePnL({ ...baseArgs, period: "2026-Q3" });

    expect(report.period).toBe("2026-Q3");
    expect(report.revenue.total).toBe(30000);
    expect(report.expenses.total).toBe(5300);
  });

  it("sums every expense category into expenses.total", () => {
    const report = generatePnL({
      revenue: 0,
      expenses: {
        aiApiCosts: 10,
        hosting: 20,
        marketing: 30,
        legal: 40,
        other: 50,
      },
      cashOnHand: 0,
    });
    expect(report.expenses.total).toBe(150);
    expect(report.expenses.aiApiCosts).toBe(10);
    expect(report.expenses.hosting).toBe(20);
    expect(report.expenses.marketing).toBe(30);
    expect(report.expenses.legal).toBe(40);
    expect(report.expenses.other).toBe(50);
  });

  it("defaults missing expense categories to 0 without throwing", () => {
    const report = generatePnL({
      revenue: 5000,
      expenses: {},
      cashOnHand: 10000,
    });
    expect(report.expenses.aiApiCosts).toBe(0);
    expect(report.expenses.hosting).toBe(0);
    expect(report.expenses.marketing).toBe(0);
    expect(report.expenses.legal).toBe(0);
    expect(report.expenses.other).toBe(0);
    expect(report.expenses.total).toBe(0);
  });
});

describe("generatePnL — grossProfit & grossMargin", () => {
  it("computes grossProfit = revenue - aiApiCosts - hosting", () => {
    const report = generatePnL(baseArgs);
    expect(report.grossProfit).toBe(30000 - 3000 - 1500);
  });

  it("computes grossMargin as (grossProfit / revenue) * 100", () => {
    const report = generatePnL(baseArgs);
    // (25500 / 30000) * 100 = 85
    expect(report.grossMargin).toBe(85);
  });

  it("returns grossMargin = 0 when revenue is 0 (avoids divide-by-zero)", () => {
    const report = generatePnL({
      revenue: 0,
      expenses: { aiApiCosts: 100 },
      cashOnHand: 0,
    });
    expect(report.grossMargin).toBe(0);
    // grossProfit is still computed literally: 0 - 100 - 0 = -100
    expect(report.grossProfit).toBe(-100);
  });

  it("permits negative grossProfit when COGS > revenue", () => {
    const report = generatePnL({
      revenue: 1000,
      expenses: { aiApiCosts: 800, hosting: 500 },
      cashOnHand: 0,
    });
    // 1000 - 800 - 500 = -300
    expect(report.grossProfit).toBe(-300);
    expect(report.grossMargin).toBe(-30);
  });
});

describe("generatePnL — netIncome, burnRate, runway", () => {
  it("returns burnRate=0 when netIncome is positive", () => {
    const report = generatePnL(baseArgs);
    // 30000 - 5300 = 24700 → positive
    expect(report.netIncome).toBe(24700);
    expect(report.burnRate).toBe(0);
  });

  it("computes burnRate = |netIncome / 3| when netIncome is negative", () => {
    const report = generatePnL({
      revenue: 15000,
      expenses: {
        aiApiCosts: 5000,
        hosting: 2000,
        marketing: 10000,
        legal: 1000,
        other: 500,
      },
      cashOnHand: 90000,
    });
    expect(report.netIncome).toBe(-3500);
    // |−3500 / 3| = 1166.67 (round2)
    expect(report.burnRate).toBe(1166.67);
  });

  it("returns runway = floor(cashOnHand / burnRate) when burnRate > 0", () => {
    const report = generatePnL({
      revenue: 15000,
      expenses: {
        aiApiCosts: 5000,
        hosting: 2000,
        marketing: 10000,
        legal: 1000,
        other: 500,
      },
      cashOnHand: 90000,
    });
    // floor(90000 / 1166.67) = 77
    expect(report.runway).toBe(77);
  });

  it("returns runway = 999 sentinel when burnRate is 0 but cash > 0", () => {
    const report = generatePnL(baseArgs);
    expect(report.burnRate).toBe(0);
    expect(report.runway).toBe(999);
  });

  it("returns runway = 0 when burnRate is 0 and cash is 0", () => {
    const report = generatePnL({
      revenue: 0,
      expenses: {},
      cashOnHand: 0,
    });
    expect(report.burnRate).toBe(0);
    expect(report.runway).toBe(0);
  });

  it("returns runway = 0 when burnRate is 0 and cash is negative (defensive)", () => {
    // Not > 0 branch — the code uses `cashOnHand > 0`, so negatives fall to 0.
    const report = generatePnL({
      revenue: 100,
      expenses: {},
      cashOnHand: -50,
    });
    expect(report.burnRate).toBe(0);
    expect(report.runway).toBe(0);
  });
});

describe("generatePnL — expense alias handling", () => {
  it("accepts `ai` as an alias for aiApiCosts", () => {
    const report = generatePnL({
      revenue: 1000,
      expenses: { ai: 250 },
      cashOnHand: 0,
    });
    expect(report.expenses.aiApiCosts).toBe(250);
  });

  it("accepts `infra` as an alias for hosting", () => {
    const report = generatePnL({
      revenue: 1000,
      expenses: { infra: 400 },
      cashOnHand: 0,
    });
    expect(report.expenses.hosting).toBe(400);
  });

  it("prefers canonical `aiApiCosts` over the `ai` alias when both are supplied", () => {
    const report = generatePnL({
      revenue: 1000,
      expenses: { aiApiCosts: 111, ai: 999 },
      cashOnHand: 0,
    });
    expect(report.expenses.aiApiCosts).toBe(111);
  });

  it("prefers canonical `hosting` over the `infra` alias when both are supplied", () => {
    const report = generatePnL({
      revenue: 1000,
      expenses: { hosting: 222, infra: 888 },
      cashOnHand: 0,
    });
    expect(report.expenses.hosting).toBe(222);
  });

  it("treats canonical 0 as authoritative — `0 ?? 999` is 0 (not the alias)", () => {
    // The ?? operator only falls through on null/undefined, so `aiApiCosts: 0`
    // must win against `ai: 500`. Regression guard for the alias-precedence contract.
    const report = generatePnL({
      revenue: 500,
      expenses: { aiApiCosts: 0, ai: 500 },
      cashOnHand: 0,
    });
    expect(report.expenses.aiApiCosts).toBe(0);
  });
});

describe("generatePnL — revenue breakdown", () => {
  it("defaults mrr to revenue / 3 when caller omits it (quarterly assumption)", () => {
    const report = generatePnL({
      revenue: 9000,
      expenses: {},
      cashOnHand: 0,
    });
    expect(report.revenue.mrr).toBe(3000);
  });

  it("honours a caller-supplied mrr override", () => {
    const report = generatePnL({
      revenue: 9000,
      expenses: {},
      cashOnHand: 0,
      mrr: 5000,
    });
    expect(report.revenue.mrr).toBe(5000);
  });

  it("splits mrr into ~30% creditSales and ~70% planSubscriptions", () => {
    const report = generatePnL({
      revenue: 9000,
      expenses: {},
      cashOnHand: 0,
      mrr: 10000,
    });
    expect(report.revenue.creditSales).toBe(3000);
    expect(report.revenue.planSubscriptions).toBe(7000);
  });

  it("echoes revenue.total = revenue (rounded to 2dp)", () => {
    const report = generatePnL({
      revenue: 1234.5678,
      expenses: {},
      cashOnHand: 0,
    });
    expect(report.revenue.total).toBe(1234.57);
  });
});

describe("generatePnL — period label", () => {
  it("uses caller-supplied period verbatim", () => {
    const report = generatePnL({ ...baseArgs, period: "FY26" });
    expect(report.period).toBe("FY26");
  });

  it("defaults period to YYYY-Q<1-4> when caller omits it", () => {
    const report = generatePnL(baseArgs);
    expect(report.period).toMatch(/^\d{4}-Q[1-4]$/);
  });

  it("default period Q number matches the current month's quarter", () => {
    const report = generatePnL(baseArgs);
    const now = new Date();
    const expectedQ = Math.ceil((now.getMonth() + 1) / 3);
    expect(report.period).toBe(`${now.getFullYear()}-Q${expectedQ}`);
  });
});

describe("generatePnL — rounding to 2dp", () => {
  it("rounds every expense line to 2 decimals", () => {
    const report = generatePnL({
      revenue: 100,
      expenses: {
        aiApiCosts: 33.3333,
        hosting: 11.1111,
        marketing: 5.5555,
        legal: 0.0001,
        other: 0.9999,
      },
      cashOnHand: 0,
    });
    expect(report.expenses.aiApiCosts).toBe(33.33);
    expect(report.expenses.hosting).toBe(11.11);
    expect(report.expenses.marketing).toBe(5.56);
    expect(report.expenses.legal).toBe(0);
    expect(report.expenses.other).toBe(1);
    // total sums the raw values then rounds: 33.3333+11.1111+5.5555+0.0001+0.9999 = 50.9999 → 51
    expect(report.expenses.total).toBe(51);
  });

  it("rounds grossProfit to 2 decimals", () => {
    const report = generatePnL({
      revenue: 100,
      expenses: { aiApiCosts: 33.333, hosting: 0 },
      cashOnHand: 0,
    });
    // 100 - 33.333 - 0 = 66.667 → 66.67
    expect(report.grossProfit).toBe(66.67);
  });

  it("rounds grossMargin to 2 decimals", () => {
    const report = generatePnL({
      revenue: 300,
      expenses: { aiApiCosts: 100, hosting: 0 },
      cashOnHand: 0,
    });
    // (200 / 300) * 100 = 66.6666... → 66.67
    expect(report.grossMargin).toBe(66.67);
  });

  it("rounds revenue.creditSales and revenue.planSubscriptions to 2 decimals", () => {
    const report = generatePnL({
      revenue: 100,
      expenses: {},
      cashOnHand: 0,
      mrr: 33.33,
    });
    // 33.33 * 0.3 = 9.999 → 10; 33.33 * 0.7 = 23.331 → 23.33
    expect(report.revenue.creditSales).toBe(10);
    expect(report.revenue.planSubscriptions).toBe(23.33);
  });
});

describe("generatePnL — return-shape guards", () => {
  it("returns exactly the top-level keys declared on PnLReport", () => {
    const report = generatePnL(baseArgs);
    expect(Object.keys(report).sort()).toEqual(
      [
        "burnRate",
        "expenses",
        "grossMargin",
        "grossProfit",
        "netIncome",
        "period",
        "revenue",
        "runway",
      ].sort(),
    );
  });

  it("returns exactly 4 revenue sub-keys and 6 expense sub-keys", () => {
    const report = generatePnL(baseArgs);
    expect(Object.keys(report.revenue).sort()).toEqual(
      ["creditSales", "mrr", "planSubscriptions", "total"].sort(),
    );
    expect(Object.keys(report.expenses).sort()).toEqual(
      ["aiApiCosts", "hosting", "legal", "marketing", "other", "total"].sort(),
    );
  });
});
