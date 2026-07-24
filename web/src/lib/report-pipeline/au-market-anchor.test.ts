import { describe, expect, it } from "vitest";
import {
  buildAuMarketAnchorBlock,
  deriveIndustryKeyword,
  extractAnzsicCode,
} from "./au-market-anchor";
import { AU_MARKET_LOOKUP_DISCLAIMER } from "@/lib/market/au-market-lookup";

describe("extractAnzsicCode", () => {
  it("returns null for null / empty input", () => {
    expect(extractAnzsicCode(null)).toBeNull();
    expect(extractAnzsicCode(undefined)).toBeNull();
    expect(extractAnzsicCode("")).toBeNull();
    expect(extractAnzsicCode("no code here")).toBeNull();
  });

  it("extracts and canonicalises a well-formed ANZSIC code", () => {
    expect(extractAnzsicCode("We map to ANZSIC J5810 Software Publishing")).toBe(
      "J5810",
    );
    expect(extractAnzsicCode("classified under k6419 fintech")).toBe("K6419");
  });

  it("tolerates whitespace between division letter and 4-digit class", () => {
    expect(extractAnzsicCode("class J 5810 saas")).toBe("J5810");
  });

  it("returns the first hit only", () => {
    expect(extractAnzsicCode("J5810 or K6419 depending on read")).toBe("J5810");
  });
});

describe("deriveIndustryKeyword", () => {
  it("returns null for empty text", () => {
    expect(deriveIndustryKeyword(null)).toBeNull();
    expect(deriveIndustryKeyword("")).toBeNull();
    expect(deriveIndustryKeyword("   ")).toBeNull();
  });

  it("picks a fintech keyword from a fintech pitch", () => {
    const kw = deriveIndustryKeyword(
      "We're building a neobank for AU tradies with embedded payments.",
    );
    expect(kw).not.toBeNull();
    // Any of the fintech-industry keywords is acceptable — the point is
    // that the derived keyword round-trips into estimateTamSamSom against
    // the fintech snapshot.
    expect(["neobank", "payments", "fintech", "digital wallet", "buy now pay later"]).toContain(kw);
  });

  it("prefers the industry with more keyword hits when signals compete", () => {
    // "software" hits SaaS, "hosting" hits hosting. Two SaaS-adjacent hits should win.
    const kw = deriveIndustryKeyword(
      "Cloud software platform for B2B software teams — SaaS billing.",
    );
    expect(kw).not.toBeNull();
    expect(["saas", "software", "b2b software", "cloud software", "platform"]).toContain(kw);
  });

  it("returns null when nothing matches", () => {
    expect(deriveIndustryKeyword("we run a dry-cleaning franchise")).toBeNull();
  });
});

describe("buildAuMarketAnchorBlock", () => {
  it("returns null when no signal is available", () => {
    expect(buildAuMarketAnchorBlock({ rawText: "dry cleaning franchise" })).toBeNull();
    expect(buildAuMarketAnchorBlock({})).toBeNull();
  });

  it("renders a full markdown block for a SaaS pitch", () => {
    const block = buildAuMarketAnchorBlock({
      rawText: "A B2B SaaS platform for AU healthcare providers.",
    });
    expect(block).not.toBeNull();
    expect(block).toContain("## AU Market Anchor (ABS / IBISWorld)");
    expect(block).toContain("ANZSIC 2006");
    expect(block).toContain("Total Addressable Market");
    expect(block).toContain("Serviceable Available Market");
    expect(block).toContain("Serviceable Obtainable Market");
    expect(block).toContain("Trailing 5-yr CAGR");
    expect(block).toContain("Sources:");
    expect(block).toContain(AU_MARKET_LOOKUP_DISCLAIMER);
  });

  it("prefers an explicit ANZSIC code over a rawText keyword", () => {
    // Text is fintech-ish but explicit code forces SaaS snapshot.
    const block = buildAuMarketAnchorBlock({
      anzsicCode: "J5810",
      rawText: "A neobank challenger for AU tradies.",
    });
    expect(block).toContain("J5810");
    expect(block).toContain("Software Publishing (SaaS)");
  });

  it("falls back to a rawText-extracted ANZSIC code when no explicit code", () => {
    const block = buildAuMarketAnchorBlock({
      rawText: "Classified under ANZSIC K6419 — fintech neobank",
    });
    expect(block).toContain("K6419");
  });

  it("honours addressablePct + targetSharePct overrides", () => {
    const block = buildAuMarketAnchorBlock({
      keyword: "saas",
      addressablePct: 0.3,
      targetSharePct: 0.02,
    });
    expect(block).toContain("(30% of TAM)");
    expect(block).toContain("(2.0% 3-yr capture of SAM)");
  });

  it("returns null for a keyword that does not map to any seeded industry", () => {
    expect(buildAuMarketAnchorBlock({ keyword: "widgets" })).toBeNull();
  });

  it("clamps out-of-range pct overrides via estimateTamSamSom (defence in depth)", () => {
    // estimateTamSamSom clamps [0,1]; overshoot should not throw + block still renders.
    const block = buildAuMarketAnchorBlock({
      keyword: "saas",
      addressablePct: 5, // clamped to 1
      targetSharePct: -1, // clamped to 0
    });
    expect(block).not.toBeNull();
    expect(block).toContain("(100% of TAM)");
    expect(block).toContain("(0.0% 3-yr capture of SAM)");
  });
});
