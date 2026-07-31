import { describe, it, expect } from "vitest";
import {
  CEO_GOAL_TREE,
  getAgentGoal,
  getAllAgentGoals,
  getAgentCriteria,
  getAgentReportSections,
  type AgentGoal,
} from "./goal-tree";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";

// Colocated vitest for the pure CEO_GOAL_TREE registry + lookup helpers.
// Pins the shape and content invariants the orchestrator + report pipeline
// depend on so a silent rename of an agent id, a criterion key drift, or
// an accidentally-emptied KPI array surfaces here before it corrupts a
// founder-facing report section.

const SUBGOAL_AGENTS = [
  "cto",
  "cfo",
  "cpo",
  "cmo",
  "cro",
  "clo",
  "chro",
  "ciso",
  "cdo",
  "coo",
  "rnd",
] as const;

const VALID_RESEARCH_FREQUENCIES = new Set([
  "daily",
  "weekly-sun",
  "weekly-tue",
  "weekly-wed",
  "bi-weekly-sat",
  "bi-weekly-thu",
  "bi-weekly-fri",
  "monthly-1st-sat",
  "monthly-2nd-sat",
  "monthly-3rd-sat",
]);

describe("CEO_GOAL_TREE root", () => {
  it("names the CEO agent", () => {
    expect(CEO_GOAL_TREE.agent).toBe("ceo");
    expect(CEO_GOAL_TREE.id).toBe("ceo-master");
  });

  it("carries a non-empty title + mission", () => {
    expect(CEO_GOAL_TREE.title.trim().length).toBeGreaterThan(0);
    expect(CEO_GOAL_TREE.mission.trim().length).toBeGreaterThan(0);
  });

  it("cites the SCN framework in the mission", () => {
    expect(CEO_GOAL_TREE.mission).toMatch(/Validation.*Position.*Value.*Direction.*Capital/);
  });

  it("targets the A$1B unicorn goal in the mission", () => {
    expect(CEO_GOAL_TREE.mission).toMatch(/A\$1B/);
  });

  it("owns 4 top-level KPIs", () => {
    expect(CEO_GOAL_TREE.kpis).toHaveLength(4);
  });

  it("each KPI has metric/label/target/unit and a numeric target", () => {
    for (const kpi of CEO_GOAL_TREE.kpis) {
      expect(kpi.metric.trim().length).toBeGreaterThan(0);
      expect(kpi.label.trim().length).toBeGreaterThan(0);
      expect(kpi.unit.trim().length).toBeGreaterThan(0);
      expect(typeof kpi.target).toBe("number");
      expect(Number.isFinite(kpi.target)).toBe(true);
      expect(kpi.target).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not directly own any criteria (delegated to sub-agents)", () => {
    expect(CEO_GOAL_TREE.criteriaOwned).toEqual([]);
  });

  it("owns executive + board_memo report sections", () => {
    expect(CEO_GOAL_TREE.reportSections).toEqual(["executive", "board_memo"]);
  });

  it("has no direct skills — the CEO orchestrates rather than executes", () => {
    expect(CEO_GOAL_TREE.skills).toEqual([]);
  });

  it("weekly-sun research cadence with ≥ 3 research topics", () => {
    expect(CEO_GOAL_TREE.researchFrequency).toBe("weekly-sun");
    expect(CEO_GOAL_TREE.researchTopics.length).toBeGreaterThanOrEqual(3);
  });
});

describe("subGoals structure", () => {
  it("has exactly 11 sub-agents in the shipped order", () => {
    expect(CEO_GOAL_TREE.subGoals).toHaveLength(11);
    expect(CEO_GOAL_TREE.subGoals.map((g) => g.agent)).toEqual([...SUBGOAL_AGENTS]);
  });

  it("no sub-agent id is duplicated", () => {
    const agents = CEO_GOAL_TREE.subGoals.map((g) => g.agent);
    expect(new Set(agents).size).toBe(agents.length);
  });

  it("no goal id is duplicated across the tree", () => {
    const ids = [CEO_GOAL_TREE.id, ...CEO_GOAL_TREE.subGoals.map((g) => g.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SUBGOAL_AGENTS)("%s goal carries id/title/mission and ≥ 1 KPI", (agent) => {
    const goal = CEO_GOAL_TREE.subGoals.find((g) => g.agent === agent)!;
    expect(goal.id).toMatch(new RegExp(`^${agent}-goal$`));
    expect(goal.title.trim().length).toBeGreaterThan(0);
    expect(goal.mission.trim().length).toBeGreaterThan(0);
    expect(goal.kpis.length).toBeGreaterThanOrEqual(1);
  });

  it.each(SUBGOAL_AGENTS)("%s goal has no nested subGoals (flat tree)", (agent) => {
    const goal = CEO_GOAL_TREE.subGoals.find((g) => g.agent === agent)!;
    expect(goal.subGoals).toEqual([]);
  });

  it.each(SUBGOAL_AGENTS)("%s goal uses a known research cadence token", (agent) => {
    const goal = CEO_GOAL_TREE.subGoals.find((g) => g.agent === agent)!;
    expect(VALID_RESEARCH_FREQUENCIES.has(goal.researchFrequency)).toBe(true);
  });

  it.each(SUBGOAL_AGENTS)("%s goal has ≥ 1 research topic", (agent) => {
    const goal = CEO_GOAL_TREE.subGoals.find((g) => g.agent === agent)!;
    expect(goal.researchTopics.length).toBeGreaterThanOrEqual(1);
    for (const topic of goal.researchTopics) {
      expect(topic.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("KPI numeric contract", () => {
  it("every KPI across the tree has a finite non-negative target", () => {
    for (const goal of getAllAgentGoals()) {
      for (const kpi of goal.kpis) {
        expect(Number.isFinite(kpi.target)).toBe(true);
        expect(kpi.target).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("no duplicate KPI metric within a single goal", () => {
    for (const goal of getAllAgentGoals()) {
      const metrics = goal.kpis.map((k) => k.metric);
      expect(new Set(metrics).size).toBe(metrics.length);
    }
  });
});

describe("criteriaOwned coverage", () => {
  it("every claimed criterion resolves to a canonical CriterionKey", () => {
    const known = new Set<string>(CRITERION_KEYS);
    for (const goal of CEO_GOAL_TREE.subGoals) {
      for (const key of goal.criteriaOwned) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it("cto owns code_git + website", () => {
    expect(getAgentCriteria("cto")).toEqual(["code_git", "website"]);
  });

  it("cfo owns revenue + dataroom", () => {
    expect(getAgentCriteria("cfo")).toEqual(["revenue", "dataroom"]);
  });

  it("cpo owns idea + roadmap", () => {
    expect(getAgentCriteria("cpo")).toEqual(["idea", "roadmap"]);
  });

  it("cmo owns market + gtm_strategy + website", () => {
    expect(getAgentCriteria("cmo")).toEqual(["market", "gtm_strategy", "website"]);
  });

  it("cro owns customer_size", () => {
    expect(getAgentCriteria("cro")).toEqual(["customer_size"]);
  });

  it("clo owns documents + dataroom", () => {
    expect(getAgentCriteria("clo")).toEqual(["documents", "dataroom"]);
  });

  it("chro owns founder_profile + team + team_structure", () => {
    expect(getAgentCriteria("chro")).toEqual(["founder_profile", "team", "team_structure"]);
  });

  it("ciso owns code_git", () => {
    expect(getAgentCriteria("ciso")).toEqual(["code_git"]);
  });

  it("coo owns team_structure", () => {
    expect(getAgentCriteria("coo")).toEqual(["team_structure"]);
  });

  it("cdo + rnd have no directly-owned criteria (cross-cutting agents)", () => {
    expect(getAgentCriteria("cdo")).toEqual([]);
    expect(getAgentCriteria("rnd")).toEqual([]);
  });

  it("every CriterionKey is claimed by at least one agent", () => {
    const owned = new Set<string>();
    for (const goal of CEO_GOAL_TREE.subGoals) {
      for (const key of goal.criteriaOwned) owned.add(key);
    }
    for (const key of CRITERION_KEYS) {
      expect(owned.has(key)).toBe(true);
    }
  });
});

describe("reportSections coverage", () => {
  it("cfo owns revenue + valuation + au_market sections", () => {
    expect(getAgentReportSections("cfo")).toEqual(["revenue", "valuation", "au_market"]);
  });

  it("cto owns code + cybersecurity sections", () => {
    expect(getAgentReportSections("cto")).toEqual(["code", "cybersecurity"]);
  });

  it("clo owns documents + dataroom + risk sections", () => {
    expect(getAgentReportSections("clo")).toEqual(["documents", "dataroom", "risk"]);
  });

  it("chro owns founder + team + org sections", () => {
    expect(getAgentReportSections("chro")).toEqual(["founder", "team", "org"]);
  });

  it("coo owns action_plan section", () => {
    expect(getAgentReportSections("coo")).toEqual(["action_plan"]);
  });

  it("cmo owns market + website + gtm + competitive sections", () => {
    expect(getAgentReportSections("cmo")).toEqual(["market", "website", "gtm", "competitive"]);
  });

  it("rnd has no report sections (feeds intelligence to CMO/CPO)", () => {
    expect(getAgentReportSections("rnd")).toEqual([]);
  });

  it("every reportSection across the tree is a non-empty string", () => {
    for (const goal of getAllAgentGoals()) {
      for (const section of goal.reportSections) {
        expect(section.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("skills coverage", () => {
  it("every skill token starts with a slash (matches /skill invocation)", () => {
    for (const goal of getAllAgentGoals()) {
      for (const skill of goal.skills) {
        expect(skill.startsWith("/")).toBe(true);
      }
    }
  });

  it("cto exposes /cto + /perf-audit + /security-audit", () => {
    const goal = getAgentGoal("cto")!;
    expect(goal.skills).toEqual(["/cto", "/perf-audit", "/security-audit"]);
  });

  it("cfo exposes /cfo + revenue + unit-economics + investor-relations skills", () => {
    const goal = getAgentGoal("cfo")!;
    expect(goal.skills).toContain("/cfo");
    expect(goal.skills).toContain("/investor-relations");
  });

  it("rnd exposes /rnd + /deep-research", () => {
    const goal = getAgentGoal("rnd")!;
    expect(goal.skills).toEqual(["/rnd", "/deep-research"]);
  });
});

describe("getAgentGoal()", () => {
  it("resolves the CEO on 'ceo'", () => {
    const goal = getAgentGoal("ceo");
    expect(goal).toBe(CEO_GOAL_TREE);
  });

  it.each(SUBGOAL_AGENTS)("resolves the %s sub-agent", (agent) => {
    const goal = getAgentGoal(agent);
    expect(goal).toBeDefined();
    expect(goal!.agent).toBe(agent);
  });

  it("returns undefined for an unknown agent id", () => {
    expect(getAgentGoal("cxo-nope")).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(getAgentGoal("")).toBeUndefined();
  });
});

describe("getAllAgentGoals()", () => {
  it("returns the CEO first followed by all 11 sub-agents in shipped order", () => {
    const all = getAllAgentGoals();
    expect(all).toHaveLength(12);
    expect(all[0]).toBe(CEO_GOAL_TREE);
    expect(all.slice(1).map((g) => g.agent)).toEqual([...SUBGOAL_AGENTS]);
  });

  it("every returned goal has a matching AgentGoal shape", () => {
    for (const goal of getAllAgentGoals()) {
      const g: AgentGoal = goal;
      expect(typeof g.id).toBe("string");
      expect(typeof g.agent).toBe("string");
      expect(Array.isArray(g.kpis)).toBe(true);
      expect(Array.isArray(g.subGoals)).toBe(true);
    }
  });
});

describe("getAgentCriteria() + getAgentReportSections() defaults", () => {
  it("returns [] for an unknown agent id", () => {
    expect(getAgentCriteria("bogus")).toEqual([]);
    expect(getAgentReportSections("bogus")).toEqual([]);
  });

  it("returns [] for the empty string", () => {
    expect(getAgentCriteria("")).toEqual([]);
    expect(getAgentReportSections("")).toEqual([]);
  });
});
