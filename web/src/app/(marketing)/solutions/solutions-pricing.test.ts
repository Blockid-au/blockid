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
    // A$5.50 Trust Report and the A$149 advisor pack were both advertised on
    // these pages and neither has ever been sold through them.
    expect(printed).not.toContain("5.50");
    expect(printed).not.toContain("149");
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
