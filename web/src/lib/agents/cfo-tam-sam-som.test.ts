import { describe, it, expect } from "vitest";
import {
  auMarketProfile,
  computeTamSamSom,
  computeTopDownTamSamSom,
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

describe("cfo-tam-sam-som — top-down market sizing", () => {
  const baseInput = {
    sector: "saas",
    totalMarketSizeAud: 10_000_000_000, // A$10B sector TAM anchor
    samSharePct: 20,
    achievableSomSharePct: 5,
  };

  it("returns AUD-denominated TAM ≥ SAM ≥ SOM in the base case", () => {
    const r = computeTopDownTamSamSom(baseInput);
    expect(r.currency).toBe("AUD");
    expect(r.base.tamAud).toBeGreaterThan(0);
    expect(r.base.samAud).toBeLessThanOrEqual(r.base.tamAud);
    expect(r.base.somAud).toBeLessThanOrEqual(r.base.samAud);
  });

  it("computes SAM = TAM × samShare and SOM = SAM × somShare", () => {
    const r = computeTopDownTamSamSom(baseInput);
    expect(r.base.tamAud).toBe(10_000_000_000);
    expect(r.base.samAud).toBe(2_000_000_000); // 10B × 20%
    expect(r.base.somAud).toBe(100_000_000);   // 2B × 5%
  });

  it("orders bear < base < bull for SOM under symmetric sensitivity", () => {
    const r = computeTopDownTamSamSom({ ...baseInput, sensitivity: 0.3 });
    expect(r.bear.somAud).toBeLessThan(r.base.somAud);
    expect(r.bull.somAud).toBeGreaterThan(r.base.somAud);
  });

  it("keeps TAM identical across bear/base/bull — only share inputs flex", () => {
    const r = computeTopDownTamSamSom({ ...baseInput, sensitivity: 0.4 });
    expect(r.bear.tamAud).toBe(r.base.tamAud);
    expect(r.bull.tamAud).toBe(r.base.tamAud);
  });

  it("falls back to the default profile sources for unknown sectors", () => {
    const r = computeTopDownTamSamSom({ ...baseInput, sector: "unknown-thing" });
    expect(r.sector).toBe("default");
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("clamps share inputs to [0, 100] and sensitivity to a safe range", () => {
    const r = computeTopDownTamSamSom({
      sector: "saas",
      totalMarketSizeAud: 1_000_000_000,
      samSharePct: 500,             // absurd input
      achievableSomSharePct: 500,   // absurd input
      sensitivity: 5,               // absurd input
    });
    expect(r.base.samSharePct).toBeLessThanOrEqual(100);
    expect(r.base.achievableSomSharePct).toBeLessThanOrEqual(100);
    // Sensitivity clamped to ≤0.9 → bear is not negative.
    expect(r.bear.somAud).toBeGreaterThanOrEqual(0);
  });

  it("carries sector CAGR from the AU profile onto the result", () => {
    const r = computeTopDownTamSamSom({ ...baseInput, sector: "ai" });
    expect(r.cagrPct).toBe(auMarketProfile("ai").cagrPct);
  });
});
