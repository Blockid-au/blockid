import { describe, it, expect } from "vitest";
import { PROMO_TIER_LADDER, codesForPrefix } from "./canonical-codes";

describe("PROMO_TIER_LADDER", () => {
  it("is the frozen [0,10,20,30,40] ladder", () => {
    expect(PROMO_TIER_LADDER).toEqual([0, 10, 20, 30, 40]);
  });
});

describe("codesForPrefix", () => {
  it("emits bare prefix for tier 0 and prefix+pct for tiers > 0", () => {
    expect(codesForPrefix("IFV")).toEqual([
      { tier: 0, code: "IFV" },
      { tier: 10, code: "IFV10" },
      { tier: 20, code: "IFV20" },
      { tier: 30, code: "IFV30" },
      { tier: 40, code: "IFV40" },
    ]);
  });

  it("normalises prefix to uppercase alphanumeric", () => {
    expect(codesForPrefix("dvl")[0]).toEqual({ tier: 0, code: "DVL" });
    expect(codesForPrefix(" ifv-x ")[0]).toEqual({ tier: 0, code: "IFVX" });
  });

  it("throws on empty / non-alphanumeric prefix", () => {
    expect(() => codesForPrefix("")).toThrow();
    expect(() => codesForPrefix("---")).toThrow();
  });
});
