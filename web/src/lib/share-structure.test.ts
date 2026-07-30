// Colocated vitest for the pure share-structure lib.
//
// share-structure.ts is used by the Phase-8 cap-table + share-register
// surfaces (see atlassian-standard-mapping-goal.md §2 folder 2 "Cap Table
// Current + Post-raise"). It exposes two share-valuation modes:
//   - fixed_shares: total authorised constant, price floats with SVI
//   - dynamic_shares: price fixed at nominal (A$0.001), shares float
// and helpers to derive per-shareholder allocations + a delta-based
// recompute trigger. Every branch is pure — no I/O, no Date — so this
// suite pins the branch matrix in a single deterministic pass.
//
// SVI → AUD valuation math (from vesting.ts:86-92):
//   base = 100_000, delta = svi - 100
//   svi >= 100: valuation = 100_000 + delta * 2_000
//   svi <  100: valuation = max(10_000, 100_000 + delta * 500)

import { describe, expect, it } from "vitest";

import { computeSharePrice as vestingSharePrice } from "./vesting";
import {
  computeAllAllocations,
  computeShareAllocation,
  computeSharePriceFromSVI,
  getDefaultShareStructure,
  shouldRecompute,
  type ShareStructureConfig,
} from "./share-structure";

const DEFAULT_AUTHORIZED_SHARES = 10_000_000;
const DEFAULT_NOMINAL_PRICE = 0.001;

function fixedConfig(overrides: Partial<ShareStructureConfig> = {}): ShareStructureConfig {
  return {
    mode: "fixed_shares",
    authorizedShares: DEFAULT_AUTHORIZED_SHARES,
    sharePriceAud: null,
    valuationAud: null,
    lastSviScore: null,
    autoRecompute: true,
    ...overrides,
  };
}

function dynamicConfig(overrides: Partial<ShareStructureConfig> = {}): ShareStructureConfig {
  return {
    ...fixedConfig(overrides),
    mode: "dynamic_shares",
    ...overrides,
  };
}

describe("computeSharePriceFromSVI — fixed_shares", () => {
  it("SVI = 100 → valuation A$100k spread over 10M shares", () => {
    const r = computeSharePriceFromSVI(100, fixedConfig());
    expect(r.mode).toBe("fixed_shares");
    expect(r.totalShares).toBe(DEFAULT_AUTHORIZED_SHARES);
    expect(r.valuationAud).toBe(100_000);
    // 100_000 / 10_000_000 = 0.01
    expect(r.pricePerShare).toBeCloseTo(0.01, 6);
    expect(r.priceChangeFromLast).toBeNull();
  });

  it("SVI = 150 → valuation A$200k (delta > 0 uses ×2000 multiplier)", () => {
    const r = computeSharePriceFromSVI(150, fixedConfig());
    expect(r.valuationAud).toBe(200_000);
    // 200_000 / 10_000_000 = 0.02
    expect(r.pricePerShare).toBeCloseTo(0.02, 6);
  });

  it("SVI = 50 → valuation A$75k (delta < 0 uses ×500 multiplier)", () => {
    const r = computeSharePriceFromSVI(50, fixedConfig());
    expect(r.valuationAud).toBe(75_000);
    expect(r.pricePerShare).toBeCloseTo(75_000 / DEFAULT_AUTHORIZED_SHARES, 6);
  });

  it("SVI floor: extreme low still clamps to A$10k minimum valuation", () => {
    const r = computeSharePriceFromSVI(-1000, fixedConfig());
    expect(r.valuationAud).toBe(10_000);
    expect(r.pricePerShare).toBeGreaterThan(0);
  });

  it("authorizedShares = 0 falls back to default 10M", () => {
    const r = computeSharePriceFromSVI(100, fixedConfig({ authorizedShares: 0 }));
    expect(r.totalShares).toBe(DEFAULT_AUTHORIZED_SHARES);
  });

  it("priceChangeFromLast: positive when new price rose from prior", () => {
    const prior = 0.01; // matches SVI = 100 outcome
    const r = computeSharePriceFromSVI(150, fixedConfig({ sharePriceAud: prior }));
    // new price 0.02 vs prior 0.01 → +100%
    expect(r.priceChangeFromLast).toBeCloseTo(100, 2);
  });

  it("priceChangeFromLast: negative when new price fell", () => {
    const prior = 0.02;
    const r = computeSharePriceFromSVI(100, fixedConfig({ sharePriceAud: prior }));
    // new price 0.01 vs prior 0.02 → -50%
    expect(r.priceChangeFromLast).toBeCloseTo(-50, 2);
  });

  it("priceChangeFromLast round-trip matches raw valuation from vesting.ts", () => {
    const r = computeSharePriceFromSVI(120, fixedConfig());
    const raw = vestingSharePrice(120, DEFAULT_AUTHORIZED_SHARES);
    expect(r.valuationAud).toBe(raw.valuationAud);
  });
});

describe("computeSharePriceFromSVI — dynamic_shares", () => {
  it("price fixed at A$0.001, total shares scales with valuation", () => {
    const r = computeSharePriceFromSVI(100, dynamicConfig());
    expect(r.mode).toBe("dynamic_shares");
    expect(r.pricePerShare).toBe(DEFAULT_NOMINAL_PRICE);
    // valuation 100_000 / 0.001 = 100_000_000 shares
    expect(r.totalShares).toBe(100_000_000);
  });

  it("SVI = 150 → 200M total shares at fixed A$0.001", () => {
    const r = computeSharePriceFromSVI(150, dynamicConfig());
    expect(r.pricePerShare).toBe(DEFAULT_NOMINAL_PRICE);
    expect(r.totalShares).toBe(200_000_000);
  });

  it("priceChangeFromLast is null when prior price already equals nominal", () => {
    const r = computeSharePriceFromSVI(
      100,
      dynamicConfig({ sharePriceAud: DEFAULT_NOMINAL_PRICE }),
    );
    expect(r.priceChangeFromLast).toBeNull();
  });

  it("priceChangeFromLast surfaces when prior price differs from nominal", () => {
    // Simulate switching from fixed_shares (prior priceAud=0.02) to dynamic
    const r = computeSharePriceFromSVI(100, dynamicConfig({ sharePriceAud: 0.02 }));
    // new nominal 0.001 vs prior 0.02 → -95%
    expect(r.priceChangeFromLast).toBeCloseTo(-95, 1);
  });
});

describe("computeShareAllocation", () => {
  it("50% ownership on a 10M share cap-table → 5M shares", () => {
    const price = computeSharePriceFromSVI(100, fixedConfig());
    const alloc = computeShareAllocation(50, price);
    expect(alloc.ownershipPct).toBe(50);
    expect(alloc.shares).toBe(5_000_000);
    expect(alloc.valueAud).toBeCloseTo(5_000_000 * price.pricePerShare, 2);
    expect(alloc.shareholderName).toBe("");
  });

  it("0% ownership yields 0 shares + A$0 value", () => {
    const price = computeSharePriceFromSVI(100, fixedConfig());
    const alloc = computeShareAllocation(0, price);
    expect(alloc.shares).toBe(0);
    expect(alloc.valueAud).toBe(0);
  });

  it("share count floored — fractional shares rounded DOWN", () => {
    const price = computeSharePriceFromSVI(100, fixedConfig());
    // 12.345% of 10M = 1_234_500 exactly, but 12.3456% floors to 1_234_559
    // (12.3456% × 10_000_000 = 1_234_560.0 in exact arithmetic; JS float
    //  yields ~1_234_559.999... → Math.floor lands at 1_234_559).
    const alloc = computeShareAllocation(12.3456, price);
    // Assert the floor invariant: shares × pricePerShare never exceeds
    // (ownershipPct/100) × valuation.
    const rawShares = (12.3456 / 100) * price.totalShares;
    expect(alloc.shares).toBeLessThanOrEqual(Math.ceil(rawShares));
    expect(alloc.shares).toBe(Math.floor(rawShares));
  });
});

describe("computeAllAllocations", () => {
  it("attaches each shareholder's name to the derived allocation", () => {
    const price = computeSharePriceFromSVI(100, fixedConfig());
    const allocs = computeAllAllocations(
      [
        { name: "Founder A", ownershipPct: 40 },
        { name: "Founder B", ownershipPct: 40 },
        { name: "Option Pool", ownershipPct: 20 },
      ],
      price,
    );
    expect(allocs).toHaveLength(3);
    expect(allocs.map((a) => a.shareholderName)).toEqual([
      "Founder A",
      "Founder B",
      "Option Pool",
    ]);
    expect(allocs[0].shares).toBe(4_000_000);
    expect(allocs[2].shares).toBe(2_000_000);
    // total shares allocated equals total cap-table for a clean 100% split
    const total = allocs.reduce((acc, a) => acc + a.shares, 0);
    expect(total).toBe(DEFAULT_AUTHORIZED_SHARES);
  });

  it("empty shareholder list returns an empty array", () => {
    const price = computeSharePriceFromSVI(100, fixedConfig());
    expect(computeAllAllocations([], price)).toEqual([]);
  });
});

describe("shouldRecompute", () => {
  it("null lastSVI always triggers a recompute", () => {
    expect(shouldRecompute(100, null)).toBe(true);
  });

  it("delta at threshold triggers (>=)", () => {
    expect(shouldRecompute(105, 100)).toBe(true);
  });

  it("delta below threshold does not trigger", () => {
    expect(shouldRecompute(103, 100)).toBe(false);
  });

  it("negative delta beyond threshold triggers (absolute value)", () => {
    expect(shouldRecompute(90, 100)).toBe(true);
  });

  it("custom threshold respected", () => {
    // default threshold=5 would trigger; custom=20 must not
    expect(shouldRecompute(110, 100, 20)).toBe(false);
    expect(shouldRecompute(125, 100, 20)).toBe(true);
  });

  it("identical scores do not trigger", () => {
    expect(shouldRecompute(100, 100)).toBe(false);
  });
});

describe("getDefaultShareStructure", () => {
  it("returns a fixed_shares config with 10M authorised + auto-recompute on", () => {
    const cfg = getDefaultShareStructure();
    expect(cfg.mode).toBe("fixed_shares");
    expect(cfg.authorizedShares).toBe(DEFAULT_AUTHORIZED_SHARES);
    expect(cfg.sharePriceAud).toBeNull();
    expect(cfg.valuationAud).toBeNull();
    expect(cfg.lastSviScore).toBeNull();
    expect(cfg.autoRecompute).toBe(true);
  });

  it("default config is a fresh object per call (no shared mutable state)", () => {
    const a = getDefaultShareStructure();
    const b = getDefaultShareStructure();
    expect(a).not.toBe(b);
    a.autoRecompute = false;
    expect(b.autoRecompute).toBe(true);
  });
});
