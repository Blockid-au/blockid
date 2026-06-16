import { describe, expect, it } from "vitest";
import { detectMaturity, maturityValuationGuard } from "./maturity-detector";

describe("detectMaturity", () => {
  it("flags well-known established domains immediately", () => {
    const result = detectMaturity({
      url: "https://stripe.com",
      rawText: "https://stripe.com",
    });
    expect(result.level).toBe("established");
    expect(result.confidence).toBe("high");
    expect(result.isEstablished).toBe(true);
    expect(result.evidence[0]).toMatch(/stripe\.com/);
  });

  it("detects public ticker mentions", () => {
    const result = detectMaturity({
      rawText: "We are listed on ASX:WTC and proud to serve thousands of customers globally.",
    });
    expect(["established", "scale"]).toContain(result.level);
    expect(result.publicTickerHints).toContain("ASX:WTC");
  });

  it("classifies idea-stage inputs as idea", () => {
    const result = detectMaturity({
      rawText: "An idea for a marketplace connecting freelance designers with startups",
    });
    expect(["idea", "early"]).toContain(result.level);
    expect(result.isEstablished).toBe(false);
  });

  it("detects waitlist / coming-soon as early stage", () => {
    const result = detectMaturity({
      rawText: "We're building something exciting. Join our waitlist for early access to the beta.",
    });
    expect(result.level).toBe("early");
    expect(result.isEstablished).toBe(false);
  });

  it("detects scale signals (Series C, valuation mentions)", () => {
    const result = detectMaturity({
      rawText: "We've recently closed our Series C at a $2 billion valuation with over 500 employees globally.",
    });
    expect(["scale", "established"]).toContain(result.level);
    expect(result.isEstablished).toBe(true);
  });

  it("extracts founding year correctly", () => {
    const result = detectMaturity({
      rawText: "Founded in 2008, our company has been serving customers for over 18 years.",
    });
    expect(result.inferredFoundingYear).toBe(2008);
  });

  it("guards established companies with low confidence override", () => {
    const signal = detectMaturity({
      url: "https://stripe.com",
      rawText: "https://stripe.com",
    });
    const guard = maturityValuationGuard(signal);
    expect(guard.override).toBe(true);
    expect(guard.confidenceOverride).toBe("low");
    expect(guard.reason).toMatch(/established/i);
  });

  it("does not guard early-stage inputs", () => {
    const signal = detectMaturity({
      rawText: "We're a pre-seed startup building a productivity tool.",
    });
    const guard = maturityValuationGuard(signal);
    expect(guard.override).toBe(false);
  });
});
