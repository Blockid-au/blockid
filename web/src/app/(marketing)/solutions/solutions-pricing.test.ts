import { describe, expect, it } from "vitest";

import {
  SOLUTION_PRICE_TOKENS,
  fillPrices,
} from "./solutions-pricing";
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
