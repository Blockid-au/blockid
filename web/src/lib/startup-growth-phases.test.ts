import { describe, it, expect } from "vitest";
import {
  GROWTH_PHASES,
  getCurrentPhase,
  getPhaseProgress,
  computePhaseProgress,
  getNextActionableSteps,
} from "./startup-growth-phases";
import { GROWTH_PHASE_TO_STAGE } from "./journey-map";
import { CANONICAL_STAGE_LABELS } from "./journey-vocabulary";

// Colocated vitest for `web/src/lib/startup-growth-phases.ts` — the pure
// 12-phase founder-journey registry consumed by the SVI report journey map,
// the workspace phase tracker, and every `getCurrentPhase` caller in the
// atlassian-standard-mapping goal (docs/plans/atlassian-standard-mapping-goal.md
// §1 phase-gap-matrix). Pins registry invariants + phase resolution +
// progress arithmetic + next-actionable-steps ordering so a silent rename of
// a step id, a widening of an sviStageRange, or a drift between the 12-phase
// ids and the canonical 8-stage bucket map surfaces at unit-test time.

describe("GROWTH_PHASES registry", () => {
  it("ships exactly 12 phases (matches the 12-phase founder-journey framework)", () => {
    expect(GROWTH_PHASES).toHaveLength(12);
  });

  it("order field is consecutive 1..12 with no gaps or duplicates", () => {
    const orders = GROWTH_PHASES.map((p) => p.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("every phase id is unique", () => {
    const ids = GROWTH_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every phase carries non-empty title / subtitle / leadAgent / color", () => {
    for (const p of GROWTH_PHASES) {
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.subtitle.trim().length).toBeGreaterThan(0);
      expect(p.leadAgent.trim().length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("every phase ships >=3 keyQuestions and >=3 deliverables", () => {
    for (const p of GROWTH_PHASES) {
      expect(p.keyQuestions.length).toBeGreaterThanOrEqual(3);
      expect(p.deliverables.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("every phase ships exactly 5 steps with unique ids inside the phase", () => {
    for (const p of GROWTH_PHASES) {
      expect(p.steps).toHaveLength(5);
      const stepIds = p.steps.map((s) => s.id);
      expect(new Set(stepIds).size).toBe(stepIds.length);
      for (const s of p.steps) {
        expect(s.id.trim().length).toBeGreaterThan(0);
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect(s.description.trim().length).toBeGreaterThan(0);
        expect(s.agentHint.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("step ids are globally unique across all 12 phases (60 total)", () => {
    const allIds = GROWTH_PHASES.flatMap((p) => p.steps.map((s) => s.id));
    expect(allIds).toHaveLength(60);
    expect(new Set(allIds).size).toBe(60);
  });

  it("sviStageRange is [low, high] with low <= high on every phase", () => {
    for (const p of GROWTH_PHASES) {
      const [low, high] = p.sviStageRange;
      expect(low).toBeLessThanOrEqual(high);
      expect(Number.isFinite(low)).toBe(true);
      expect(Number.isFinite(high)).toBe(true);
    }
  });

  it("supportAgents is a non-empty array and never includes the leadAgent", () => {
    for (const p of GROWTH_PHASES) {
      expect(p.supportAgents.length).toBeGreaterThan(0);
      expect(p.supportAgents).not.toContain(p.leadAgent);
    }
  });

  it("every phase id maps to a canonical stage via GROWTH_PHASE_TO_STAGE (no orphans)", () => {
    for (const p of GROWTH_PHASES) {
      const stage = GROWTH_PHASE_TO_STAGE[p.id as keyof typeof GROWTH_PHASE_TO_STAGE];
      expect(stage).toBeDefined();
    }
  });

  it("first phase is vision (sviStage 0-1) and last is funding (sviStage 4-7)", () => {
    expect(GROWTH_PHASES[0].id).toBe("vision");
    expect(GROWTH_PHASES[0].sviStageRange).toEqual([0, 1]);
    expect(GROWTH_PHASES[11].id).toBe("funding");
    expect(GROWTH_PHASES[11].sviStageRange).toEqual([4, 7]);
  });
});

describe("getCurrentPhase", () => {
  it("returns the last matching phase when multiple ranges overlap at sviStage=0", () => {
    // vision [0,1] and customer_dev [0,2] both match; filter+[length-1] picks
    // the last-declared match — customer_dev.
    const phase = getCurrentPhase(0);
    expect(phase.id).toBe("customer_dev");
    expect(phase.order).toBe(2);
  });

  it("returns the last matching phase when multiple ranges overlap at sviStage=3", () => {
    // sviStage=3 falls inside pitch[1,3], mentor_review[1,3], legal_equity[2,4],
    // go_to_market[2,5], product_dev[2,5], investor_review[3,5], team[3,6].
    // funding[4,7] does not qualify. filter+[length-1] picks team (order 10).
    const phase = getCurrentPhase(3);
    expect(phase.id).toBe("team");
    expect(phase.order).toBe(10);
  });

  it("returns the last matching phase when sviStage=7 (funding is the top range)", () => {
    const phase = getCurrentPhase(7);
    expect(phase.id).toBe("funding");
  });

  it("falls back to the first phase (vision) when sviStage overflows every range", () => {
    // sviStage=99 has no matching range → filter yields [] → phase = GROWTH_PHASES[0]
    const phase = getCurrentPhase(99);
    expect(phase.id).toBe("vision");
  });

  it("bucketToCanonical=true replaces title/subtitle with canonical labels but preserves id/order", () => {
    const phase = getCurrentPhase(0, { bucketToCanonical: true });
    // sviStage=0 resolves to customer_dev (see overlap test above).
    expect(phase.id).toBe("customer_dev");
    expect(phase.order).toBe(2);
    const expected = CANONICAL_STAGE_LABELS[GROWTH_PHASE_TO_STAGE.customer_dev];
    expect(phase.title).toBe(expected.label_en);
    expect(phase.subtitle).toBe(expected.label_vi);
  });

  it("bucketToCanonical=false (default) preserves the fine-grained phase copy", () => {
    const phase = getCurrentPhase(0);
    expect(phase.title).toBe("Customer Development");
    expect(phase.subtitle).toBe("Analyze your customer feedback");
  });

  it("bucketToCanonical preserves steps + agents (only display copy is collapsed)", () => {
    const raw = getCurrentPhase(0);
    const bucketed = getCurrentPhase(0, { bucketToCanonical: true });
    expect(bucketed.steps).toEqual(raw.steps);
    expect(bucketed.leadAgent).toBe(raw.leadAgent);
    expect(bucketed.supportAgents).toEqual(raw.supportAgents);
    expect(bucketed.deliverables).toEqual(raw.deliverables);
  });
});

describe("getPhaseProgress", () => {
  it("partitions all 12 phases across completed / current / upcoming (no leaks)", () => {
    const { completed, current, upcoming } = getPhaseProgress(3);
    expect(completed.length + current.length + upcoming.length).toBe(12);
  });

  it("sviStage=0 leaves nothing completed and vision + customer_dev current", () => {
    const { completed, current, upcoming } = getPhaseProgress(0);
    expect(completed).toHaveLength(0);
    expect(current.map((p) => p.id).sort()).toEqual(["customer_dev", "vision"]);
    expect(upcoming.length).toBe(10);
  });

  it("sviStage=8 completes every phase (funding tops out at 7)", () => {
    const { completed, current, upcoming } = getPhaseProgress(8);
    expect(completed).toHaveLength(12);
    expect(current).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it("sviStage=2 places vision into completed (range [0,1]) and customer_dev into current", () => {
    const { completed, current } = getPhaseProgress(2);
    expect(completed.map((p) => p.id)).toContain("vision");
    expect(current.map((p) => p.id)).toContain("customer_dev");
    expect(current.map((p) => p.id)).not.toContain("funding");
  });
});

describe("computePhaseProgress", () => {
  it("returns one row per phase in registry order", () => {
    const rows = computePhaseProgress({});
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.phaseId)).toEqual(GROWTH_PHASES.map((p) => p.id));
  });

  it("empty input yields not_started rows with 0% completion", () => {
    const rows = computePhaseProgress({});
    for (const r of rows) {
      expect(r.status).toBe("not_started");
      expect(r.completionPct).toBe(0);
      expect(r.stepsCompleted).toBe(0);
      expect(r.stepsTotal).toBe(5);
    }
  });

  it("partial completion marks status=in_progress with rounded percentage", () => {
    const rows = computePhaseProgress({ vision: ["v1", "v2"] });
    const vision = rows.find((r) => r.phaseId === "vision")!;
    expect(vision.status).toBe("in_progress");
    expect(vision.stepsCompleted).toBe(2);
    expect(vision.completionPct).toBe(40); // 2/5 rounded
  });

  it("all steps in a phase completed marks status=completed at 100%", () => {
    const rows = computePhaseProgress({ vision: ["v1", "v2", "v3", "v4", "v5"] });
    const vision = rows.find((r) => r.phaseId === "vision")!;
    expect(vision.status).toBe("completed");
    expect(vision.completionPct).toBe(100);
    expect(vision.stepsCompleted).toBe(5);
  });

  it("unknown step ids for a phase are filtered out (never inflate stepsCompleted)", () => {
    const rows = computePhaseProgress({ vision: ["v1", "not-a-real-step", "another-bogus"] });
    const vision = rows.find((r) => r.phaseId === "vision")!;
    expect(vision.stepsCompleted).toBe(1);
    expect(vision.completionPct).toBe(20);
  });

  it("step ids from other phases are filtered out (per-phase scope guard)", () => {
    // "cd1" is a customer_dev step, not a vision step — must not count for vision
    const rows = computePhaseProgress({ vision: ["cd1", "cd2"] });
    const vision = rows.find((r) => r.phaseId === "vision")!;
    expect(vision.stepsCompleted).toBe(0);
    expect(vision.status).toBe("not_started");
  });
});

describe("getNextActionableSteps", () => {
  it("default limit of 5 caps the result length on an empty-progress input", () => {
    const result = getNextActionableSteps({});
    expect(result).toHaveLength(5);
  });

  it("returns steps from the earliest phase first (order-preserving walk)", () => {
    const result = getNextActionableSteps({});
    expect(result[0].phase.id).toBe("vision");
    expect(result[0].step.id).toBe("v1");
    expect(result.map((r) => r.step.id)).toEqual(["v1", "v2", "v3", "v4", "v5"]);
  });

  it("skips completed steps and advances to the next uncompleted one in the same phase", () => {
    const result = getNextActionableSteps({ vision: ["v1", "v2"] }, 3);
    expect(result[0].step.id).toBe("v3");
    expect(result[1].step.id).toBe("v4");
    expect(result[2].step.id).toBe("v5");
  });

  it("advances into the next phase once every step of the current phase is complete", () => {
    const result = getNextActionableSteps(
      { vision: ["v1", "v2", "v3", "v4", "v5"] },
      2,
    );
    expect(result[0].phase.id).toBe("customer_dev");
    expect(result[0].step.id).toBe("cd1");
    expect(result[1].step.id).toBe("cd2");
  });

  it("caller-supplied limit=1 returns exactly one row", () => {
    const result = getNextActionableSteps({}, 1);
    expect(result).toHaveLength(1);
    expect(result[0].step.id).toBe("v1");
  });

  it("returns an empty array when every step across every phase is complete", () => {
    const allComplete: Record<string, string[]> = {};
    for (const p of GROWTH_PHASES) {
      allComplete[p.id] = p.steps.map((s) => s.id);
    }
    expect(getNextActionableSteps(allComplete)).toHaveLength(0);
  });

  it("limit larger than the remaining uncompleted step count returns all remaining without throwing", () => {
    // Complete every phase except the last two steps of funding
    const stepsData: Record<string, string[]> = {};
    for (const p of GROWTH_PHASES) {
      if (p.id === "funding") {
        stepsData[p.id] = p.steps.slice(0, 3).map((s) => s.id);
      } else {
        stepsData[p.id] = p.steps.map((s) => s.id);
      }
    }
    const result = getNextActionableSteps(stepsData, 999);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.phase.id === "funding")).toBe(true);
  });
});
