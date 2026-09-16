import { describe, expect, it } from "vitest";
import { signedInSignupRedirect } from "./signed-in-upgrade";

describe("signedInSignupRedirect (S31-B)", () => {
  it("carries a priced founder plan to billing so checkout starts", () => {
    expect(signedInSignupRedirect("founder_starter")).toBe("/workspace/billing?plan=founder_starter");
    expect(signedInSignupRedirect("founder_growth")).toBe("/workspace/billing?plan=founder_growth");
  });

  it("carries an evaluator plan too", () => {
    expect(signedInSignupRedirect("investor_angel")).toBe("/workspace/billing?plan=investor_angel");
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
      "/workspace/billing?plan=founder_growth",
    );
  });

  // 2026-09-16 audit: the pricing card's Annual toggle must survive the
  // signed-in bounce so Billing bills the cadence the card showed.
  it("carries interval=annual to Billing; anything else stays monthly (no param)", () => {
    expect(signedInSignupRedirect("investor_angel", "annual")).toBe(
      "/workspace/billing?plan=investor_angel&interval=annual",
    );
    expect(signedInSignupRedirect("investor_angel", "monthly")).toBe("/workspace/billing?plan=investor_angel");
    expect(signedInSignupRedirect("investor_angel", undefined)).toBe("/workspace/billing?plan=investor_angel");
    expect(signedInSignupRedirect("nope", "annual")).toBe("/workspace/billing");
  });
});
