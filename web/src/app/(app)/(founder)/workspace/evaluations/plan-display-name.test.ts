// Design check 2026-09-21: the plan-limit banner printed the raw plan id
// humanised ("Investor Vc Small plan") — messaging.md § 11 says the tiers are
// Scout / Firm / Program and never "VC Small". The banner renders the sold name.
import { describe, expect, it } from "vitest";
import { planDisplayName } from "./evaluations-client";

describe("planDisplayName", () => {
  it("maps sold plan ids to their public names", () => {
    expect(planDisplayName("investor_vc_small")).toBe("Program");
    expect(planDisplayName("investor_angel")).toBe("Scout");
    expect(planDisplayName("investor_advisor")).toBe("Firm");
  });
  it("never yields the retired 'VC Small' wording", () => {
    expect(planDisplayName("investor_vc_small").toLowerCase()).not.toContain("vc small");
  });
  it("falls back to the humanised id for unknown plans", () => {
    expect(planDisplayName("some_new_plan")).toBe("some new plan");
  });
});
