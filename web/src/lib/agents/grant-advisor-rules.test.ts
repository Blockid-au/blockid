// Colocated vitest for the grant-advisor rule helpers (T0240).

import { describe, expect, it } from "vitest";
import type { AuGrantRow, AuProgramRow } from "@/lib/funding/seed-map";
import {
  affiliationMatches,
  demographicGate,
  effectiveGrantStatus,
  effectiveProgramStatus,
  expandDemographics,
  parseSeedDate,
  regionIsNational,
  stageDistance,
  toIsoDate,
} from "./grant-advisor-rules";

const TODAY = new Date(Date.UTC(2026, 8, 10));

function grant(over: Partial<AuGrantRow>): AuGrantRow {
  return {
    id: "g",
    name: "Grant",
    provider: null,
    level: "state",
    state: "NSW",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: null,
    amount_note: null,
    co_contribution: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    eligibility: {},
    application_window: null,
    opens_at: null,
    closes_at: null,
    lodgement_deadline: null,
    next_round_note: null,
    status: "open",
    superseded_by: null,
    exclude_from_matching: false,
    official_url: "https://example.com",
    source_url: null,
    summary: null,
    how_to_apply: null,
    evidence_needed: [],
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "medium",
    sources: null,
    ...over,
  };
}

function program(over: Partial<AuProgramRow>): AuProgramRow {
  return {
    id: "p",
    name: "Program",
    operator: null,
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: null,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: [],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: null,
    eligibility: {},
    status: "open",
    official_url: "https://example.com",
    summary: null,
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "medium",
    ...over,
  };
}

describe("parseSeedDate", () => {
  it("parses ISO days and months (start / end edge) and rejects prose", () => {
    expect(toIsoDate(parseSeedDate("2027-06-11")!)).toBe("2027-06-11");
    expect(toIsoDate(parseSeedDate("2027-07")!)).toBe("2027-07-01");
    expect(toIsoDate(parseSeedDate("2027-07", "end")!)).toBe("2027-07-31");
    expect(toIsoDate(parseSeedDate("2027-02", "end")!)).toBe("2027-02-28");
    expect(parseSeedDate("rolling")).toBeNull();
    expect(parseSeedDate("rolling (6 cycles/yr; 2026 deadlines 13 Jan → 6 Oct)")).toBeNull();
    expect(parseSeedDate(null)).toBeNull();
  });
});

describe("effectiveGrantStatus", () => {
  it("keeps open/upcoming, drops paused and permanently closed", () => {
    expect(effectiveGrantStatus(grant({ status: "open" }), TODAY)).toBe("open");
    expect(effectiveGrantStatus(grant({ status: "upcoming" }), TODAY)).toBe("upcoming");
    expect(effectiveGrantStatus(grant({ status: "paused", application_window: "paused" }), TODAY)).toBe("paused");
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "closed_permanently" }), TODAY)).toBe("closed");
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "one_off" }), TODAY)).toBe("closed");
  });

  it("treats a recently closed recurring round as between rounds (upcoming)", () => {
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "multi_round", closes_at: "2026-04-10" }), TODAY)).toBe("upcoming");
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "annual_round", closes_at: null }), TODAY)).toBe("upcoming");
    // Too stale to trust
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "annual_round", closes_at: "2023-05-09" }), TODAY)).toBe("closed");
    // Superseded schemes never come back
    expect(effectiveGrantStatus(grant({ status: "closed", application_window: "annual_round", superseded_by: "x" }), TODAY)).toBe("closed");
  });
});

describe("effectiveProgramStatus", () => {
  it("closed programs come back only with a future date", () => {
    expect(effectiveProgramStatus(program({ status: "closed" }), TODAY)).toBe("closed");
    expect(effectiveProgramStatus(program({ status: "closed", applications_open: "2027-05-07" }), TODAY)).toBe("upcoming");
    expect(effectiveProgramStatus(program({ status: "closed", next_cohort_start: "2027-08" }), TODAY)).toBe("upcoming");
    expect(effectiveProgramStatus(program({ status: "closed", applications_close: "2026-07-19", next_cohort_start: "2026-08-04" }), TODAY)).toBe("closed");
    expect(effectiveProgramStatus(program({ status: "paused" }), TODAY)).toBe("paused");
  });
});

describe("demographics", () => {
  it("expands implications (51% women-owned ⇒ women-led)", () => {
    expect([...expandDemographics(["women_owned_51"])]).toEqual(["women_owned_51", "women_led"]);
    expect([...expandDemographics(["indigenous_owned_51_controlled"])]).toContain("indigenous_owned_50");
    expect(expandDemographics(null).size).toBe(0);
  });

  it("gate keys restrict; tags alone do not unless the name says so", () => {
    expect(demographicGate("MVP Ventures Program (NSW)", ["women_owned_51", "regional_founder"], {})).toEqual({ restricted: false, required: [] });
    expect(demographicGate("Female Founders Co-Investment Fund", ["women_owned_51"], { women_owned_min_pct: 51 })).toEqual({
      restricted: true,
      required: ["women_owned_51"],
    });
    expect(demographicGate("Boosting Female Founders Initiative", ["women_owned_51"], {}).restricted).toBe(true);
    expect(demographicGate("Techstars Startup Weekend Perth (incl. Women edition)", ["women_led"], {}).restricted).toBe(false);
    expect(demographicGate("Bloom", ["young_founder_under_30"], { age_max: 30 }).required).toEqual(["young_founder_under_30"]);
    expect(demographicGate("X", ["women_led"], { women_led: true }, false).restricted).toBe(true);
    expect(demographicGate("Women X", ["women_led"], {}, false).restricted).toBe(false);
  });
});

describe("affiliation + region + stage helpers", () => {
  it("matches university aliases loosely", () => {
    expect(affiliationMatches("UNSW", ["University of New South Wales"])).toBe(true);
    expect(affiliationMatches("Curtin (alumni/staff/student/Ignition grad)", ["Curtin University"])).toBe(true);
    expect(affiliationMatches("USyd", ["University of Sydney"])).toBe(true);
    expect(affiliationMatches("UoM", ["University of Melbourne"])).toBe(true);
    expect(affiliationMatches("UWA", ["Curtin"])).toBe(false);
    expect(affiliationMatches(null, [])).toBe(true);
  });

  it("recognises Australia-wide region strings", () => {
    expect(regionIsNational("AU/NZ")).toBe(true);
    expect(regionIsNational("across Australia")).toBe(true);
    expect(regionIsNational("anywhere in Australia; final 3 weeks in Tasmania")).toBe(true);
    expect(regionIsNational("QLD preferred")).toBe(false);
    expect(regionIsNational("Gold Coast")).toBe(false);
    expect(regionIsNational(undefined)).toBe(false);
  });

  it("computes stage distance to the closest tagged stage", () => {
    expect(stageDistance("idea", ["pre_revenue_prototype", "mvp"])).toBe(1);
    expect(stageDistance("scaling", ["idea"])).toBe(4);
    expect(stageDistance("mvp", ["mvp", "scaling"])).toBe(0);
    expect(stageDistance("mvp", [])).toBeNull();
    expect(stageDistance("mvp", ["mature_sme"])).toBeNull();
  });
});
