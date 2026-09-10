import { describe, expect, it } from "vitest";

import {
  EVALUATOR_PRICING_HREF,
  EVALUATOR_SIGNUP_HREF,
  primaryCtaHrefForSlug,
} from "./solutions-shared";

describe("primaryCtaHrefForSlug", () => {
  it("sends the two founder personas at the product, not a price", () => {
    // The first run is free and asks for nothing, so a first-time visitor
    // should meet the analysis before a plan card.
    expect(primaryCtaHrefForSlug("founder")).toBe("/svi");
    expect(primaryCtaHrefForSlug("vn-sme")).toBe("/svi");
  });

  it("sends each evaluator persona to the evaluator signup with its rung pre-selected (G12 D2)", () => {
    expect(primaryCtaHrefForSlug("investor")).toBe(
      "/signup?segment=evaluator&plan=investor_angel",
    );
    expect(primaryCtaHrefForSlug("advisor")).toBe(
      "/signup?segment=evaluator&plan=investor_advisor",
    );
    expect(primaryCtaHrefForSlug("accelerator")).toBe(
      "/signup?segment=evaluator&plan=investor_vc_small",
    );
  });

  it("the signup map and the switch agree", () => {
    for (const slug of ["investor", "advisor", "accelerator"] as const) {
      expect(primaryCtaHrefForSlug(slug)).toBe(EVALUATOR_SIGNUP_HREF[slug]);
    }
  });

  it("the evaluator pricing view is the segment query, not a retired tab", () => {
    expect(EVALUATOR_PRICING_HREF).toBe("/pricing?segment=evaluator");
  });

  it("never deep-links a retired tier", () => {
    // `#tier-pro` was the A$299 Pro card, retired 2026-09-08. Three of the
    // four personas pointed at it and landed on a hidden alias.
    const targets = (
      ["founder", "vn-sme", "investor", "advisor", "accelerator"] as const
    ).map(primaryCtaHrefForSlug);
    expect(targets.join(" ")).not.toContain("#tier-pro");
  });
});
