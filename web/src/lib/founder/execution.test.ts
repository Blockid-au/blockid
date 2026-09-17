// Colocated vitest for the founder execution rubric (G14-S37).
//
// Pins: the rubric table (exits 30 / raises 15 / years 20 / roles 15 /
// full-time 10 / together 5 / GitHub 5), determinism (same profile → same
// output, twice), the self-reported cap at 70 and the two ways it lifts
// (evaluator `references_checked`, LinkedIn parser agreement), the
// precedence of the profile over the regex flags in
// mergeExecutionIntoSignals, and the no-profile path leaving the signals
// untouched.

import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type FounderProfile } from "@/lib/founder-profile-types";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import {
  EXECUTION_CAP_SELF_REPORTED,
  founderExecutionSignals,
  linkedinAgrees,
  mergeExecutionIntoSignals,
  toExecutionSummary,
} from "./execution";

function profile(over: Partial<FounderProfile> = {}): FounderProfile {
  return { ...EMPTY_PROFILE("acct-1", "founder@example.com"), ...over };
}

/** A profile that maxes every self-reported row (95 raw + GitHub URL 1 = 96). */
function maxed(over: Partial<FounderProfile> = {}): FounderProfile {
  return profile({
    prior_exits: [
      { company: "Loom", year: 2020, type: "acquisition", value_band: "10m-50m" },
      { company: "Weave", year: 2016, type: "ipo", value_band: "50m+" },
    ],
    prior_raises: [{ company: "Loom", round: "series_b_plus", amount_aud_band: "20m+", year: 2019 }],
    years_in_domain: 12,
    roles: { ceo: "Ada", cto: "Charles", cpo: "Grace", cfo: "Alan" },
    full_time_pct: 100,
    worked_together_before: true,
    github_url: "https://github.com/ada",
    prev_employers: ["Atlassian", "Canva"],
    ...over,
  });
}

function regexSignals(over: Partial<SVIExtractedSignals> = {}): SVIExtractedSignals {
  return {
    hasCoFounder: false,
    founderExperience: "first-time",
    founderSectorFit: false,
    hasAdvisors: false,
    marketSize: "unknown",
    problemClarity: "vague",
    hasCustomerInterviews: false,
    isAIWrapper: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    hasSwitchingCosts: false,
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasWebsite: false,
    hasApp: false,
    hasUsers: false,
    hasRevenue: false,
    hasPayingCustomers: false,
    userCountBand: "none",
    revenueBand: "none",
    hasGrowthMetrics: false,
    hasCapTable: false,
    hasVesting: false,
    hasESOP: false,
    hasBoard: false,
    hasDataRoom: false,
    hasFinancials: false,
    hasBurnRate: false,
    hasRunway: false,
    hasPitchDeck: false,
    hasBusinessPlan: false,
    hasGrant: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasLegalDocs: false,
    evidenceLevel: "self_declared",
    ...over,
  } as SVIExtractedSignals;
}

const row = (r: ReturnType<typeof founderExecutionSignals>, key: string) => r.breakdown.find((b) => b.key === key)!;

describe("founderExecutionSignals — rubric table", () => {
  it("empty profile → 0 / 100, seven rows, every row 0, not capped, all sources founder", () => {
    const r = founderExecutionSignals(profile());
    expect(r.hasProfile).toBe(true);
    expect(r.structured).toBe(false);
    expect(r.rawScore).toBe(0);
    expect(r.executionScore).toBe(0);
    expect(r.capped).toBe(false);
    expect(r.breakdown.map((b) => [b.key, b.max])).toEqual([
      ["exits", 30],
      ["raises", 15],
      ["years_in_domain", 20],
      ["roles", 15],
      ["full_time", 10],
      ["worked_together", 5],
      ["github", 5],
    ]);
    expect(r.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
    expect(r.breakdown.every((b) => b.points === 0)).toBe(true);
    expect(r.sources).toEqual(["founder"]);
  });

  it.each([
    ["one acquisition", [{ company: "Loom", year: 2020, type: "acquisition", value_band: "1m-10m" }], 15],
    ["one IPO", [{ company: "Loom", year: 2020, type: "ipo", value_band: "50m+" }], 15],
    ["a shutdown counts 5 (honest learning)", [{ company: "Fail Co", year: 2018, type: "shutdown", value_band: "undisclosed" }], 5],
    ["two acquisitions hit the 30 cap", [{ company: "A", year: 2020, type: "acquisition", value_band: "undisclosed" }, { company: "B", year: 2021, type: "acquisition", value_band: "undisclosed" }], 30],
    ["three exits still cap at 30", [{ company: "A", year: null, type: "acquisition", value_band: "undisclosed" }, { company: "B", year: null, type: "ipo", value_band: "undisclosed" }, { company: "C", year: null, type: "shutdown", value_band: "undisclosed" }], 30],
    ["a blank company is ignored", [{ company: "  ", year: 2020, type: "acquisition", value_band: "1m-10m" }], 0],
  ] as const)("exits: %s", (_label, exits, points) => {
    const r = founderExecutionSignals(profile({ prior_exits: [...exits] as FounderProfile["prior_exits"] }));
    expect(row(r, "exits").points).toBe(points);
  });

  it.each([
    ["pre-seed", "pre_seed", 5],
    ["seed", "seed", 8],
    ["series A", "series_a", 12],
    ["series B+", "series_b_plus", 15],
    ["grant", "grant", 4],
    ["other", "other", 4],
  ] as const)("raises: %s", (_l, round, points) => {
    const r = founderExecutionSignals(profile({ prior_raises: [{ company: "X", round, amount_aud_band: "1m-5m", year: 2022 }] }));
    expect(row(r, "raises").points).toBe(points);
  });

  it("raises: two seeds sum to 15 (capped), seed + series A caps at 15", () => {
    const two = founderExecutionSignals(profile({ prior_raises: [{ company: "X", round: "seed", amount_aud_band: "<250k", year: 2020 }, { company: "Y", round: "seed", amount_aud_band: "<250k", year: 2022 }] }));
    expect(row(two, "raises").points).toBe(15);
    const mix = founderExecutionSignals(profile({ prior_raises: [{ company: "X", round: "seed", amount_aud_band: "<250k", year: 2020 }, { company: "Y", round: "series_a", amount_aud_band: "5m-20m", year: 2022 }] }));
    expect(row(mix, "raises").points).toBe(15);
  });

  it.each([
    [null, 0],
    [0, 0],
    [1, 2],
    [3, 6],
    [10, 20],
    [25, 20],
  ])("years in domain %s → %s points (2 / year, capped at 10 years)", (years, points) => {
    const r = founderExecutionSignals(profile({ years_in_domain: years }));
    expect(row(r, "years_in_domain").points).toBe(points);
  });

  it("role coverage: CEO 5 · CTO 5 · CPO 3 · CFO 2; blank names do not count", () => {
    expect(row(founderExecutionSignals(profile({ roles: { ceo: "Ada", cto: null, cpo: null, cfo: null } })), "roles").points).toBe(5);
    expect(row(founderExecutionSignals(profile({ roles: { ceo: "Ada", cto: "Charles", cpo: null, cfo: null } })), "roles").points).toBe(10);
    expect(row(founderExecutionSignals(profile({ roles: { ceo: null, cto: null, cpo: "Grace", cfo: "Alan" } })), "roles").points).toBe(5);
    expect(row(founderExecutionSignals(profile({ roles: { ceo: "Ada", cto: "Charles", cpo: "Grace", cfo: "Alan" } })), "roles").points).toBe(15);
    expect(row(founderExecutionSignals(profile({ roles: { ceo: "  ", cto: null, cpo: null, cfo: null } })), "roles").points).toBe(0);
  });

  it.each([
    [null, 0],
    [0, 0],
    [50, 5],
    [75, 8],
    [100, 10],
    [140, 10],
  ])("full-time %s% → %s points (pro rata, clamped)", (pct, points) => {
    expect(row(founderExecutionSignals(profile({ full_time_pct: pct })), "full_time").points).toBe(points);
  });

  it("worked together: true 5, false 0, null 0 (with distinct evidence text)", () => {
    expect(row(founderExecutionSignals(profile({ worked_together_before: true })), "worked_together").points).toBe(5);
    expect(row(founderExecutionSignals(profile({ worked_together_before: false })), "worked_together").points).toBe(0);
    expect(row(founderExecutionSignals(profile({ worked_together_before: false })), "worked_together").evidence).toMatch(/first time/);
    expect(row(founderExecutionSignals(profile({ worked_together_before: null })), "worked_together").evidence).toBe("not stated");
  });

  it("GitHub: URL only = 1 (source founder); connector ≥ 1 commit = 3, ≥ 10 = 5 (source github); connector 0 commits = 0", () => {
    const url = founderExecutionSignals(profile({ github_url: "https://github.com/ada" }));
    expect(row(url, "github").points).toBe(1);
    expect(row(url, "github").source).toBe("founder");
    const few = founderExecutionSignals(profile({ github_url: "https://github.com/ada" }), { github: { recentCommits30d: 4 } });
    expect(row(few, "github").points).toBe(3);
    expect(row(few, "github").source).toBe("github");
    const many = founderExecutionSignals(profile(), { github: { recentCommits30d: 12, publicRepos: 3 } });
    expect(row(many, "github").points).toBe(5);
    expect(row(many, "github").evidence).toMatch(/12 commits/);
    const idle = founderExecutionSignals(profile({ github_url: "https://github.com/ada" }), { github: { recentCommits30d: 0 } });
    expect(row(idle, "github").points).toBe(0);
  });

  it("the maxed self-reported profile scores 96 raw and is capped to 70", () => {
    const r = founderExecutionSignals(maxed());
    expect(r.rawScore).toBe(96);
    expect(r.capped).toBe(true);
    expect(r.executionScore).toBe(EXECUTION_CAP_SELF_REPORTED);
    expect(r.capReason).toMatch(/capped at 70/);
    expect(r.structured).toBe(true);
  });
});

describe("founderExecutionSignals — determinism", () => {
  it("same profile → byte-identical output, twice (and independent of key order)", () => {
    const a = founderExecutionSignals(maxed(), { github: { recentCommits30d: 12 } });
    const b = founderExecutionSignals(maxed(), { github: { recentCommits30d: 12 } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const shuffled = { ...maxed() };
    const c = founderExecutionSignals(Object.fromEntries(Object.entries(shuffled).reverse()) as unknown as FounderProfile, { github: { recentCommits30d: 12 } });
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it("does not mutate the profile it scores", () => {
    const p = maxed();
    const snapshot = JSON.stringify(p);
    founderExecutionSignals(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe("founderExecutionSignals — cap and lift", () => {
  it("a self-reported score ≤ 70 is not marked capped (nothing was clipped)", () => {
    const r = founderExecutionSignals(profile({ years_in_domain: 10, roles: { ceo: "Ada", cto: "Charles", cpo: null, cfo: null }, full_time_pct: 100 }));
    expect(r.rawScore).toBe(40);
    expect(r.capped).toBe(false);
    expect(r.capReason).toBeUndefined();
  });

  it("evaluator references_checked lifts the cap", () => {
    const r = founderExecutionSignals(maxed(), { evaluatorFlags: { references_checked: true } });
    expect(r.capped).toBe(false);
    expect(r.executionScore).toBe(96);
    expect(r.capLiftedBy).toBe("references_checked");
  });

  it("other evaluator flags alone (full_time, complementary_skills, key_person_risk) do NOT lift the cap", () => {
    const r = founderExecutionSignals(maxed(), { evaluatorFlags: { full_time: true, complementary_skills: true, key_person_risk: false } });
    expect(r.capped).toBe(true);
    expect(r.executionScore).toBe(70);
  });

  it("LinkedIn parser agreement on years (±1) lifts the cap", () => {
    const r = founderExecutionSignals(maxed({ years_in_domain: 12 }), { linkedin: { yearsInDomain: 11, priorCompanies: [], exits: 0 } });
    expect(r.capped).toBe(false);
    expect(r.capLiftedBy).toBe("linkedin_parser");
    const off = founderExecutionSignals(maxed({ years_in_domain: 12 }), { linkedin: { yearsInDomain: 5, priorCompanies: [], exits: 0 } });
    expect(off.capped).toBe(true);
  });

  it("LinkedIn parser agreement on a prior employer lifts the cap (case / punctuation insensitive)", () => {
    const r = founderExecutionSignals(maxed({ years_in_domain: 12 }), { linkedin: { yearsInDomain: null, priorCompanies: ["Canva Pty Ltd"], exits: 0 } });
    expect(r.capped).toBe(false);
    expect(linkedinAgrees({ years_in_domain: null, prev_employers: ["atlassian"] }, { yearsInDomain: null, priorCompanies: ["ATLASSIAN"], exits: 0 })).toBe(true);
    expect(linkedinAgrees({ years_in_domain: null, prev_employers: ["Canva"] }, { yearsInDomain: null, priorCompanies: ["Stripe"], exits: 0 })).toBe(false);
    expect(linkedinAgrees({ years_in_domain: null, prev_employers: [] }, null)).toBe(false);
  });

  it("fields imported from the LinkedIn parser (execution_source = linkedin_parser) count as confirmed", () => {
    const r = founderExecutionSignals(maxed({ execution_source: { years_in_domain: "linkedin_parser" } }));
    expect(r.capped).toBe(false);
    expect(r.capLiftedBy).toBe("linkedin_parser");
    expect(row(r, "years_in_domain").source).toBe("linkedin_parser");
    expect(r.sources).toEqual(expect.arrayContaining(["founder", "linkedin_parser"]));
  });
});

describe("founderExecutionSignals — derived founder flags", () => {
  it("serial when an acquisition / IPO exists; experienced on 10+ years, a raise or a shutdown; first-time otherwise", () => {
    expect(founderExecutionSignals(profile({ prior_exits: [{ company: "A", year: 2020, type: "acquisition", value_band: "undisclosed" }] })).founderExperience).toBe("serial");
    expect(founderExecutionSignals(profile({ years_in_domain: 10 })).founderExperience).toBe("experienced");
    expect(founderExecutionSignals(profile({ prior_raises: [{ company: "A", round: "seed", amount_aud_band: "<250k", year: 2020 }] })).founderExperience).toBe("experienced");
    expect(founderExecutionSignals(profile({ prior_exits: [{ company: "A", year: 2020, type: "shutdown", value_band: "undisclosed" }] })).founderExperience).toBe("experienced");
    expect(founderExecutionSignals(profile({ years_in_domain: 3 })).founderExperience).toBe("first-time");
  });

  it("co-founder from the co_founders list OR two distinct named roles; sector fit from 2+ years or a real domain insight; advisors from the list", () => {
    expect(founderExecutionSignals(profile({ co_founders: [{ name: "Charles", role: "CTO" }] })).hasCoFounder).toBe(true);
    expect(founderExecutionSignals(profile({ roles: { ceo: "Ada", cto: "Charles", cpo: null, cfo: null } })).hasCoFounder).toBe(true);
    expect(founderExecutionSignals(profile({ roles: { ceo: "Ada", cto: "Ada", cpo: null, cfo: null } })).hasCoFounder).toBe(false);
    expect(founderExecutionSignals(profile({ years_in_domain: 2 })).founderSectorFit).toBe(true);
    expect(founderExecutionSignals(profile({ years_in_domain: 1 })).founderSectorFit).toBe(false);
    expect(founderExecutionSignals(profile({ domain_insight: "x".repeat(41) })).founderSectorFit).toBe(true);
    expect(founderExecutionSignals(profile({ advisors: [{ name: "M", role: "Advisor" }] })).hasAdvisors).toBe(true);
  });
});

describe("mergeExecutionIntoSignals — precedence", () => {
  it("no profile → the exact same signals object is returned (nothing overridden, no summary)", () => {
    const s = regexSignals({ founderExperience: "serial", hasCoFounder: true });
    const out = mergeExecutionIntoSignals(s, founderExecutionSignals(null));
    expect(out).toBe(s);
    expect(out.founderExecution).toBeUndefined();
    expect(mergeExecutionIntoSignals(s, null)).toBe(s);
  });

  it("structured profile → the profile's founderExperience overrides the regex (regex said serial, profile says first-time)", () => {
    const p = profile({ years_in_domain: 3, full_time_pct: 100 });
    const s = regexSignals({ founderExperience: "serial" });
    const out = mergeExecutionIntoSignals(s, founderExecutionSignals(p), p);
    expect(out.founderExperience).toBe("first-time");
    expect(out.founderExecution?.score).toBe(16);
    expect(out).not.toBe(s);
    expect(s.founderExperience).toBe("serial");
  });

  it("the regex only fills gaps: a profile silent on co-founders / advisors keeps the regex booleans; a profile that shows them sets them", () => {
    const silent = profile({ years_in_domain: 3 });
    const s = regexSignals({ hasCoFounder: true, hasAdvisors: true, founderSectorFit: false });
    const out = mergeExecutionIntoSignals(s, founderExecutionSignals(silent), silent);
    expect(out.hasCoFounder).toBe(true);
    expect(out.hasAdvisors).toBe(true);
    expect(out.founderSectorFit).toBe(true); // 3 years in domain
    const shown = profile({ co_founders: [{ name: "C", role: "CTO" }], advisors: [{ name: "A", role: "Advisor" }] });
    const out2 = mergeExecutionIntoSignals(regexSignals(), founderExecutionSignals(shown), shown);
    expect(out2.hasCoFounder).toBe(true);
    expect(out2.hasAdvisors).toBe(true);
  });

  it("a prose-only profile (no years / exits / raises) leaves founderExperience to the regex", () => {
    const prose = profile({ bio: "x".repeat(100), co_founders: [{ name: "C", role: "CTO" }] });
    const out = mergeExecutionIntoSignals(regexSignals({ founderExperience: "experienced" }), founderExecutionSignals(prose), prose);
    expect(out.founderExperience).toBe("experienced");
    expect(out.hasCoFounder).toBe(true);
    expect(out.founderExecution).toBeDefined();
  });

  it("the attached summary carries score, cap and the seven breakdown rows (no labels / sources — compact)", () => {
    const exec = founderExecutionSignals(maxed());
    const summary = toExecutionSummary(exec);
    expect(summary).toEqual({
      score: 70,
      rawScore: 96,
      capped: true,
      capReason: exec.capReason,
      breakdown: exec.breakdown.map((r) => ({ key: r.key, points: r.points, max: r.max, evidence: r.evidence })),
      sources: ["founder"],
      rubricVersion: "1.0",
    });
  });
});
