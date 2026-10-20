import { describe, expect, it } from "vitest";

import {
  SOLUTION_PRICE_TOKENS,
  fillPrices,
  solutionPriceTokens,
} from "./solutions-pricing";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { FREE_SUMMARY_PAGE_COUNT } from "@/lib/analyses/free-summary";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { EQUITY_ADDON_MONTHLY_AUD } from "@/lib/plans-v2";

describe("SOLUTION_PRICE_TOKENS", () => {
  it("takes the report price from the SKU, not from a literal", () => {
    const cents = ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents ?? 0;
    expect(SOLUTION_PRICE_TOKENS.reportPrice).toBe(`A$${cents / 100}`);
  });

  it("takes the two subscription prices from the generated catalogue", () => {
    expect(SOLUTION_PRICE_TOKENS.founderPrice).toBe(
      `A$${GENERATED_PLANS_BY_ID.founder_starter.price_aud_cents / 100}`,
    );
    expect(SOLUTION_PRICE_TOKENS.growthPrice).toBe(
      `A$${GENERATED_PLANS_BY_ID.founder_growth.price_aud_cents / 100}`,
    );
  });

  it("takes the credit grants from the same catalogue rows", () => {
    expect(SOLUTION_PRICE_TOKENS.founderCredits).toBe(
      String(GENERATED_PLANS_BY_ID.founder_starter.usage_limits.monthly_credits),
    );
    expect(SOLUTION_PRICE_TOKENS.growthCredits).toBe(
      String(GENERATED_PLANS_BY_ID.founder_growth.usage_limits.monthly_credits),
    );
  });

  it("takes the free page count from the summary definition", () => {
    expect(SOLUTION_PRICE_TOKENS.freePages).toBe(String(FREE_SUMMARY_PAGE_COUNT));
  });

  it("takes the equity add-on from the marketing catalogue", () => {
    expect(SOLUTION_PRICE_TOKENS.equityAddon).toBe(
      `A$${EQUITY_ADDON_MONTHLY_AUD}`,
    );
  });

  it("never carries a retired amount", () => {
    const printed = Object.values(SOLUTION_PRICE_TOKENS).join(" ");
    // The A$5.50 Trust Report was advertised on these pages and never sold;
    // A$3 is the one report price now (G12 D3).
    expect(printed).not.toContain("5.50");
  });

  it("takes the evaluator ladder (Scout / Firm / Program) from the plan rows, not literals", () => {
    // G12 D2 (2026-09-10): the three public evaluator rungs re-use the
    // investor_angel / investor_advisor / investor_vc_small rows.
    const angel = GENERATED_PLANS_BY_ID.investor_angel;
    const advisor = GENERATED_PLANS_BY_ID.investor_advisor;
    const vc = GENERATED_PLANS_BY_ID.investor_vc_small;
    expect(SOLUTION_PRICE_TOKENS.scoutPrice).toBe(`A$${angel.price_aud_cents / 100}`);
    expect(SOLUTION_PRICE_TOKENS.firmPrice).toBe(`A$${advisor.price_aud_cents / 100}`);
    expect(SOLUTION_PRICE_TOKENS.programPrice).toBe(`A$${vc.price_aud_cents / 100}`);
    expect(SOLUTION_PRICE_TOKENS.scoutReports).toBe(String(angel.usage_limits.reports_per_month));
    expect(SOLUTION_PRICE_TOKENS.firmReports).toBe(String(advisor.usage_limits.reports_per_month));
    expect(SOLUTION_PRICE_TOKENS.programReports).toBe(String(vc.usage_limits.reports_per_month));
    expect(SOLUTION_PRICE_TOKENS.scoutStartups).toBe(String(angel.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.firmStartups).toBe(String(advisor.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.programStartups).toBe(String(vc.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.firmSeats).toBe(String(advisor.usage_limits.seats));
    expect(SOLUTION_PRICE_TOKENS.programSeats).toBe(String(vc.usage_limits.seats));
  });

  it("evaluator ladder matches the founder-approved numbers (Scout A$79 · Firm A$149 · Program A$349)", () => {
    // Founder decision D2 2026-09-10. If plans.csv moves, this is the test
    // that says the marketing copy moved with it — and that the doc needs
    // a decision, not just a re-run.
    expect(SOLUTION_PRICE_TOKENS.scoutPrice).toBe("A$79");
    expect(SOLUTION_PRICE_TOKENS.firmPrice).toBe("A$149");
    expect(SOLUTION_PRICE_TOKENS.programPrice).toBe("A$349");
    expect(SOLUTION_PRICE_TOKENS.firmReports).toBe("30");
    expect(SOLUTION_PRICE_TOKENS.firmStartups).toBe("50");
    expect(SOLUTION_PRICE_TOKENS.firmSeats).toBe("3");
  });
});

describe("Pricing v4 tokens — Fund + Programs ladder", () => {
  it("takes Fund and the Programs numbers from the plan rows, not literals", () => {
    const fund = GENERATED_PLANS_BY_ID.investor_fund;
    const intake = GENERATED_PLANS_BY_ID.accelerator_intake;
    const cohort = GENERATED_PLANS_BY_ID.accelerator_starter;
    expect(SOLUTION_PRICE_TOKENS.fundPrice).toBe(`A$${fund.price_aud_cents / 100}`);
    expect(SOLUTION_PRICE_TOKENS.fundSeats).toBe(String(fund.usage_limits.seats));
    expect(SOLUTION_PRICE_TOKENS.fundStartups).toBe(String(fund.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.intakePrice).toBe(`A$${intake.price_aud_cents / 100}`);
    expect(SOLUTION_PRICE_TOKENS.intakeReports).toBe(String(intake.usage_limits.reports_per_month));
    expect(SOLUTION_PRICE_TOKENS.intakeStartups).toBe(String(intake.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.intakeSeats).toBe(String(intake.usage_limits.seats));
    expect(SOLUTION_PRICE_TOKENS.cohortReports).toBe(String(cohort.usage_limits.reports_per_month));
    expect(SOLUTION_PRICE_TOKENS.cohortStartups).toBe(String(cohort.usage_limits.profiles));
    expect(SOLUTION_PRICE_TOKENS.cohortSeats).toBe(String(cohort.usage_limits.seats));
  });

  it("matches the founder-approved v4 figures (Fund A$999 · 10 seats · 500 startups; Intake A$249 / A$2,490; Cohort 25 A$5,000 a year)", () => {
    expect(SOLUTION_PRICE_TOKENS.fundPrice).toBe("A$999");
    expect(SOLUTION_PRICE_TOKENS.fundSeats).toBe("10");
    expect(SOLUTION_PRICE_TOKENS.fundStartups).toBe("500");
    expect(SOLUTION_PRICE_TOKENS.intakePrice).toBe("A$249");
    expect(SOLUTION_PRICE_TOKENS.intakeAnnualPrice).toBe("A$2,490");
    expect(SOLUTION_PRICE_TOKENS.intakeReports).toBe("40");
    expect(SOLUTION_PRICE_TOKENS.intakeStartups).toBe("60");
    expect(SOLUTION_PRICE_TOKENS.intakeSeats).toBe("3");
    expect(SOLUTION_PRICE_TOKENS.cohortAnnualPrice).toBe("A$5,000");
    expect(SOLUTION_PRICE_TOKENS.cohortReports).toBe("50");
    expect(SOLUTION_PRICE_TOKENS.cohortStartups).toBe("25");
    expect(SOLUTION_PRICE_TOKENS.cohortSeats).toBe("5");
  });
});

describe("fillPrices", () => {
  it("substitutes a known token", () => {
    expect(fillPrices("from {growthPrice} a month")).toBe(
      `from ${SOLUTION_PRICE_TOKENS.growthPrice} a month`,
    );
  });

  it("substitutes several tokens in one string", () => {
    expect(fillPrices("{founderPrice} then {growthPrice}")).toBe(
      `${SOLUTION_PRICE_TOKENS.founderPrice} then ${SOLUTION_PRICE_TOKENS.growthPrice}`,
    );
  });

  it("leaves an unknown token alone rather than blanking it", () => {
    // `/listings/{slug}` is a URL shape. Blanking it would change what the
    // sentence says, and a typo must stay visible instead of vanishing.
    expect(fillPrices("publish to /listings/{slug}")).toBe(
      "publish to /listings/{slug}",
    );
  });

  it("is a no-op on a string with no tokens", () => {
    expect(fillPrices("eight dimensions")).toBe("eight dimensions");
  });
});

// Pricing v5 P5 — the `{reportPrice}` token follows platform_config.payg_enabled.
describe("fillPrices(text, view, lang) — Pricing v5 P5", () => {
  const ALL_STRINGS = [...Object.values(en as Record<string, string>), ...Object.values(vi as Record<string, string>)].filter(
    (s) => s.includes("{reportPrice}"),
  );

  it("flag OFF: identical to the pre-v5 output for every catalogue string, in both languages", () => {
    expect(solutionPriceTokens(PAYG_OFF_VIEW)).toBe(SOLUTION_PRICE_TOKENS);
    expect(SOLUTION_PRICE_TOKENS.reportPrice).toBe("A$3");
    for (const s of ALL_STRINGS) {
      const legacy = s.replace(/\{reportPrice\}/g, SOLUTION_PRICE_TOKENS.reportPrice);
      expect(fillPrices(s, PAYG_OFF_VIEW, "en")).toBe(fillPrices(s));
      expect(fillPrices(s, PAYG_OFF_VIEW, "vi")).toBe(fillPrices(s));
      expect(fillPrices(s)).toContain(SOLUTION_PRICE_TOKENS.reportPrice);
      expect(legacy).not.toContain("{reportPrice}");
    }
  });

  it("flag ON: {reportPrice} = 'from A$19' (EN) / 'từ A$19' (VI)", () => {
    expect(fillPrices("{reportPrice} a report", PAYG_ON_VIEW)).toBe("from A$19 a report");
    expect(fillPrices("{reportPrice} mỗi báo cáo", PAYG_ON_VIEW, "vi")).toBe("từ A$19 mỗi báo cáo");
    expect(solutionPriceTokens(PAYG_ON_VIEW).fullReportPrice).toBe("A$49");
  });

  it("flag ON: reads as English and never quotes the full report at the Snapshot price", () => {
    expect(fillPrices("a guest checkout at {reportPrice} per report", PAYG_ON_VIEW)).toBe("a guest checkout from A$19 per report");
    expect(fillPrices("What do I get for {reportPrice}?", PAYG_ON_VIEW)).toBe("What do I get for A$49?");
    expect(fillPrices("The first run is free; the full report is {reportPrice}.", PAYG_ON_VIEW)).toBe(
      "The first run is free; the full report is A$49.",
    );
    expect(fillPrices("{reportPrice} for a full Trusted Business Report", PAYG_ON_VIEW)).toBe("A$49 for a full Trusted Business Report");
    expect(fillPrices("Tôi nhận được gì với {reportPrice}?", PAYG_ON_VIEW, "vi")).toBe("Tôi nhận được gì với A$49?");
    expect(fillPrices("là thanh toán khách với {reportPrice} mỗi báo cáo", PAYG_ON_VIEW, "vi")).toBe("là thanh toán khách từ A$19 mỗi báo cáo");
  });

  it("flag ON: no catalogue string keeps a {reportPrice}, an 'at from' / 'for from', or an A$3 report price", () => {
    for (const s of ALL_STRINGS) {
      for (const lang of ["en", "vi"] as const) {
        const out = fillPrices(s, PAYG_ON_VIEW, lang);
        expect(out, s).not.toMatch(/\{(reportPrice|fullReportPrice)\}/);
        expect(out, s).not.toMatch(/\b(at|for) from\b/);
        expect(out, s).not.toMatch(/A\$3(?![\d,.])/);
      }
    }
  });
});
