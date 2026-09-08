// Colocated tests for AGENT_PLAN.
//
// The plan (Block 2) fixes the stage→agent mapping used by the /analyze
// cost modal and lineup UI. These tests pin the invariants that make the
// pricing story truthful — you cannot silently start charging a founder
// for CISO time on an idea-stage report.

import { describe, expect, it } from "vitest";
import {
  AGENT_PLAN,
  MODEL_TIER_ID,
  MODEL_TIER_LABEL,
  allPlannedAgentRoles,
  plannedAgentsFor,
} from "./agent-plan";
import { CANONICAL_STAGES } from "@/lib/journey-vocabulary";

describe("AGENT_PLAN — invariants", () => {
  it("has a plan for every canonical stage", () => {
    for (const stage of CANONICAL_STAGES) {
      expect(AGENT_PLAN[stage], `missing plan for ${stage}`).toBeDefined();
      expect(AGENT_PLAN[stage].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("always includes the CEO synthesis agent", () => {
    for (const stage of CANONICAL_STAGES) {
      const roles = AGENT_PLAN[stage].map((p) => p.agent);
      expect(roles, `${stage} missing ceo`).toContain("ceo");
    }
  });

  it("idea stage excludes CISO and CDO", () => {
    const roles = AGENT_PLAN.idea.map((p) => p.agent);
    expect(roles).not.toContain("ciso");
    expect(roles).not.toContain("cdo");
    // But it MUST include CPO — idea-clarify is the whole point.
    expect(roles).toContain("cpo");
  });

  it("scale (series_b_c) and later include CISO for security posture", () => {
    for (const stage of ["series_b_c", "late_stage", "public_exit"] as const) {
      const roles = AGENT_PLAN[stage].map((p) => p.agent);
      expect(roles, `${stage} missing ciso`).toContain("ciso");
    }
  });

  it("revenue stages assign OPUS tier to the CFO (deep valuation)", () => {
    for (const stage of ["seed", "series_a", "series_b_c", "late_stage", "public_exit"] as const) {
      const cfo = AGENT_PLAN[stage].find((p) => p.agent === "cfo");
      expect(cfo?.tier, `${stage} cfo tier`).toBe("opus");
    }
  });

  it("idea-stage CFO uses the cheap haiku tier (no deep valuation)", () => {
    const cfo = AGENT_PLAN.idea.find((p) => p.agent === "cfo");
    expect(cfo?.tier).toBe("haiku");
  });
});

describe("plannedAgentsFor", () => {
  it("returns a defensive copy", () => {
    const first = plannedAgentsFor("idea");
    first[0].tier = "opus";
    const second = plannedAgentsFor("idea");
    expect(second[0].tier).not.toBe("opus");
  });

  it("falls back to idea for an unknown stage", () => {
    // @ts-expect-error — intentionally forcing bad key for defensive path.
    const list = plannedAgentsFor("something-else");
    expect(list).toEqual(plannedAgentsFor("idea"));
  });
});

describe("MODEL_TIER metadata", () => {
  it("provides labels and ids for all tiers", () => {
    for (const tier of ["opus", "sonnet", "haiku"] as const) {
      expect(MODEL_TIER_LABEL[tier]).toMatch(/[A-Za-z]/);
      expect(MODEL_TIER_ID[tier]).toMatch(/claude/);
    }
  });
});

describe("allPlannedAgentRoles", () => {
  it("contains every role that appears in any stage", () => {
    const roles = allPlannedAgentRoles();
    // Every role hit at some point across the funnel.
    for (const role of ["ceo", "cfo", "cmo", "cpo", "cro", "cto", "clo", "chro", "ciso", "cdo", "coo"] as const) {
      expect(roles, `role ${role} missing from plan`).toContain(role);
    }
  });
});
