import { describe, expect, it } from "vitest";

import { extractSignals } from "@/lib/svi-analysis";
import { detectContext } from "./detect-context";

describe("detectContext", () => {
  it("returns idea-stage for empty signal set", () => {
    const signals = extractSignals({ rawText: "just an idea we're exploring" });
    const ctx = detectContext(signals, "just an idea we're exploring");
    expect(ctx.stage).toBeLessThanOrEqual(1);
    expect(ctx.evidenceCompleteness).toBeLessThan(0.3);
    expect(ctx.missingSignals.length).toBeGreaterThan(5);
  });

  it("promotes growth-stage for mid-revenue signals", () => {
    const text =
      "SaaS platform with $300k ARR growing, 45 paying customers, cap table on file, financial model prepared, pitch deck ready, data room available, ABN registered.";
    const signals = extractSignals({ rawText: text });
    const ctx = detectContext(signals, text);
    expect(ctx.stage).toBeGreaterThanOrEqual(3);
    expect(ctx.evidenceCompleteness).toBeGreaterThan(0.3);
  });

  it("flags established maturity for a well-known domain", () => {
    const signals = extractSignals({ rawText: "https://stripe.com" });
    const ctx = detectContext(signals, "https://stripe.com", {
      url: "https://stripe.com",
    });
    expect(ctx.maturity).toBe("established");
  });

  it("caps missingSignals to a reasonable length", () => {
    const signals = extractSignals({ rawText: "hello" });
    const ctx = detectContext(signals, "hello");
    expect(ctx.missingSignals.length).toBeLessThanOrEqual(12);
  });

  it("returns a stable growthPhase order (1..12)", () => {
    const signals = extractSignals({ rawText: "MVP live with 20 users and analytics" });
    const ctx = detectContext(signals, "MVP live with 20 users and analytics");
    expect(ctx.growthPhase).toBeGreaterThanOrEqual(1);
    expect(ctx.growthPhase).toBeLessThanOrEqual(12);
  });
});
