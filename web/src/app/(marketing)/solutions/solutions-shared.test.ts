import { describe, expect, it } from "vitest";

import { primaryCtaHrefForSlug } from "./solutions-shared";

describe("primaryCtaHrefForSlug", () => {
  it("sends the three self-serve personas at the product, not a price", () => {
    // The first run is free and asks for nothing, so a first-time visitor
    // should meet the analysis before a plan card.
    expect(primaryCtaHrefForSlug("founder")).toBe("/svi");
    expect(primaryCtaHrefForSlug("vn-sme")).toBe("/svi");
    expect(primaryCtaHrefForSlug("investor")).toBe("/svi");
  });

  it("sends a programme to contact-sales, because that price is a conversation", () => {
    expect(primaryCtaHrefForSlug("accelerator")).toBe("/pricing#contact-sales");
  });

  it("never deep-links a retired tier", () => {
    // `#tier-pro` was the A$299 Pro card, retired 2026-09-08. Three of the
    // four personas pointed at it and landed on a hidden alias.
    const targets = (["founder", "vn-sme", "investor", "accelerator"] as const).map(
      primaryCtaHrefForSlug,
    );
    expect(targets.join(" ")).not.toContain("#tier-pro");
  });
});
