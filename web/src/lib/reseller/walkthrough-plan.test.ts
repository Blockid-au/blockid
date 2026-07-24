import { describe, expect, it } from "vitest";
import {
  REQUIRED_TRACK_A_PHASES,
  WALKTHROUGH_ROLES,
  WALKTHROUGH_STEPS,
  WALKTHROUGH_TRACKS,
  phasesCovered,
  stepsByRole,
  stepsByTrack,
  summariseWalkthroughPlan,
  validateWalkthroughPlan,
  type WalkthroughStep,
} from "./walkthrough-plan";

describe("WALKTHROUGH_STEPS contract", () => {
  it("carries at least one step for each of founder/reseller/admin", () => {
    for (const role of WALKTHROUGH_ROLES) {
      expect(stepsByRole(role).length).toBeGreaterThan(0);
    }
  });

  it("carries at least one step for each of Track A and Track B", () => {
    for (const track of WALKTHROUGH_TRACKS) {
      expect(stepsByTrack(track).length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate step ids", () => {
    const ids = WALKTHROUGH_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups the plan by role in contiguous blocks (founder → reseller → admin)", () => {
    const roleOrder: string[] = [];
    for (const step of WALKTHROUGH_STEPS) {
      if (roleOrder[roleOrder.length - 1] !== step.role) {
        roleOrder.push(step.role);
      }
    }
    expect(roleOrder).toEqual(["founder", "reseller", "admin"]);
  });

  it("every path starts with a leading slash", () => {
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.path.startsWith("/"), step.id).toBe(true);
    }
  });

  it("every step has non-empty action + assert strings", () => {
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.action.length, step.id).toBeGreaterThan(0);
      expect(step.assert.length, step.id).toBeGreaterThan(0);
    }
  });
});

describe("REQUIRED_TRACK_A_PHASES coverage", () => {
  it("every required Track A phase has at least one step", () => {
    const covered = new Set(WALKTHROUGH_STEPS.map((s) => s.phase));
    for (const phase of REQUIRED_TRACK_A_PHASES) {
      expect(covered.has(phase), phase).toBe(true);
    }
  });

  it("Track B has at least one showcase phase covered", () => {
    const trackB = stepsByTrack("B");
    expect(trackB.some((s) => s.phase.startsWith("B"))).toBe(true);
  });
});

describe("phasesCovered", () => {
  it("returns sorted-unique phase references only", () => {
    const covered = phasesCovered();
    const sortedCopy = [...covered].sort();
    expect(covered).toEqual(sortedCopy);
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("every entry matches the P<n> or B<n> shape", () => {
    for (const phase of phasesCovered()) {
      expect(/^(P\d{1,2}|B\d{1,2})$/.test(phase), phase).toBe(true);
    }
  });
});

describe("summariseWalkthroughPlan", () => {
  it("total matches the sum of role counts", () => {
    const s = summariseWalkthroughPlan();
    const roleSum = s.stepsByRole.founder + s.stepsByRole.reseller + s.stepsByRole.admin;
    expect(roleSum).toBe(s.totalSteps);
  });

  it("total matches the sum of track counts", () => {
    const s = summariseWalkthroughPlan();
    expect(s.stepsByTrack.A + s.stepsByTrack.B).toBe(s.totalSteps);
  });

  it("phasesCovered equals the sorted set of phase references", () => {
    const s = summariseWalkthroughPlan();
    expect(s.phasesCovered).toEqual(phasesCovered());
  });
});

describe("validateWalkthroughPlan", () => {
  it("returns zero issues for the canonical plan", () => {
    expect(validateWalkthroughPlan()).toEqual([]);
  });

  it("flags empty ids", () => {
    const bad: WalkthroughStep[] = [
      { id: "", role: "founder", track: "A", phase: "P2", path: "/x", action: "a", assert: "b" },
    ];
    const issues = validateWalkthroughPlan(bad);
    expect(issues.some((i) => i.reason === "empty id")).toBe(true);
  });

  it("flags duplicate ids", () => {
    const dup: WalkthroughStep[] = [
      { id: "x", role: "founder", track: "A", phase: "P2", path: "/x", action: "a", assert: "b" },
      { id: "x", role: "founder", track: "A", phase: "P2", path: "/y", action: "a", assert: "b" },
    ];
    const issues = validateWalkthroughPlan(dup);
    expect(issues.some((i) => i.reason === "duplicate id")).toBe(true);
  });

  it("flags an unknown role", () => {
    const bad = [
      { id: "x", role: "ghost", track: "A", phase: "P2", path: "/x", action: "a", assert: "b" },
    ] as unknown as WalkthroughStep[];
    const issues = validateWalkthroughPlan(bad);
    expect(issues.some((i) => i.reason.startsWith("unknown role"))).toBe(true);
  });

  it("flags a malformed phase reference", () => {
    const bad: WalkthroughStep[] = [
      { id: "x", role: "founder", track: "A", phase: "PHASE-2", path: "/x", action: "a", assert: "b" },
    ];
    const issues = validateWalkthroughPlan(bad);
    expect(issues.some((i) => i.reason.includes("not in P<n> / B<n> shape"))).toBe(true);
  });

  it("flags a path without a leading slash", () => {
    const bad: WalkthroughStep[] = [
      { id: "x", role: "founder", track: "A", phase: "P2", path: "reseller", action: "a", assert: "b" },
    ];
    const issues = validateWalkthroughPlan(bad);
    expect(issues.some((i) => i.reason.includes("must start with /"))).toBe(true);
  });

  it("flags empty assert", () => {
    const bad: WalkthroughStep[] = [
      { id: "x", role: "founder", track: "A", phase: "P2", path: "/x", action: "a", assert: "" },
    ];
    const issues = validateWalkthroughPlan(bad);
    expect(issues.some((i) => i.reason === "empty assert")).toBe(true);
  });
});
