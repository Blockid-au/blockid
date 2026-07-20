import { describe, it, expect } from "vitest";
import {
  auMarketProfile,
  computeTamSamSom,
  type TamSamSomInput,
} from "./cfo-tam-sam-som";

const saasInput: TamSamSomInput = {
  sector: "saas",
  annualArpuAud: 1200,
  basePenetrationPct: 0.5,
};

describe("cfo-tam-sam-som — bottom-up market sizing", () => {
  it("returns AUD-denominated TAM ≥ SAM ≥ SOM in the base case", () => {
    const r = computeTamSamSom(saasInput);
    expect(r.currency).toBe("AUD");
    expect(r.base.somAud).toBeGreaterThan(0);
    expect(r.base.samAud).toBeGreaterThanOrEqual(r.base.somAud);
    expect(r.base.tamAud).toBeGreaterThanOrEqual(r.base.samAud);
  });

  it("computes SOM = reachableUnits × penetration × annual ARPU", () => {
    const profile = auMarketProfile("saas");
    const r = computeTamSamSom(saasInput);
    const expected = profile.reachableUnits * (0.5 / 100) * 1200;
    expect(r.base.somAud).toBe(Math.round(expected));
  });

  it("orders bear < base < bull for SOM under symmetric sensitivity", () => {
    const r = computeTamSamSom({ ...saasInput, sensitivity: 0.3 });
    expect(r.bear.somAud).toBeLessThan(r.base.somAud);
    expect(r.bull.somAud).toBeGreaterThan(r.base.somAud);
  });

  it("falls back to the default profile for unknown sectors", () => {
    const r = computeTamSamSom({ sector: "unknown-thing", annualArpuAud: 500 });
    expect(r.sector).toBe("default");
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("honours a reachableUnits override for niche B2G/B2B", () => {
    const r = computeTamSamSom({
      sector: "deeptech",
      annualArpuAud: 250000,
      reachableUnits: 1200,
      basePenetrationPct: 5,
    });
    expect(r.reachableUnits).toBe(1200);
    // SOM = 1200 × 5% × 250,000 = 15,000,000
    expect(r.base.somAud).toBe(15_000_000);
  });

  it("clamps penetration to [0, 100] and sensitivity to a safe range", () => {
    const r = computeTamSamSom({
      sector: "saas",
      annualArpuAud: 1000,
      basePenetrationPct: 500, // absurd input
      sensitivity: 5,          // absurd input
    });
    expect(r.base.penetrationPct).toBeLessThanOrEqual(100);
    // Sensitivity clamped to ≤0.9 → bear is not negative.
    expect(r.bear.somAud).toBeGreaterThanOrEqual(0);
  });

  it("attaches AU-specific citations for every sector profile", () => {
    for (const s of ["saas", "fintech", "healthtech", "ai", "deeptech", "ecommerce", "marketplace"]) {
      const p = auMarketProfile(s);
      expect(p.sources.length).toBeGreaterThan(0);
      for (const src of p.sources) {
        expect(src.publisher.length).toBeGreaterThan(0);
        expect(src.title.length).toBeGreaterThan(0);
        expect(src.year).toBeGreaterThanOrEqual(2020);
      }
    }
  });
});
