// Unit test for the pure phase → NavItem recommender.
//
// Design spec asked for `web/tests/unit/next-step-recommender.test.ts` — but
// vitest.config.ts's `include: ["src/**/*.test.ts"]` only discovers colocated
// tests, so we live alongside the module. Assertions match the design
// contract:
//   - every phase 1..12 in PHASE_LABELS maps to a valid workspace href;
//   - a `founder_free` plan at phase 0 recommends /workspace/evaluation;
//   - the investor_angel segment always resolves to /workspace/deal-flow
//     regardless of the founder phase we happen to pass in.

import { describe, it, expect } from "vitest";
import { PHASE_LABELS } from "@/lib/showcase/gallery";
import {
  recommendNextStep,
  reasonForPhase,
} from "@/lib/nav/next-step-recommender";

describe("next-step-recommender", () => {
  it("returns a workspace-shaped href for every canonical phase (1..12)", () => {
    for (const phaseKey of Object.keys(PHASE_LABELS)) {
      const phase = Number(phaseKey);
      const step = recommendNextStep({ currentPhase: phase });
      expect(step, `phase ${phase} must resolve to a step`).toBeTruthy();
      expect(step.href, `phase ${phase} href must be absolute`).toMatch(
        /^\/(workspace|dashboard|reseller)\//,
      );
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.ctaLabel.length).toBeGreaterThan(0);
      expect(step.reason.length).toBeGreaterThan(0);
    }
  });

  it("founder_free at phase 0 recommends /workspace/evaluation", () => {
    const step = recommendNextStep({
      currentPhase: 0,
      planId: "founder_free",
    });
    expect(step.href).toBe("/workspace/evaluation");
    expect(step.icon).toBe("sparkles");
  });

  it("investor_angel segment falls through to /workspace/deal-flow at any phase", () => {
    for (const phase of [0, 1, 3, 7, 12]) {
      const step = recommendNextStep({
        currentPhase: phase,
        segment: "investor_angel",
      });
      expect(step.href).toBe("/workspace/deal-flow");
    }
  });

  it("investor_vc + advisor + accelerator + reseller each get their own home surface", () => {
    expect(recommendNextStep({ currentPhase: 4, segment: "investor_vc" }).href).toBe(
      "/workspace/deal-flow",
    );
    expect(recommendNextStep({ currentPhase: 4, segment: "advisor" }).href).toBe(
      "/workspace/client-roster",
    );
    expect(recommendNextStep({ currentPhase: 4, segment: "accelerator" }).href).toBe(
      "/workspace/cohort",
    );
    expect(recommendNextStep({ currentPhase: 4, segment: "reseller" }).href).toBe(
      "/reseller",
    );
  });

  it("clamps out-of-range phases into 1..12", () => {
    // 99 clamps down to 12 (Exit).
    expect(recommendNextStep({ currentPhase: 99 }).href).toBe(
      "/workspace/exit",
    );
    // Negative → phase-0 default.
    expect(recommendNextStep({ currentPhase: -5 }).href).toBe(
      "/workspace/evaluation",
    );
  });

  it("reasonForPhase emits the canonical PHASE_LABELS label", () => {
    // Phase 3 label is "Market Research" — this pins the copy end-to-end.
    expect(reasonForPhase(3)).toContain("Phase 3");
    expect(reasonForPhase(3)).toContain("Market Research");
    // Phase 0 has its own dedicated copy.
    expect(reasonForPhase(0)).toMatch(/haven't started|evaluation/i);
  });
});
