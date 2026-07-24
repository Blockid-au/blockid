import { describe, it, expect } from "vitest";
import {
  assessAcquisitionPattern,
  ACQUISITION_PATTERN_DISCLAIMER,
  FIRB_THRESHOLD_2026_AUD,
  CASH_PCT_ATLASSIAN_MIN,
  CASH_PCT_ATLASSIAN_MAX,
} from "./acquisition-pattern-check";

describe("assessAcquisitionPattern — Atlassian 90/10 template match", () => {
  it("classifies a textbook 90/10 SaaS deal as green + matches template", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 425_000_000, // Trello 2017 headline
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 18,
      rsu_cliff_months: 12,
      rsu_vest_months: 36,
      change_of_control_consents_pct: 0.97,
      buyer_is_listed: true,
    });
    expect(res.overall_signal).toBe("green");
    expect(res.matches_atlassian_pattern).toBe(true);
    expect(res.splits_align).toBe(true);
    expect(res.rsu_structure_ok).toBe(true);
    expect(res.escrow_structure_ok).toBe(true);
    expect(res.change_of_control_gap).toBe(false);
    expect(res.firb_pre_lodgment_required).toBe(true); // headline > A$339M
    expect(res.firb_reason).toBe("threshold_exceeded");
    expect(res.warnings.some((w) => w.includes("FIRB"))).toBe(true);
    // Subdiv 83A-C recommendation fires because buyer is listed.
    expect(res.recommendations.some((r) => r.includes("Subdiv 83A-C"))).toBe(true);
    expect(res.disclaimer).toBe(ACQUISITION_PATTERN_DISCLAIMER);
  });

  it("normalises percent inputs supplied as 0-100 not 0-1", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 100_000_000,
      cash_pct: 90,
      rsu_pct: 10,
      escrow_pct: 12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 24,
      change_of_control_consents_pct: 100,
    });
    expect(res.cash_pct).toBe(0.9);
    expect(res.rsu_pct).toBe(0.1);
    expect(res.escrow_pct).toBe(0.12);
    expect(res.change_of_control_consents_pct).toBe(1);
    expect(res.matches_atlassian_pattern).toBe(true);
    expect(res.overall_signal).toBe("green");
  });

  it("tolerates garbage / negative / non-finite inputs by returning null", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: Number.NaN,
      cash_pct: -0.1,
      rsu_pct: Number.POSITIVE_INFINITY,
      escrow_pct: Number.NaN,
      escrow_months: -12,
      rsu_cliff_months: undefined,
      rsu_vest_months: null,
      change_of_control_consents_pct: undefined,
    });
    expect(res.cash_pct).toBeNull();
    expect(res.rsu_pct).toBeNull();
    expect(res.escrow_pct).toBeNull();
    expect(res.matches_atlassian_pattern).toBe(false);
    expect(res.splits_align).toBe(false);
    expect(res.rsu_structure_ok).toBe(false);
    expect(res.escrow_structure_ok).toBe(false);
    expect(res.change_of_control_gap).toBe(false); // unknown ≠ gap
    expect(res.overall_signal).toBe("amber");
    // FIRB path: NaN headline → treated as 0 → not required, no sensitive kw, no gov influence.
    expect(res.firb_pre_lodgment_required).toBe(false);
    expect(res.firb_reason).toBeNull();
  });
});

describe("assessAcquisitionPattern — red-flag branches", () => {
  it("flags red when change-of-control consents are below the red floor (< 70%)", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 200_000_000,
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.6,
    });
    expect(res.overall_signal).toBe("red");
    expect(res.change_of_control_gap).toBe(true);
    // Red-first ordering: the CoC warning lands before FIRB / structure hints.
    expect(res.warnings[0]).toMatch(/change-of-control|counterparty consent/i);
    expect(res.warnings[0]).toContain("60%");
  });

  it("flags red when cash > 98% (no retention handcuff for eng+product leadership)", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 200_000_000,
      cash_pct: 0.99,
      rsu_pct: 0.01,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
    });
    expect(res.overall_signal).toBe("red");
    expect(res.matches_atlassian_pattern).toBe(false);
    expect(res.warnings.some((w) => w.includes("Cash > 98%"))).toBe(true);
  });

  it("flags red when cash < 50% (sellers over-exposed to buyer stock risk)", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 200_000_000,
      cash_pct: 0.3,
      rsu_pct: 0.6,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
    });
    expect(res.overall_signal).toBe("red");
    expect(res.warnings.some((w) => w.includes("Cash < 50%"))).toBe(true);
    // Recommendation about scrip-for-scrip rollover should still be present.
    expect(res.recommendations.some((r) => r.includes("Subdiv 124-M"))).toBe(true);
  });
});

describe("assessAcquisitionPattern — amber branches", () => {
  it("flags amber when splits diverge but consents on track (below-target cash 80/20)", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 100_000_000,
      cash_pct: 0.8,
      rsu_pct: 0.2,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
    });
    expect(res.overall_signal).toBe("amber");
    expect(res.matches_atlassian_pattern).toBe(false);
    expect(res.splits_align).toBe(false);
    expect(res.warnings.some((w) => w.includes("diverges from the ~90/10"))).toBe(true);
  });

  it("flags amber when consents in the 70-95% band (soft gap, not red)", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 100_000_000,
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.85,
    });
    expect(res.overall_signal).toBe("amber");
    expect(res.change_of_control_gap).toBe(true);
    expect(res.warnings.some((w) => w.includes("85%"))).toBe(true);
    expect(res.warnings.every((w) => !w.includes("#1 cause"))).toBe(true);
  });

  it("flags amber when RSU vest is too short (18 months) even if splits align", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 100_000_000,
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 18,
      change_of_control_consents_pct: 0.97,
    });
    expect(res.overall_signal).toBe("amber");
    expect(res.rsu_structure_ok).toBe(false);
    expect(res.warnings.some((w) => w.includes("12-month cliff"))).toBe(true);
  });
});

describe("assessAcquisitionPattern — FIRB detection", () => {
  it("detects sensitive-sector FIRB trigger regardless of headline value", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 40_000_000, // well under A$339M threshold
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
      target_industry_keywords: ["b2b saas", "cyber security"],
    });
    expect(res.firb_pre_lodgment_required).toBe(true);
    expect(res.firb_reason).toBe("sensitive_sector");
    expect(res.warnings.some((w) => w.includes("sensitive-tech"))).toBe(true);
    // FIRB alone doesn't downgrade to red — signal stays green because the
    // template matches and consents are on track.
    expect(res.overall_signal).toBe("green");
  });

  it("detects foreign-government-influenced buyer trigger regardless of value / sector", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: 10_000_000,
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
      buyer_is_foreign_govt_influenced: true,
    });
    expect(res.firb_pre_lodgment_required).toBe(true);
    expect(res.firb_reason).toBe("foreign_govt_influence");
    expect(res.warnings.some((w) => w.includes("foreign-government-influenced"))).toBe(true);
  });

  it("does not require FIRB when headline < threshold AND no sensitive sector AND buyer not foreign-gov", () => {
    const res = assessAcquisitionPattern({
      headline_value_aud: FIRB_THRESHOLD_2026_AUD - 1,
      cash_pct: 0.9,
      rsu_pct: 0.1,
      escrow_pct: 0.12,
      escrow_months: 15,
      rsu_cliff_months: 12,
      rsu_vest_months: 30,
      change_of_control_consents_pct: 0.97,
      target_industry_keywords: ["b2b saas", "developer tooling"],
    });
    expect(res.firb_pre_lodgment_required).toBe(false);
    expect(res.firb_reason).toBeNull();
    expect(res.warnings.every((w) => !w.includes("FIRB"))).toBe(true);
  });
});

describe("assessAcquisitionPattern — constants + defaults", () => {
  it("exposes the Atlassian cash-band constants for consumer surfaces", () => {
    expect(CASH_PCT_ATLASSIAN_MIN).toBe(0.85);
    expect(CASH_PCT_ATLASSIAN_MAX).toBe(0.95);
    expect(FIRB_THRESHOLD_2026_AUD).toBe(339_000_000);
  });

  it("always attaches the fixed disclaimer + M&A lawyer recommendation", () => {
    const res = assessAcquisitionPattern({ headline_value_aud: 0 });
    expect(res.disclaimer).toBe(ACQUISITION_PATTERN_DISCLAIMER);
    expect(res.recommendations.some((r) => r.includes("specialist M&A lawyer"))).toBe(true);
  });
});
