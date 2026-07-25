// P12d-redomicile-wizard — unit tests for assessRedomicile().
//
// Pin the (input → recommendation + triggers + mechanism) branch matrix so
// the Chapter 12 redomicile-decision-tree section body and the wizard on
// /dashboard/exit-readiness cannot silently drift.

import { describe, expect, it } from "vitest";
import {
  assessRedomicile,
  PFIC_CAP_TABLE_THRESHOLD_PCT,
  REDOMICILE_DISCLAIMER,
  REDOMICILE_FLOOR_BURN_AUD,
  REDOMICILE_MAX_BUDGET_AUD,
  REDOMICILE_MIN_BUDGET_AUD,
} from "./redomicile-decision-check";

describe("assessRedomicile — recommendation branches", () => {
  it("holds when no triggers fire", () => {
    const out = assessRedomicile({});
    expect(out.recommendation).toBe("hold");
    expect(out.triggers).toEqual([]);
    expect(out.mechanism).toBeNull();
    expect(out.next_steps[0]).toMatch(/do nothing/i);
  });

  it("holds when pre-Series-A even if a trigger fires", () => {
    const out = assessRedomicile({
      is_pre_series_a: true,
      has_delaware_acquirer_signal: true,
      annual_burn_aud: 500_000,
    });
    expect(out.recommendation).toBe("hold");
    expect(out.warnings.join(" ")).toMatch(/pre-series-a/i);
  });

  it("prepares on a single trigger with any burn", () => {
    const out = assessRedomicile({
      has_delaware_acquirer_signal: true,
      annual_burn_aud: 50_000,
    });
    expect(out.recommendation).toBe("prepare");
    expect(out.triggers).toEqual(["delaware_acquirer"]);
    expect(out.mechanism).toBe("scheme_of_arrangement_s411");
    expect(out.next_steps.join(" ")).toMatch(/preliminary call/i);
  });

  it("proceeds when 2+ triggers fire AND burn ≥ floor", () => {
    const out = assessRedomicile({
      has_delaware_acquirer_signal: true,
      us_resident_cap_table_pct: 60,
      annual_burn_aud: 500_000,
    });
    expect(out.recommendation).toBe("proceed");
    expect(out.triggers).toEqual(["delaware_acquirer", "pfic_exposure"]);
    expect(out.can_fund_redomicile).toBe(true);
    expect(out.next_steps.join(" ")).toMatch(/independent expert/i);
    expect(out.next_steps.join(" ")).toMatch(/subdiv 83A-C/i);
  });

  it("reconsiders when 2+ triggers fire but burn < floor", () => {
    const out = assessRedomicile({
      has_delaware_acquirer_signal: true,
      us_resident_cap_table_pct: 60,
      annual_burn_aud: REDOMICILE_FLOOR_BURN_AUD - 1,
    });
    expect(out.recommendation).toBe("reconsider");
    expect(out.can_fund_redomicile).toBe(false);
    expect(out.warnings.join(" ")).toMatch(/runway looks tight/i);
    expect(out.next_steps.join(" ")).toMatch(/do NOT sign/i);
  });
});

describe("assessRedomicile — trigger detection", () => {
  it("detects PFIC exposure at the threshold", () => {
    const at = assessRedomicile({
      us_resident_cap_table_pct: PFIC_CAP_TABLE_THRESHOLD_PCT * 100,
    });
    expect(at.triggers).toContain("pfic_exposure");
    const under = assessRedomicile({
      us_resident_cap_table_pct: PFIC_CAP_TABLE_THRESHOLD_PCT * 100 - 1,
    });
    expect(under.triggers).not.toContain("pfic_exposure");
  });

  it("normalises the pfic pct whether supplied as 0-1 or 0-100", () => {
    const asFraction = assessRedomicile({ us_resident_cap_table_pct: 0.6 });
    const asPct = assessRedomicile({ us_resident_cap_table_pct: 60 });
    expect(asFraction.pfic_exposure_flagged).toBe(true);
    expect(asPct.pfic_exposure_flagged).toBe(true);
  });

  it("requires BOTH plans_us_listing AND wants_dual_class_founder_control", () => {
    expect(
      assessRedomicile({ plans_us_listing: true }).triggers,
    ).not.toContain("us_listing_dual_class");
    expect(
      assessRedomicile({ wants_dual_class_founder_control: true }).triggers,
    ).not.toContain("us_listing_dual_class");
    expect(
      assessRedomicile({
        plans_us_listing: true,
        wants_dual_class_founder_control: true,
      }).triggers,
    ).toContain("us_listing_dual_class");
  });

  it("emits subdiv_124m_rollover_available only when the offer is scrip-only", () => {
    const scrip = assessRedomicile({ has_scrip_only_offer: true });
    expect(scrip.subdiv_124m_rollover_available).toBe(true);
    expect(scrip.triggers).toContain("scrip_only_offer");
    const cash = assessRedomicile({});
    expect(cash.subdiv_124m_rollover_available).toBe(false);
  });

  it("warns about cash + shares mix when Delaware acquirer without scrip-only", () => {
    const out = assessRedomicile({
      has_delaware_acquirer_signal: true,
      has_scrip_only_offer: false,
      annual_burn_aud: 200_000,
    });
    expect(out.warnings.join(" ")).toMatch(/scrip-for-scrip rollover only applies/i);
  });

  it("warns about ASX Listing Rule 6.9 on dual-class ambition without acquirer", () => {
    const out = assessRedomicile({
      plans_us_listing: true,
      wants_dual_class_founder_control: true,
      annual_burn_aud: 400_000,
    });
    expect(out.warnings.join(" ")).toMatch(/listing rule 6\.9/i);
  });
});

describe("assessRedomicile — defensive input handling", () => {
  it("tolerates non-finite / negative numbers by treating them as absent", () => {
    const out = assessRedomicile({
      us_resident_cap_table_pct: Number.NaN,
      annual_burn_aud: -1_000,
    });
    expect(out.pfic_exposure_flagged).toBe(false);
    expect(out.can_fund_redomicile).toBe(false);
  });

  it("clamps pfic pct > 100 to 100 without erroring", () => {
    const out = assessRedomicile({ us_resident_cap_table_pct: 400 });
    expect(out.pfic_exposure_flagged).toBe(true);
  });
});

describe("assessRedomicile — disclaimer + constants", () => {
  it("attaches the disclaimer on every branch", () => {
    for (const input of [
      {},
      { has_delaware_acquirer_signal: true, annual_burn_aud: 500_000 },
      { is_pre_series_a: true },
      {
        has_delaware_acquirer_signal: true,
        us_resident_cap_table_pct: 60,
        annual_burn_aud: 500_000,
      },
    ]) {
      expect(assessRedomicile(input).disclaimer).toBe(REDOMICILE_DISCLAIMER);
    }
  });

  it("pins the budget + funding-floor constants", () => {
    expect(REDOMICILE_MIN_BUDGET_AUD).toBe(300_000);
    expect(REDOMICILE_MAX_BUDGET_AUD).toBe(800_000);
    expect(REDOMICILE_FLOOR_BURN_AUD).toBe(100_000);
    expect(PFIC_CAP_TABLE_THRESHOLD_PCT).toBe(0.5);
  });

  it("names the statutory + regulatory anchors in the disclaimer", () => {
    for (const anchor of [
      "Scheme of Arrangement",
      "s411",
      "Subdiv 124-M",
      "FIRB",
      "IRC §957",
      "IRC §1297",
      "IRC §951A",
      "s911A",
      "s923B",
    ]) {
      expect(REDOMICILE_DISCLAIMER).toContain(anchor);
    }
  });
});
