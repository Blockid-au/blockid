import { describe, expect, it } from "vitest";
import {
  FOUNDING_PROMO_END,
  isFoundingPromoActive,
  standardMonthlyPriceCents,
} from "./founding-promo";

describe("FOUNDING_PROMO_END", () => {
  it("is pinned to 2026-09-01T00:00:00Z (end of AU Aug 31 promo window)", () => {
    expect(FOUNDING_PROMO_END.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("isFoundingPromoActive()", () => {
  it("returns true one second before the cutover", () => {
    const t = new Date("2026-08-31T23:59:59Z");
    expect(isFoundingPromoActive(t)).toBe(true);
  });

  it("returns false at the exact cutover instant", () => {
    expect(isFoundingPromoActive(FOUNDING_PROMO_END)).toBe(false);
  });

  it("returns false one hour after the cutover", () => {
    const t = new Date("2026-09-01T01:00:00Z");
    expect(isFoundingPromoActive(t)).toBe(false);
  });

  it("returns true for a date well before the cutover (2026-08-07)", () => {
    const t = new Date("2026-08-07T00:00:00Z");
    expect(isFoundingPromoActive(t)).toBe(true);
  });
});

describe("standardMonthlyPriceCents()", () => {
  it("returns 9900 (A$99/mo — the post-promo Growth headline price)", () => {
    expect(standardMonthlyPriceCents()).toBe(9900);
  });
});
