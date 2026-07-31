import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_BIRD_DEADLINE,
  GROWTH_EARLY_BIRD_DEADLINE,
  GROWTH_STANDARD_PRICE,
  LEGACY_PLAN_MAP,
  LEGACY_PLANS,
  PLANS,
  buildPlansFromConfig,
  getPlan,
  getPlanPrice,
  isEarlyBird,
  isGrowthEarlyBird,
  type LegacyPlan,
} from "./plans";

describe("LEGACY_PLANS registry", () => {
  it("ships exactly 4 grandfathered plans in stable order", () => {
    expect(LEGACY_PLANS.map((p) => p.id)).toEqual([
      "free",
      "founding50",
      "growth",
      "growth_annual",
    ]);
  });

  it("free plan is A$0 with 'free' cadence and mentions the 2 free credits hook", () => {
    const free = LEGACY_PLANS.find((p) => p.id === "free")!;
    expect(free.price).toBe(0);
    expect(free.cadence).toBe("free");
    expect(free.features.some((f) => f.includes("2 free credits"))).toBe(true);
  });

  it("founding50 defaults to 500 cents / A$5 one-off with 100-credit bundle copy", () => {
    const founding = LEGACY_PLANS.find((p) => p.id === "founding50")!;
    expect(founding.price).toBe(500);
    expect(founding.cadence).toBe("once");
    expect(founding.features).toContain("100 credits included");
  });

  it("growth defaults to 9900 cents / A$99 monthly", () => {
    const growth = LEGACY_PLANS.find((p) => p.id === "growth")!;
    expect(growth.price).toBe(9900);
    expect(growth.cadence).toBe("monthly");
  });

  it("growth_annual defaults to 95000 cents / A$950 yearly", () => {
    const annual = LEGACY_PLANS.find((p) => p.id === "growth_annual")!;
    expect(annual.price).toBe(95000);
    expect(annual.cadence).toBe("yearly");
  });

  it("every plan carries a non-empty features array", () => {
    for (const plan of LEGACY_PLANS) {
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.features.every((f) => typeof f === "string" && f.length > 0)).toBe(true);
    }
  });

  it("every plan has a unique id", () => {
    const ids = LEGACY_PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cadence is one of the four documented values", () => {
    const allowed = new Set(["free", "monthly", "once", "yearly"]);
    for (const plan of LEGACY_PLANS) {
      expect(allowed.has(plan.cadence)).toBe(true);
    }
  });

  it("PLANS alias is the same reference as LEGACY_PLANS (grandfathered import path)", () => {
    expect(PLANS).toBe(LEGACY_PLANS);
  });
});

describe("LEGACY_PLAN_MAP", () => {
  it("maps founding50 → founder_starter monthly", () => {
    expect(LEGACY_PLAN_MAP.founding50).toEqual({ id: "founder_starter", interval: "monthly" });
  });

  it("maps growth → founder_growth monthly", () => {
    expect(LEGACY_PLAN_MAP.growth).toEqual({ id: "founder_growth", interval: "monthly" });
  });

  it("maps growth_annual → founder_growth yearly", () => {
    expect(LEGACY_PLAN_MAP.growth_annual).toEqual({ id: "founder_growth", interval: "yearly" });
  });

  it("covers exactly the 3 grandfathered paid legacy ids (free is untouched)", () => {
    expect(Object.keys(LEGACY_PLAN_MAP).sort()).toEqual(["founding50", "growth", "growth_annual"]);
  });

  it("free is deliberately not remapped — starter path is direct", () => {
    expect(LEGACY_PLAN_MAP.free).toBeUndefined();
  });
});

describe("getPlan", () => {
  it("finds a plan by id in the default registry", () => {
    const plan = getPlan("growth");
    expect(plan?.id).toBe("growth");
  });

  it("returns undefined for an unknown id", () => {
    expect(getPlan("does-not-exist")).toBeUndefined();
  });

  it("uses the supplied plans array when passed", () => {
    const custom: LegacyPlan[] = [
      { id: "solo", name: "Solo", price: 111, cadence: "monthly", features: ["a"] },
    ];
    expect(getPlan("solo", custom)?.name).toBe("Solo");
    expect(getPlan("growth", custom)).toBeUndefined();
  });

  it("blank id returns undefined (does not accidentally match empty-string plan)", () => {
    expect(getPlan("")).toBeUndefined();
  });
});

describe("buildPlansFromConfig", () => {
  const cfg = {
    founding_plan_name: "Founder — cohort 3",
    founding_price_cents: 700,
    founding_credits: 150,
    growth_price_monthly_cents: 19900,
    growth_price_yearly_cents: 190000,
  };

  it("overrides founding50 name + price + credits copy", () => {
    const plans = buildPlansFromConfig(cfg);
    const founding = plans.find((p) => p.id === "founding50")!;
    expect(founding.name).toBe("Founder — cohort 3");
    expect(founding.price).toBe(700);
    expect(founding.features).toContain("150 credits included");
  });

  it("overrides growth monthly price", () => {
    expect(buildPlansFromConfig(cfg).find((p) => p.id === "growth")!.price).toBe(19900);
  });

  it("overrides growth_annual yearly price", () => {
    expect(buildPlansFromConfig(cfg).find((p) => p.id === "growth_annual")!.price).toBe(190000);
  });

  it("leaves the free plan untouched (still 0, still 'free')", () => {
    const free = buildPlansFromConfig(cfg).find((p) => p.id === "free")!;
    expect(free.price).toBe(0);
    expect(free.cadence).toBe("free");
  });

  it("does not mutate LEGACY_PLANS in place", () => {
    const before = JSON.stringify(LEGACY_PLANS);
    buildPlansFromConfig(cfg);
    expect(JSON.stringify(LEGACY_PLANS)).toBe(before);
  });

  it("returned array has the same length + order as LEGACY_PLANS", () => {
    const plans = buildPlansFromConfig(cfg);
    expect(plans.length).toBe(LEGACY_PLANS.length);
    expect(plans.map((p) => p.id)).toEqual(LEGACY_PLANS.map((p) => p.id));
  });
});

describe("getPlanPrice", () => {
  it("returns null for an unknown plan id", () => {
    expect(getPlanPrice("nope")).toBeNull();
  });

  it("original + discounted match when no discount is supplied", () => {
    const price = getPlanPrice("growth")!;
    expect(price.original).toBe(9900);
    expect(price.discounted).toBe(9900);
  });

  it("null discount is treated as 0", () => {
    expect(getPlanPrice("growth", null)!.discounted).toBe(9900);
  });

  it("undefined discount is treated as 0", () => {
    expect(getPlanPrice("growth", undefined)!.discounted).toBe(9900);
  });

  it("applies a 10% discount and rounds to the nearest cent", () => {
    const price = getPlanPrice("growth", 10)!;
    expect(price.original).toBe(9900);
    expect(price.discounted).toBe(8910);
  });

  it("100% discount zeroes the price (boundary)", () => {
    expect(getPlanPrice("growth", 100)!.discounted).toBe(0);
  });

  it("clamps a >100 discount to 100 (no negative prices)", () => {
    expect(getPlanPrice("growth", 200)!.discounted).toBe(0);
  });

  it("clamps a negative discount to 0 (no free-money upsell)", () => {
    expect(getPlanPrice("growth", -25)!.discounted).toBe(9900);
  });

  it("supports a custom plans array", () => {
    const custom: LegacyPlan[] = [
      { id: "solo", name: "Solo", price: 1000, cadence: "monthly", features: [] },
    ];
    expect(getPlanPrice("solo", 50, custom)).toEqual({ original: 1000, discounted: 500 });
  });

  it("free plan renders as 0/0 at any discount", () => {
    const price = getPlanPrice("free", 25)!;
    expect(price.original).toBe(0);
    expect(price.discounted).toBe(0);
  });

  it("founding50 20% off rounds — 500 → 400", () => {
    const price = getPlanPrice("founding50", 20)!;
    expect(price.original).toBe(500);
    expect(price.discounted).toBe(400);
  });
});

describe("Early-bird deadlines", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("EARLY_BIRD_DEADLINE is 2026-08-01 AEST midnight (locked to prevent silent drift)", () => {
    expect(EARLY_BIRD_DEADLINE.toISOString()).toBe("2026-07-31T14:00:00.000Z");
  });

  it("GROWTH_EARLY_BIRD_DEADLINE lands on the same 2026-08-01 AEST midnight", () => {
    expect(GROWTH_EARLY_BIRD_DEADLINE.toISOString()).toBe("2026-07-31T14:00:00.000Z");
  });

  it("GROWTH_STANDARD_PRICE is A$499/mo (49900 cents) — post-deadline sticker", () => {
    expect(GROWTH_STANDARD_PRICE).toBe(49900);
  });

  it("isEarlyBird() true well before the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    expect(isEarlyBird()).toBe(true);
  });

  it("isEarlyBird() false at or past the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(EARLY_BIRD_DEADLINE);
    expect(isEarlyBird()).toBe(false);
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    expect(isEarlyBird()).toBe(false);
  });

  it("isGrowthEarlyBird() true before the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    expect(isGrowthEarlyBird()).toBe(true);
  });

  it("isGrowthEarlyBird() false after the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
    expect(isGrowthEarlyBird()).toBe(false);
  });
});

describe("frozen public shape", () => {
  it("LegacyPlan interface — a fresh construction round-trips through getPlan", () => {
    const custom: LegacyPlan[] = [
      { id: "x", name: "X", price: 1, cadence: "once", features: ["only"] },
    ];
    const found = getPlan("x", custom)!;
    expect(found).toEqual({ id: "x", name: "X", price: 1, cadence: "once", features: ["only"] });
  });

  it("founding50 default feature list contains the priority + support hook", () => {
    const founding = LEGACY_PLANS.find((p) => p.id === "founding50")!;
    expect(founding.features).toContain("Priority support");
    expect(founding.features).toContain("Co-founder matching");
  });

  it("growth default features contain the multi-entity + data-room hook", () => {
    const growth = LEGACY_PLANS.find((p) => p.id === "growth")!;
    expect(growth.features).toContain("Multi-entity cap table");
    expect(growth.features).toContain("Investor data room");
  });
});
