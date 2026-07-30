/**
 * Colocated tests for report-credit-cost.
 *
 * Pins the five load-bearing invariants of Master Upgrade Plan §8.7 and
 * §10.1 credit reconciliation:
 *   1. Default (Sonnet · Standard · 10 sections) = 200 credits (D2 anchor).
 *   2. 200 credits × A$0.025/credit = A$5.00 — reconciles Path A / Path B.
 *   3. 10 sections × 850 words = 8,500 estimated words (§8.7 modal copy).
 *   4. Depth ladder ordering: scan < standard < deep < expert < max.
 *   5. Model ladder ordering: haiku < sonnet < opus.
 */

import { describe, expect, it } from "vitest";
import {
  BASE_UNITS_PER_SECTION,
  DEFAULT_TRUST_REPORT_QUOTE,
  DEPTH_MULTIPLIER,
  MODEL_MULTIPLIER,
  quoteTrustReport,
  REPORT_SECTIONS,
  WORDS_PER_SECTION,
  type ReportDepth,
  type ReportModel,
} from "./report-credit-cost";

describe("quoteTrustReport", () => {
  it("default quote is Sonnet · Standard · 10 sections = 200 credits (D2)", () => {
    const q = DEFAULT_TRUST_REPORT_QUOTE;
    expect(q.model).toBe("sonnet");
    expect(q.depth).toBe("standard");
    expect(q.sections).toBe(REPORT_SECTIONS);
    expect(q.credits).toBe(200);
  });

  it("200 credits reconciles A$5.00 net at A$0.025/credit (D1 / §10.1)", () => {
    // A$0.025/credit is the CFO-anchored rate. 200 × 0.025 = 5.00.
    const q = DEFAULT_TRUST_REPORT_QUOTE;
    const aud = q.credits * 0.025;
    expect(aud).toBeCloseTo(5.0, 5);
  });

  it("default estimated words is 8,500 (§8.7 modal line)", () => {
    expect(DEFAULT_TRUST_REPORT_QUOTE.estimatedWords).toBe(
      REPORT_SECTIONS * WORDS_PER_SECTION,
    );
    expect(DEFAULT_TRUST_REPORT_QUOTE.estimatedWords).toBe(8500);
  });

  it("depth ladder multiplies base cost in strict order", () => {
    const depths: ReportDepth[] = ["scan", "standard", "deep", "expert", "max"];
    const costs = depths.map((d) => quoteTrustReport({ depth: d }).credits);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]!);
    }
    // Scan is the cheapest possible full report — 10 sections × 0.1 × 1.0 × 40 = 40.
    expect(costs[0]).toBe(40);
    // Max at Sonnet is 10 × 3.0 × 1.0 × 40 = 1200.
    expect(costs[4]).toBe(1200);
  });

  it("model ladder multiplies cost in strict order", () => {
    const models: ReportModel[] = ["haiku", "sonnet", "opus"];
    const costs = models.map((m) => quoteTrustReport({ model: m }).credits);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]!);
    }
    // Haiku Standard: 10 × 0.5 × 0.2 × 40 = 40 (ceil 40).
    expect(costs[0]).toBe(40);
    // Opus Standard: 10 × 0.5 × 2.5 × 40 = 500.
    expect(costs[2]).toBe(500);
  });

  it("section count scales cost linearly (5 sections = half of default)", () => {
    const half = quoteTrustReport({ sections: 5 });
    expect(half.credits).toBe(100);
    expect(half.estimatedWords).toBe(5 * WORDS_PER_SECTION);
  });

  it("section count is floored to at least 1", () => {
    expect(quoteTrustReport({ sections: 0 }).sections).toBe(1);
    expect(quoteTrustReport({ sections: -3 }).sections).toBe(1);
  });

  it("credits are ceiled — no fractional debit", () => {
    // Haiku · Scan · 1 section = 1 × 0.1 × 0.2 × 40 = 0.8 → ceil 1.
    const q = quoteTrustReport({ model: "haiku", depth: "scan", sections: 1 });
    expect(q.credits).toBe(1);
  });

  it("constants pin the reconciliation anchors", () => {
    expect(BASE_UNITS_PER_SECTION).toBe(40);
    expect(WORDS_PER_SECTION).toBe(850);
    expect(REPORT_SECTIONS).toBe(10);
    expect(DEPTH_MULTIPLIER.standard).toBe(0.5);
    expect(MODEL_MULTIPLIER.sonnet).toBe(1.0);
  });
});
