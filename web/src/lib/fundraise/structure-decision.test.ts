// P10-structure-decision — unit tests for assessStructureDecision().
//
// Pin the (input → recommendation + triggers + blocked_paths + warnings)
// branch matrix so the Chapter 10 dual-class-decision section body and the
// Workspace → Fundraise → Structure quiz cannot silently drift.

import { describe, expect, it } from "vitest";
import {
  OFFSHORE_PARENT_MIN_REVENUE_AUD,
  STRUCTURE_DECISION_DISCLAIMER,
  assessStructureDecision,
} from "./structure-decision";

describe("assessStructureDecision — recommendation branches", () => {
  it("returns insufficient_signal when no questions answered", () => {
    const out = assessStructureDecision({});
    expect(out.recommendation).toBe("insufficient_signal");
    expect(out.triggers).toEqual([]);
    expect(out.blocked_paths).toEqual([]);
    expect(out.warnings.join(" ")).toMatch(/no structure signals/i);
    expect(out.next_steps.join(" ")).toMatch(/#dual-class-decision/);
  });

  it("single_class_default when no founder-control signal and no dilution concern", () => {
    const out = assessStructureDecision({
      wants_asx_listing: true,
      wants_founder_control_after_dilution: false,
    });
    expect(out.recommendation).toBe("single_class_default");
    expect(out.blocked_paths).toEqual([]);
    expect(out.next_steps.join(" ")).toMatch(/Chapter 2D/);
    expect(out.next_steps.join(" ")).toMatch(/Blackbird \/ AirTree/);
  });

  it("single_class_default surfaces multi-round nudge when high_dilution_risk", () => {
    const out = assessStructureDecision({
      expects_2plus_venture_rounds: true,
    });
    expect(out.recommendation).toBe("single_class_default");
    expect(out.triggers).toContain("high_dilution_risk");
    expect(out.next_steps.join(" ")).toMatch(/founder-control question/i);
  });

  it("single_class_with_founder_protections when control desired but no US listing plan", () => {
    const out = assessStructureDecision({
      wants_founder_control_after_dilution: true,
      expects_2plus_venture_rounds: true,
    });
    expect(out.recommendation).toBe("single_class_with_founder_protections");
    expect(out.next_steps.join(" ")).toMatch(/double-trigger vesting/i);
    expect(out.next_steps.join(" ")).toMatch(/reserved matters/i);
    expect(out.next_steps.join(" ")).toMatch(/ROFR/);
  });

  it("single_class_with_founder_protections + revenue warning when US-listing dream lacks offshore budget", () => {
    const out = assessStructureDecision({
      wants_us_listing: true,
      wants_founder_control_after_dilution: true,
      annual_revenue_aud: 250_000,
    });
    expect(out.recommendation).toBe("single_class_with_founder_protections");
    expect(out.next_steps.join(" ")).toMatch(/Canva-style plan-B/);
    expect(out.warnings.join(" ")).toMatch(
      new RegExp(`A\\$${OFFSHORE_PARENT_MIN_REVENUE_AUD.toLocaleString("en-AU")}`),
    );
  });

  it("consider_dual_class_offshore when US listing + control + appetite + revenue OK + counsel engaged", () => {
    const out = assessStructureDecision({
      wants_us_listing: true,
      wants_founder_control_after_dilution: true,
      has_us_offshore_parent_appetite: true,
      annual_revenue_aud: 12_000_000,
      has_specialist_counsel_engaged: true,
    });
    expect(out.recommendation).toBe("consider_dual_class_offshore");
    expect(out.triggers).toContain("us_listing_plan");
    expect(out.triggers).toContain("founder_control_desired");
    expect(out.triggers).toContain("offshore_appetite");
    expect(out.triggers).toContain("revenue_supports_offshore_budget");
    expect(out.blocked_paths).toEqual([]);
    expect(out.next_steps.join(" ")).toMatch(/Corrs \/ HSF \/ DLA \/ Cooley/);
    expect(out.next_steps.join(" ")).toMatch(/Subdiv 124-M/);
    expect(out.next_steps.join(" ")).toMatch(/ASIC Form 484/);
  });

  it("consider_dual_class_offshore adds direct_delaware_without_counsel block when no counsel", () => {
    const out = assessStructureDecision({
      wants_us_listing: true,
      wants_founder_control_after_dilution: true,
      has_us_offshore_parent_appetite: true,
      annual_revenue_aud: OFFSHORE_PARENT_MIN_REVENUE_AUD,
      has_specialist_counsel_engaged: false,
    });
    expect(out.recommendation).toBe("consider_dual_class_offshore");
    expect(out.blocked_paths).toContain("direct_delaware_without_counsel");
    expect(out.warnings.join(" ")).toMatch(/DGCL s102\(a\)\(4\)/);
    expect(out.warnings.join(" ")).toMatch(/PFIC/);
  });
});

describe("assessStructureDecision — ASX dual-class block", () => {
  it("asx_dual_class_listing_rule_6_9 fires when founder-control + ASX listing both signalled", () => {
    const out = assessStructureDecision({
      wants_asx_listing: true,
      wants_founder_control_after_dilution: true,
    });
    expect(out.blocked_paths).toContain("asx_dual_class_listing_rule_6_9");
    expect(out.warnings.join(" ")).toMatch(/Listing Rule 6\.9/);
    expect(out.recommendation).toBe("single_class_with_founder_protections");
  });

  it("does NOT block ASX when founder-control not signalled", () => {
    const out = assessStructureDecision({
      wants_asx_listing: true,
    });
    expect(out.blocked_paths).toEqual([]);
    expect(out.recommendation).toBe("single_class_default");
  });
});

describe("assessStructureDecision — input hygiene", () => {
  it("treats NaN / negative / non-finite revenue as null", () => {
    for (const bad of [NaN, -100_000, Infinity, -Infinity]) {
      const out = assessStructureDecision({
        wants_us_listing: true,
        wants_founder_control_after_dilution: true,
        has_us_offshore_parent_appetite: true,
        has_specialist_counsel_engaged: true,
        annual_revenue_aud: bad,
      });
      // Revenue trigger should NOT fire so the offshore path is NOT reached.
      expect(out.triggers).not.toContain("revenue_supports_offshore_budget");
      expect(out.recommendation).toBe("single_class_with_founder_protections");
    }
  });

  it("counts revenue AT the threshold as supportive", () => {
    const out = assessStructureDecision({
      annual_revenue_aud: OFFSHORE_PARENT_MIN_REVENUE_AUD,
    });
    expect(out.triggers).toContain("revenue_supports_offshore_budget");
  });

  it("disclaimer is present on every result", () => {
    for (const input of [
      {},
      { wants_asx_listing: true },
      { wants_founder_control_after_dilution: true },
      {
        wants_us_listing: true,
        wants_founder_control_after_dilution: true,
        has_us_offshore_parent_appetite: true,
        annual_revenue_aud: 20_000_000,
        has_specialist_counsel_engaged: true,
      },
    ]) {
      const out = assessStructureDecision(input);
      expect(out.disclaimer).toBe(STRUCTURE_DECISION_DISCLAIMER);
      expect(out.disclaimer).toMatch(/Listing Rule 6\.9/);
      expect(out.disclaimer).toMatch(/s911A/);
      expect(out.disclaimer).toMatch(/s923B/);
    }
  });
});

describe("assessStructureDecision — data-room follow-up", () => {
  it("every non-insufficient recommendation nudges the Folder 9 data-room log", () => {
    for (const input of [
      { wants_asx_listing: true },
      { wants_founder_control_after_dilution: true },
      {
        wants_us_listing: true,
        wants_founder_control_after_dilution: true,
        has_us_offshore_parent_appetite: true,
        annual_revenue_aud: 20_000_000,
        has_specialist_counsel_engaged: true,
      },
    ]) {
      const out = assessStructureDecision(input);
      expect(out.recommendation).not.toBe("insufficient_signal");
      expect(out.next_steps.join(" ")).toMatch(/Folder 9/);
    }
  });
});
