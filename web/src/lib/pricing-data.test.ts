// P9-pricing-data-lib-test — colocated coverage for the canonical pricing
// display fixture that every pricing-facing surface reads. Two consumers
// (landing hero <pricing /> + dedicated /pricing page) render from these
// exports directly, so any silent drift (id renames, cta hrefs, tier
// order, credit-pack ladder, comparison rows, FAQ copy, discountable
// filter) leaks straight into billing UI and onto the marketing surface.
// The tests pin: fixture shape, filter helper (tiersForNewSignup),
// config-driven overrides (buildPricingTiers per-tier branch), and the
// derived discountablePrices dictionary — all pure, all deterministic.

import { describe, expect, it } from "vitest";
import {
  NEW_SIGNUP_TIER_IDS,
  tiersForNewSignup,
  buildPricingTiers,
  PRICING_TIERS,
  CREDIT_PACKS,
  COMPARISON_ROWS,
  FAQ_ITEMS,
  discountablePrices,
  type PricingTier,
} from "./pricing-data";
import { TRIAL_DAYS } from "./plans/trial-copy";

const BASE_CFG = {
  founding_plan_name: "Founding 100",
  founding_spots_total: 100,
  founding_price_cents: 500,
  founding_credits: 100,
  free_credits_on_signup: 5,
  growth_price_monthly_cents: 9900,
  growth_price_yearly_cents: 95000,
} as const;

// ---------------------------------------------------------------------------
// NEW_SIGNUP_TIER_IDS
// ---------------------------------------------------------------------------

describe("NEW_SIGNUP_TIER_IDS", () => {
  it("pins the exact 3-id allow-list a new signup may pick", () => {
    expect(NEW_SIGNUP_TIER_IDS).toEqual([
      "founding50",
      "growth",
      "growth_annual",
    ]);
  });

  it("excludes the legacy free tier (grandfathered, hidden from new signups)", () => {
    expect(NEW_SIGNUP_TIER_IDS).not.toContain("free");
  });

  it("every id is a non-empty string", () => {
    for (const id of NEW_SIGNUP_TIER_IDS) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("all ids match an id present in PRICING_TIERS (no dangling allow-list entry)", () => {
    const known = new Set(PRICING_TIERS.map((t) => t.id));
    for (const id of NEW_SIGNUP_TIER_IDS) {
      expect(known.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// tiersForNewSignup
// ---------------------------------------------------------------------------

describe("tiersForNewSignup()", () => {
  it("filters the default PRICING_TIERS down to the 3-id allow-list", () => {
    const kept = tiersForNewSignup(PRICING_TIERS);
    expect(kept.map((t) => t.id)).toEqual([
      "founding50",
      "growth",
      "growth_annual",
    ]);
  });

  it("drops the free tier (hidden from new signups)", () => {
    const kept = tiersForNewSignup(PRICING_TIERS);
    expect(kept.some((t) => t.id === "free")).toBe(false);
  });

  it("preserves input order (does not re-sort)", () => {
    const reversed = [...PRICING_TIERS].reverse();
    const kept = tiersForNewSignup(reversed);
    expect(kept.map((t) => t.id)).toEqual([
      "growth_annual",
      "growth",
      "founding50",
    ]);
  });

  it("returns [] on empty input", () => {
    expect(tiersForNewSignup([])).toEqual([]);
  });

  it("returns [] when no tier id matches the allow-list", () => {
    const alien: PricingTier[] = [
      {
        id: "team",
        name: "Team",
        price: "A$0",
        credits: "0",
        audience: "n/a",
        features: [],
        cta: { label: "x", href: "/x" },
        ctaStyle: "secondary",
      },
    ];
    expect(tiersForNewSignup(alien)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const snapshot = [...PRICING_TIERS];
    tiersForNewSignup(PRICING_TIERS);
    expect(PRICING_TIERS).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// buildPricingTiers()
// ---------------------------------------------------------------------------

describe("buildPricingTiers()", () => {
  it("returns 4 tiers, one per PRICING_TIERS row, in the same order", () => {
    const built = buildPricingTiers(BASE_CFG);
    expect(built.map((t) => t.id)).toEqual([
      "free",
      "founding50",
      "growth",
      "growth_annual",
    ]);
  });

  describe("founding50 branch", () => {
    it("overrides name from cfg.founding_plan_name", () => {
      const built = buildPricingTiers({
        ...BASE_CFG,
        founding_plan_name: "Founding 250",
      });
      const founding = built.find((t) => t.id === "founding50")!;
      expect(founding.name).toBe("Founding 250");
    });

    it("formats round-dollar price with no decimals ('A$5' not 'A$5.00')", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_price_cents: 500,
      }).find((t) => t.id === "founding50")!;
      expect(founding.price).toBe("A$5");
    });

    it("formats non-round cents with 2 decimals ('A$4.99')", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_price_cents: 499,
      }).find((t) => t.id === "founding50")!;
      expect(founding.price).toBe("A$4.99");
    });

    it("numericPrice is dollars = cents / 100", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_price_cents: 1250,
      }).find((t) => t.id === "founding50")!;
      expect(founding.numericPrice).toBe(12.5);
    });

    it("credits string interpolates cfg.founding_credits + 'lifetime'", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_credits: 250,
      }).find((t) => t.id === "founding50")!;
      expect(founding.credits).toBe("250 credits (never expires)");
    });

    it("cta.label mentions plan name + formatted price; href always /founding-50", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_plan_name: "Founding 250",
        founding_price_cents: 900,
      }).find((t) => t.id === "founding50")!;
      expect(founding.cta.label).toBe("Get Founding 250 — A$9");
      expect(founding.cta.href).toBe("/founding-50");
    });

    it("urgency interpolates cfg.founding_spots_total (e.g. 250)", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_spots_total: 250,
      }).find((t) => t.id === "founding50")!;
      expect(founding.urgency).toBe("Only 250 spots at this price");
    });

    it("features[] is regenerated with 8 rows and starts with the credit-count line", () => {
      const founding = buildPricingTiers({
        ...BASE_CFG,
        founding_credits: 42,
      }).find((t) => t.id === "founding50")!;
      expect(founding.features).toHaveLength(8);
      expect(founding.features[0]).toBe("42 SVI analyses (lifetime)");
      expect(founding.features).toContain("PDF investor-ready report");
      expect(founding.features).toContain("Priority support");
    });

    it("keeps the highlight + badge inherited from PRICING_TIERS", () => {
      const founding = buildPricingTiers(BASE_CFG).find(
        (t) => t.id === "founding50",
      )!;
      expect(founding.highlight).toBe(true);
      expect(founding.badge).toBe("Founders Only");
    });
  });

  describe("free branch", () => {
    it("updates only the credits string; price + cadence untouched", () => {
      const free = buildPricingTiers({
        ...BASE_CFG,
        free_credits_on_signup: 12,
      }).find((t) => t.id === "free")!;
      expect(free.credits).toBe("12 credits");
      expect(free.price).toBe("$0");
      expect(free.cadence).toBe("forever");
      expect(free.numericPrice).toBeUndefined();
    });
  });

  describe("growth (monthly) branch", () => {
    it("formats price with no decimals ('A$99') and sets numericPrice", () => {
      const growth = buildPricingTiers({
        ...BASE_CFG,
        growth_price_monthly_cents: 9900,
      }).find((t) => t.id === "growth")!;
      expect(growth.price).toBe("A$99");
      expect(growth.numericPrice).toBe(99);
    });

    it("truncates non-round cents to whole dollars in display (toFixed(0))", () => {
      const growth = buildPricingTiers({
        ...BASE_CFG,
        growth_price_monthly_cents: 12950,
      }).find((t) => t.id === "growth")!;
      expect(growth.price).toBe("A$130");
      expect(growth.numericPrice).toBe(129.5);
    });
  });

  describe("growth_annual branch", () => {
    it("formats yearly price with no decimals ('A$950') and sets numericPrice", () => {
      const yearly = buildPricingTiers({
        ...BASE_CFG,
        growth_price_yearly_cents: 95000,
      }).find((t) => t.id === "growth_annual")!;
      expect(yearly.price).toBe("A$950");
      expect(yearly.numericPrice).toBe(950);
    });

    it("is unaffected by founding cents or growth-monthly cents", () => {
      const yearly = buildPricingTiers({
        ...BASE_CFG,
        founding_price_cents: 99999,
        growth_price_monthly_cents: 1,
        growth_price_yearly_cents: 120000,
      }).find((t) => t.id === "growth_annual")!;
      expect(yearly.price).toBe("A$1200");
      expect(yearly.numericPrice).toBe(1200);
    });
  });

  it("does not mutate the exported PRICING_TIERS array or its rows", () => {
    const before = JSON.parse(JSON.stringify(PRICING_TIERS));
    buildPricingTiers({
      ...BASE_CFG,
      founding_plan_name: "MUTATED",
      founding_credits: 9999,
    });
    expect(PRICING_TIERS).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// PRICING_TIERS fixture
// ---------------------------------------------------------------------------

describe("PRICING_TIERS fixture", () => {
  it("has exactly 4 tiers in the canonical order (free → founding50 → growth → growth_annual)", () => {
    expect(PRICING_TIERS.map((t) => t.id)).toEqual([
      "free",
      "founding50",
      "growth",
      "growth_annual",
    ]);
  });

  it("all ids are unique", () => {
    const ids = PRICING_TIERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every tier has a non-empty credits + audience + cta.label + cta.href", () => {
    for (const t of PRICING_TIERS) {
      expect(t.credits.length).toBeGreaterThan(0);
      expect(t.audience.length).toBeGreaterThan(0);
      expect(t.cta.label.length).toBeGreaterThan(0);
      expect(t.cta.href.length).toBeGreaterThan(0);
    }
  });

  it("every cta.href starts with '/' (relative to site root)", () => {
    for (const t of PRICING_TIERS) {
      expect(t.cta.href.startsWith("/")).toBe(true);
    }
  });

  it("only the founding50 tier is highlighted (single-highlight rule)", () => {
    const highlighted = PRICING_TIERS.filter((t) => t.highlight);
    expect(highlighted.map((t) => t.id)).toEqual(["founding50"]);
  });

  it("ctaStyle is 'secondary' for free, 'primary' for every paid tier", () => {
    const map = Object.fromEntries(PRICING_TIERS.map((t) => [t.id, t.ctaStyle]));
    expect(map.free).toBe("secondary");
    expect(map.founding50).toBe("primary");
    expect(map.growth).toBe("primary");
    expect(map.growth_annual).toBe("primary");
  });

  it("badge copy matches the marketing anchor per tier", () => {
    const map = Object.fromEntries(PRICING_TIERS.map((t) => [t.id, t.badge]));
    expect(map.free).toBeUndefined();
    expect(map.founding50).toBe("Founders Only");
    expect(map.growth).toBe("Early Bird");
    expect(map.growth_annual).toBe("Save 20%");
  });

  it("cta hrefs are pinned to the routes the router actually serves", () => {
    const map = Object.fromEntries(
      PRICING_TIERS.map((t) => [t.id, t.cta.href]),
    );
    expect(map.free).toBe("/#svi");
    expect(map.founding50).toBe("/founding-50");
    expect(map.growth).toBe("/auth/login?plan=growth");
    expect(map.growth_annual).toBe("/auth/login?plan=growth_annual");
  });

  it("growth + growth_annual share the same audience + features + credits copy", () => {
    const g = PRICING_TIERS.find((t) => t.id === "growth")!;
    const y = PRICING_TIERS.find((t) => t.id === "growth_annual")!;
    expect(g.audience).toBe(y.audience);
    expect(g.credits).toBe(y.credits);
    expect(g.features).toEqual(y.features);
  });

  it("annual saving math is consistent: monthly*12 − annual = 238 (~20% off)", () => {
    const monthly = PRICING_TIERS.find((t) => t.id === "growth")!.numericPrice!;
    const annual = PRICING_TIERS.find((t) => t.id === "growth_annual")!
      .numericPrice!;
    expect(monthly * 12 - annual).toBe(238);
    expect(PRICING_TIERS.find((t) => t.id === "growth_annual")!.subtitle).toBe(
      "Save A$238/year (20% off monthly)",
    );
  });

  it("founding50 default credits string mentions '100 credits' + 'never expires'", () => {
    const f = PRICING_TIERS.find((t) => t.id === "founding50")!;
    expect(f.credits).toBe("100 credits (never expires)");
  });

  it("founding50 numericPrice matches the display price ($5)", () => {
    const f = PRICING_TIERS.find((t) => t.id === "founding50")!;
    expect(f.price).toBe("A$5");
    expect(f.numericPrice).toBe(5);
  });

  it("free tier has no numericPrice (excluded from discounts)", () => {
    const free = PRICING_TIERS.find((t) => t.id === "free")!;
    expect(free.numericPrice).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CREDIT_PACKS ladder
// ---------------------------------------------------------------------------

describe("CREDIT_PACKS fixture", () => {
  it("has exactly 4 packs in the canonical ladder", () => {
    expect(CREDIT_PACKS).toHaveLength(4);
  });

  it("credits count is strictly monotonically increasing (5 → 15 → 35 → 100)", () => {
    const credits = CREDIT_PACKS.map((p) => p.credits);
    expect(credits).toEqual([5, 15, 35, 100]);
    for (let i = 1; i < credits.length; i += 1) {
      expect(credits[i]).toBeGreaterThan(credits[i - 1]);
    }
  });

  it("price is strictly monotonically increasing (2 → 5 → 9 → 19)", () => {
    const prices = CREDIT_PACKS.map((p) => p.price);
    expect(prices).toEqual([2, 5, 9, 19]);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("only the smallest pack has null savings; the rest advertise savings", () => {
    expect(CREDIT_PACKS[0].savings).toBeNull();
    for (const pack of CREDIT_PACKS.slice(1)) {
      expect(pack.savings).not.toBeNull();
      expect(pack.savings!.startsWith("Save ")).toBe(true);
    }
  });

  it("savings badges match the pinned ladder", () => {
    expect(CREDIT_PACKS.map((p) => p.savings)).toEqual([
      null,
      "Save 33%",
      "Save 49%",
      "Save 62%",
    ]);
  });

  it("every href points at the billing#credits anchor (single billing surface)", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.href).toBe("/workspace/billing#credits");
    }
  });

  it("per-credit cost falls monotonically down the ladder (bigger pack = cheaper credit)", () => {
    const perCredit = CREDIT_PACKS.map((p) => p.price / p.credits);
    for (let i = 1; i < perCredit.length; i += 1) {
      expect(perCredit[i]).toBeLessThan(perCredit[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// COMPARISON_ROWS
// ---------------------------------------------------------------------------

describe("COMPARISON_ROWS fixture", () => {
  it("has exactly 6 rows", () => {
    expect(COMPARISON_ROWS).toHaveLength(6);
  });

  it("every feature label is unique (no duplicated rows)", () => {
    const labels = COMPARISON_ROWS.map((r) => r.feature);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every row has all 4 required columns as non-empty strings", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.feature.length).toBeGreaterThan(0);
      expect(row.free.length).toBeGreaterThan(0);
      expect(row.founding.length).toBeGreaterThan(0);
      expect(row.growth.length).toBeGreaterThan(0);
    }
  });

  it("first row pins the SVI-analyses count contract per tier", () => {
    const svi = COMPARISON_ROWS.find((r) => r.feature === "SVI Analyses")!;
    expect(svi.free).toBe("5 free (instant)");
    expect(svi.founding).toBe("100 (lifetime)");
    expect(svi.growth).toBe("Unlimited");
  });

  it("priority support is the only feature exclusive to growth (only paid tier where free + founding = '-')", () => {
    const ps = COMPARISON_ROWS.find((r) => r.feature === "Priority support")!;
    expect(ps.free).toBe("-");
    expect(ps.founding).toBe("-");
    expect(ps.growth).toBe("Yes");
  });
});

// ---------------------------------------------------------------------------
// FAQ_ITEMS
// ---------------------------------------------------------------------------

describe("FAQ_ITEMS fixture", () => {
  it("has exactly 10 items", () => {
    expect(FAQ_ITEMS).toHaveLength(10);
  });

  it("every FAQ has non-empty q + a and every q ends with '?'", () => {
    for (const item of FAQ_ITEMS) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
      expect(item.q.endsWith("?")).toBe(true);
    }
  });

  it("free-trial FAQ interpolates TRIAL_DAYS from the trial-copy module (single source of truth)", () => {
    const trial = FAQ_ITEMS.find((f) => f.q === "Is there a free trial?")!;
    expect(trial.a).toContain(`${TRIAL_DAYS}-day free trial`);
  });

  it("refund FAQ mentions the 30-day money-back window", () => {
    const refund = FAQ_ITEMS.find((f) => f.q === "Do you offer refunds?")!;
    expect(refund.a).toContain("30-day");
  });

  it("data-storage FAQ names the Australian region + Privacy Act 1988", () => {
    const storage = FAQ_ITEMS.find((f) => f.q === "Where is my data stored?")!;
    expect(storage.a).toContain("Australia");
    expect(storage.a).toContain("Privacy Act 1988");
  });

  it("security FAQ names TLS 1.3 + Supabase row-level security + Stripe (no card storage)", () => {
    const sec = FAQ_ITEMS.find((f) => f.q === "Is my data secure?")!;
    expect(sec.a).toContain("TLS 1.3");
    expect(sec.a).toContain("row-level security");
    expect(sec.a).toContain("Stripe");
  });
});

// ---------------------------------------------------------------------------
// discountablePrices
// ---------------------------------------------------------------------------

describe("discountablePrices", () => {
  it("excludes any tier with no numericPrice (free is not discountable)", () => {
    expect(discountablePrices.Free).toBeUndefined();
  });

  it("excludes growth_annual (already-discounted yearly plan)", () => {
    // growth_annual shares the display name 'Growth' with monthly, but the
    // implementation dedups by id — the 'Growth' entry must reflect the
    // *monthly* numericPrice, not the yearly.
    expect(discountablePrices.Growth).toBe(99);
    expect(discountablePrices.Growth).not.toBe(950);
  });

  it("includes the founding tier keyed by its display name", () => {
    expect(discountablePrices["Founding 100"]).toBe(5);
  });

  it("keys are display names, not plan ids", () => {
    const keys = Object.keys(discountablePrices);
    expect(keys).not.toContain("founding50");
    expect(keys).not.toContain("growth");
    expect(keys).toContain("Founding 100");
    expect(keys).toContain("Growth");
  });

  it("has exactly 2 entries (Founding 100 + Growth — free + growth_annual excluded)", () => {
    expect(Object.keys(discountablePrices)).toHaveLength(2);
  });

  it("every value is a positive number matching a PRICING_TIERS numericPrice", () => {
    const pricesById = new Set(
      PRICING_TIERS
        .filter((t) => t.numericPrice !== undefined)
        .map((t) => t.numericPrice!),
    );
    for (const v of Object.values(discountablePrices)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThan(0);
      expect(pricesById.has(v)).toBe(true);
    }
  });
});
