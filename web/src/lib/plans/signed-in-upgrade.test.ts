import { describe, expect, it } from "vitest";
import { signedInSignupRedirect } from "./signed-in-upgrade";

describe("signedInSignupRedirect (S31-B)", () => {
  // G25-D: a priced plan lands on the review step, never on an auto-checkout.
  it("carries a priced founder plan to the review step (no auto-checkout)", () => {
    expect(signedInSignupRedirect("founder_starter")).toBe("/checkout/review?plan=founder_starter&trial=1&entry=signup");
    expect(signedInSignupRedirect("founder_growth")).toBe("/checkout/review?plan=founder_growth&trial=1&entry=signup");
  });

  it("carries an evaluator plan too, with the entry surface when given", () => {
    expect(signedInSignupRedirect("investor_angel")).toBe("/checkout/review?plan=investor_angel&trial=1&entry=signup");
    expect(signedInSignupRedirect("investor_angel", undefined, "onboarding")).toBe("/checkout/review?plan=investor_angel&trial=1&entry=onboarding");
  });

  it("drops free, custom-priced, unknown and missing plans", () => {
    expect(signedInSignupRedirect("founder_free")).toBe("/workspace/billing");
    expect(signedInSignupRedirect("founder_enterprise")).toBe("/workspace/billing");
    expect(signedInSignupRedirect("founding50")).toBe("/workspace/billing");
    expect(signedInSignupRedirect("<script>")).toBe("/workspace/billing");
    expect(signedInSignupRedirect(undefined)).toBe("/workspace/billing");
  });

  it("takes the first value of a repeated query param", () => {
    expect(signedInSignupRedirect(["founder_growth", "founder_starter"])).toBe(
      "/checkout/review?plan=founder_growth&trial=1&entry=signup",
    );
  });

  // 2026-09-16 audit: the pricing card's Annual toggle must survive the
  // signed-in bounce so Billing bills the cadence the card showed.
  it("carries interval=annual to the review; anything else stays monthly (no param)", () => {
    expect(signedInSignupRedirect("investor_angel", "annual")).toBe(
      "/checkout/review?plan=investor_angel&trial=1&entry=signup&interval=annual",
    );
    expect(signedInSignupRedirect("investor_angel", "monthly")).toBe("/checkout/review?plan=investor_angel&trial=1&entry=signup");
    expect(signedInSignupRedirect("investor_angel", undefined)).toBe("/checkout/review?plan=investor_angel&trial=1&entry=signup");
    expect(signedInSignupRedirect("nope", "annual")).toBe("/workspace/billing");
  });
});
