// Unit test for the pure phase → next-step recommender (G13-W3-IA3).
//
// Colocated because vitest.config.ts only discovers `src/**/*.test.ts`.
// Contract (spec §B.2 / §B.4 / §B.5, goal doc D4):
//   - every canonical GrowthPhaseId maps to a v4 hub href;
//   - phase 0 recommends /analyze (the only surface that works before a
//     score exists);
//   - segment overrides win regardless of phase;
//   - `impact` is derived from the caller's signals, never invented;
//   - copy shows the phase LABEL, never "Phase N".

import { describe, it, expect } from "vitest";
import { GROWTH_PHASE_IDS, GROWTH_PHASE_LABELS, GROWTH_PHASE_ORDER } from "@/lib/growth/phase-taxonomy";
import { HUBS, HUB_IDS, hubTabHref } from "@/lib/nav/hubs";
import {
  MONEY_FINDER_PHASES,
  MONEY_FINDER_SECONDARY,
  recommendNextStep,
  reasonForPhase,
  resolveGrowthPhase,
} from "@/lib/nav/next-step-recommender";

const HUB_HREFS = new Set<string>();
for (const id of HUB_IDS) {
  HUB_HREFS.add(HUBS[id].root);
  for (const t of HUBS[id].tabs) HUB_HREFS.add(hubTabHref(HUBS[id], t));
}

describe("next-step-recommender", () => {
  it("maps every canonical growth phase (by id and by ordinal) to a v4 hub href", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const byId = recommendNextStep({ currentPhase: 0, growthPhaseId: id });
      const byOrdinal = recommendNextStep({ currentPhase: GROWTH_PHASE_ORDER[id] });
      expect(byOrdinal, `${id} ordinal == id`).toEqual(byId);
      expect(HUB_HREFS.has(byId.href) || byId.href === "/workspace/funding", `${id} → ${byId.href} must be a hub root/tab`).toBe(true);
      expect(byId.label.length).toBeGreaterThan(0);
      expect(byId.ctaLabel.length).toBeGreaterThan(0);
      expect(byId.reason.length).toBeGreaterThan(0);
    }
  });

  it("phase 0 recommends /analyze (spec §B.4 — not /workspace/score/criteria)", () => {
    const step = recommendNextStep({ currentPhase: 0, planId: "founder_free" });
    expect(step.href).toBe("/analyze");
    expect(step.icon).toBe("sparkles");
    expect(step.ctaLabel).toBe("Start");
    expect(recommendNextStep({ currentPhase: -5 }).href).toBe("/analyze");
    expect(recommendNextStep({ currentPhase: Number.NaN }).href).toBe("/analyze");
  });

  it("investor_angel segment falls through to /workspace/investor/dealflow at any phase", () => {
    for (const phase of [0, 1, 3, 7, 12]) {
      expect(recommendNextStep({ currentPhase: phase, segment: "investor_angel" }).href).toBe("/workspace/investor/dealflow");
    }
  });

  it("investor_vc + advisor + accelerator + reseller each get their own home surface", () => {
    expect(recommendNextStep({ currentPhase: 4, segment: "investor_vc" }).href).toBe("/workspace/investor/dealflow");
    expect(recommendNextStep({ currentPhase: 4, segment: "advisor" }).href).toBe("/workspace/advisor/roster");
    expect(recommendNextStep({ currentPhase: 4, segment: "accelerator" }).href).toBe("/workspace/accelerator/cohort");
    expect(recommendNextStep({ currentPhase: 4, segment: "reseller" }).href).toBe("/reseller");
  });

  it("clamps out-of-range ordinals into 1..12 and prefers growthPhaseId when given", () => {
    expect(recommendNextStep({ currentPhase: 99 }).href).toBe("/workspace/documents/data-room");
    expect(resolveGrowthPhase({ currentPhase: 99 })).toBe("funding");
    expect(resolveGrowthPhase({ currentPhase: 2, growthPhaseId: "team" })).toBe("team");
    expect(resolveGrowthPhase({ currentPhase: 2, growthPhaseId: "not-a-phase" })).toBe("customer_dev");
  });

  it("reasonForPhase shows the canonical label, never a phase number (spec §B.5)", () => {
    expect(reasonForPhase(3)).toBe(`Because you're at ${GROWTH_PHASE_LABELS.revenue_model.en}`);
    expect(reasonForPhase("team")).toContain(GROWTH_PHASE_LABELS.team.en);
    expect(reasonForPhase(3)).not.toMatch(/Phase\s*\d/);
    expect(reasonForPhase(0)).toMatch(/haven't started|evaluation/i);
    expect(reasonForPhase(null)).toMatch(/haven't started/i);
  });

  it("carries the Money Finder secondary line for the first three phases only (G11 T0244)", () => {
    expect(MONEY_FINDER_PHASES).toEqual(["vision", "customer_dev", "revenue_model"]);
    for (const id of MONEY_FINDER_PHASES) {
      const step = recommendNextStep({ currentPhase: 0, growthPhaseId: id });
      expect(step.secondary).toEqual(MONEY_FINDER_SECONDARY);
      expect(step.secondary!.href).toBe("/workspace/funding");
    }
    for (const id of GROWTH_PHASE_IDS.filter((p) => !MONEY_FINDER_PHASES.includes(p))) {
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: id }).secondary, id).toBeUndefined();
    }
    expect(recommendNextStep({ currentPhase: 0 }).secondary).toBeUndefined();
    expect(recommendNextStep({ currentPhase: 2, segment: "investor_angel" }).secondary).toBeUndefined();
  });

  describe("impact (spec §B.2 contract change)", () => {
    it("is absent without signals and never invented", () => {
      expect(recommendNextStep({ currentPhase: 2 }).impact).toBeUndefined();
      expect(recommendNextStep({ currentPhase: 2, signals: {} }).impact).toBeUndefined();
      expect(recommendNextStep({ currentPhase: 2, signals: { topEvidenceGapPts: 0, topMoney: null } }).impact).toBeUndefined();
    });

    it("states the SVI delta for evidence-shaped steps (phase 0, evidence, score)", () => {
      const signals = { topEvidenceGapPts: 6.4 };
      expect(recommendNextStep({ currentPhase: 0, signals }).impact).toEqual({ sviDelta: 6 });
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: "customer_dev", signals }).impact).toEqual({ sviDelta: 6 });
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: "product_dev", signals }).impact).toEqual({ sviDelta: 6 });
      // A team-planning step is not an evidence step — no SVI claim.
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: "team", signals }).impact).toBeUndefined();
    });

    it("attaches the money on the table only where the Money Finder line shows", () => {
      const topMoney = { label: "MVP Ventures", amountAud: 45_000, closesAt: "2026-09-30" };
      const early = recommendNextStep({ currentPhase: 0, growthPhaseId: "vision", signals: { topMoney } });
      expect(early.impact).toEqual({ moneyAud: 45_000, moneyClosesAt: "2026-09-30", moneyLabel: "MVP Ventures" });
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: "funding", signals: { topMoney } }).impact).toBeUndefined();
      expect(recommendNextStep({ currentPhase: 0, growthPhaseId: "vision", signals: { topMoney: { ...topMoney, amountAud: null } } }).impact).toBeUndefined();
    });

    it("segment overrides never carry founder impact", () => {
      expect(recommendNextStep({ currentPhase: 2, segment: "advisor", signals: { topEvidenceGapPts: 9 } }).impact).toBeUndefined();
    });
  });
});
