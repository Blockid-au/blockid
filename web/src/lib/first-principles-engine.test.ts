// src/lib/first-principles-engine.test.ts
//
// Tests for the first-principles Socratic engine that powers /guides/idea-explorer.
// Covers question generator shape guarantees and rec-synthesiser routing to
// /svi vs /tools/cap-table vs /tools/esic. Locks in the fc4f27f fix that
// `secondaryFeatures` always has >= 1 entry so the rec card doesn't render
// with a dead-end navigation.

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateInitialQuestions,
  synthesizeRecommendation,
} from "./first-principles-engine";

describe("generateInitialQuestions", () => {
  it("returns 5–7 questions for a terse idea", () => {
    const qs = generateInitialQuestions("marketplace for dog walkers");
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(7);
    for (const q of qs) {
      expect(q.id).toBeTruthy();
      expect(q.prompt).toBeTruthy();
      expect(q.category).toBeTruthy();
    }
  });

  it("returns 5–7 questions even when idea already answers most rules", () => {
    const detailed = [
      "The problem: tradies waste hours on invoicing.",
      "Customer: sole-trader electricians in Sydney SMB, 20-50k of them in AU.",
      "They use spreadsheets and manual quotes today, painful.",
      "Why us: I ran an electrical business for 8 years — domain insight.",
      "Moat: proprietary compliance data + network effects.",
      "TAM: A$500 million market. Pricing: subscription at $49/month.",
      "MVP is shipped as a beta. We have 30 customer interviews and 12 LOIs.",
      "Co-founder is CTO ex-Atlassian.",
    ].join(" ");
    const qs = generateInitialQuestions(detailed);
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(7);
    // Every returned question id is unique.
    const ids = new Set(qs.map((q) => q.id));
    expect(ids.size).toBe(qs.length);
  });

  it("handles empty input without throwing", () => {
    const qs = generateInitialQuestions("");
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(7);
  });
});

describe("synthesizeRecommendation", () => {
  it("routes a cap-table / equity idea to /tools/cap-table", () => {
    const rec = synthesizeRecommendation(
      "we need to split equity among co-founders and set up vesting",
      { team: "3 co-founders, ESOP required" },
    );
    expect(rec.primaryFeatureHref).toBe("/tools/cap-table");
    expect(rec.primaryFeature).toContain("Cap Table");
  });

  it("routes an R&D / patent idea to /tools/esic", () => {
    const rec = synthesizeRecommendation(
      "deep R&D project with novel IP and patent portfolio for ESIC tax offset",
      { moat: "patent-pending innovation" },
    );
    expect(rec.primaryFeatureHref).toBe("/tools/esic");
  });

  it("falls back to /svi for a generic early-stage idea", () => {
    const rec = synthesizeRecommendation(
      "an idea for helping small businesses",
      {},
    );
    expect(rec.primaryFeatureHref).toBe("/svi");
  });

  it("always returns at least 2 secondaryFeatures (fc4f27f regression)", () => {
    // A very generic idea would previously produce an empty
    // secondaryFeatures list because most destinations scored 0.
    // The rec engine now falls back to the next two ranked destinations
    // so the card always has onward navigation.
    const rec = synthesizeRecommendation("something", {});
    expect(rec.secondaryFeatures.length).toBeGreaterThanOrEqual(2);
    for (const s of rec.secondaryFeatures) {
      expect(s.label).toBeTruthy();
      expect(s.href.startsWith("/")).toBe(true);
    }
  });

  it("secondary features never repeat the primary destination", () => {
    const rec = synthesizeRecommendation(
      "we need to split equity among co-founders",
      {},
    );
    for (const s of rec.secondaryFeatures) {
      expect(s.href).not.toBe(rec.primaryFeatureHref);
    }
  });
});
