// Colocated vitest for TrialBanner copy (T0269, G12 §3c-3 "TrialBanner copy
// for evaluators"). The banner reads the trialing plan id from
// /api/stripe/trial-status and prices it from PLANS_V2; evaluator rungs
// (investor_angel / investor_advisor / investor_vc_small) must name the
// public plan (Scout / Firm / Program) and its price, founder plans keep the
// original wording. Pure-function test — no DOM needed.

import { describe, expect, it } from "vitest";
import { buildTrialBannerMessage } from "./trial-banner";

describe("buildTrialBannerMessage — evaluator plans", () => {
  it.each([
    ["investor_angel", "Scout", 79],
    ["investor_advisor", "Firm", 149],
    ["investor_vc_small", "Program", 349],
  ])("%s → names %s and A$%s", (planId, label, price) => {
    const msg = buildTrialBannerMessage({ daysLeft: 4, planId, endDate: "Fri, Sep 18" });
    expect(msg).toBe(
      `4 days left in your free ${label} trial. Card will be charged A$${price} for ${label} on Fri, Sep 18.`,
    );
  });

  it("names the plan even when the price is unknown", () => {
    const msg = buildTrialBannerMessage({
      daysLeft: 2,
      planId: "investor_angel",
      endDate: "Fri, Sep 18",
      monthlyPrice: null,
    });
    expect(msg).toBe("2 days left in your free Scout trial. Your Scout subscription will begin on Fri, Sep 18.");
  });
});

describe("buildTrialBannerMessage — founder plans (unchanged wording)", () => {
  it("founder_starter reads as before with the PLANS_V2 price", () => {
    const msg = buildTrialBannerMessage({ daysLeft: 1, planId: "founder_starter", endDate: "Mon, Sep 21" });
    expect(msg).toBe("1 day left in your free trial. Card will be charged A$29 on Mon, Sep 21.");
  });

  it("unknown plan → subscription-will-begin fallback", () => {
    const msg = buildTrialBannerMessage({ daysLeft: 3, planId: "mystery", endDate: "Mon, Sep 21" });
    expect(msg).toBe("3 days left in your free trial. Your subscription will begin on Mon, Sep 21.");
  });

  it("null plan → no price, no plan name", () => {
    const msg = buildTrialBannerMessage({ daysLeft: 5, planId: null, endDate: "the end of your trial" });
    expect(msg).toBe(
      "5 days left in your free trial. Your subscription will begin on the end of your trial.",
    );
  });
});
