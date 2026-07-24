import { describe, expect, it } from "vitest";
import { assessAcquisitionPattern } from "@/lib/exits/acquisition-pattern-check";
import {
  ACQUISITION_HEADLINE,
  makeEmptyAcquisitionWizardFormState,
  parseKeywords,
  pickAcquisitionBand,
  toAcquisitionInput,
} from "./acquisition-wizard.helpers";

describe("acquisition-wizard helpers", () => {
  describe("makeEmptyAcquisitionWizardFormState", () => {
    it("seeds the textbook ~90/10 Atlassian template as a starting green baseline", () => {
      const s = makeEmptyAcquisitionWizardFormState();
      expect(s.cash_pct).toBe("90");
      expect(s.rsu_pct).toBe("10");
      expect(s.escrow_pct).toBe("12");
      expect(s.escrow_months).toBe("15");
      expect(s.rsu_cliff_months).toBe("12");
      expect(s.rsu_vest_months).toBe("30");
      // headline value + consents + earnout left blank so a founder has to
      // enter their own numbers before the check will fire signals against them
      expect(s.headline_value_aud).toBe("");
      expect(s.earnout_pct).toBe("");
      expect(s.change_of_control_consents_pct).toBe("");
      expect(s.buyer_is_foreign_govt_influenced).toBe(false);
      expect(s.buyer_is_listed).toBe(false);
      expect(s.target_industry_keywords).toBe("");
    });
  });

  describe("parseKeywords", () => {
    it("splits on commas, semicolons, and newlines with whitespace tolerance", () => {
      expect(parseKeywords("cyber, defence; quantum\nfintech")).toEqual([
        "cyber",
        "defence",
        "quantum",
        "fintech",
      ]);
    });

    it("returns [] for blank or whitespace-only input", () => {
      expect(parseKeywords("")).toEqual([]);
      expect(parseKeywords("   \n  ")).toEqual([]);
    });

    it("drops empty tokens caused by trailing separators", () => {
      expect(parseKeywords("saas,,,")).toEqual(["saas"]);
    });
  });

  describe("toAcquisitionInput", () => {
    it("coerces filled fields to numbers and collapses blanks to null", () => {
      const s = makeEmptyAcquisitionWizardFormState();
      s.headline_value_aud = "425000000";
      s.change_of_control_consents_pct = "95";
      const input = toAcquisitionInput(s);
      expect(input.headline_value_aud).toBe(425_000_000);
      expect(input.cash_pct).toBe(90);
      expect(input.rsu_pct).toBe(10);
      // earnout was left blank — must be null so the checker's "unspecified"
      // branch fires (a warning about zero earnout is meaningless).
      expect(input.earnout_pct).toBeNull();
      expect(input.change_of_control_consents_pct).toBe(95);
      expect(input.buyer_is_foreign_govt_influenced).toBe(false);
      expect(input.buyer_is_listed).toBe(false);
      expect(input.target_industry_keywords).toEqual([]);
    });

    it("garbage numbers collapse to null on optionals and 0 on the required headline", () => {
      const s = makeEmptyAcquisitionWizardFormState();
      s.headline_value_aud = "not-a-number";
      s.cash_pct = "";
      s.rsu_pct = "not-a-number";
      s.escrow_pct = "  ";
      const input = toAcquisitionInput(s);
      expect(input.headline_value_aud).toBe(0);
      expect(input.cash_pct).toBeNull();
      expect(input.rsu_pct).toBeNull();
      expect(input.escrow_pct).toBeNull();
    });

    it("propagates FIRB-relevant flags and industry keywords", () => {
      const s = makeEmptyAcquisitionWizardFormState();
      s.buyer_is_foreign_govt_influenced = true;
      s.buyer_is_listed = true;
      s.target_industry_keywords = "cyber, critical infrastructure";
      const input = toAcquisitionInput(s);
      expect(input.buyer_is_foreign_govt_influenced).toBe(true);
      expect(input.buyer_is_listed).toBe(true);
      expect(input.target_industry_keywords).toEqual([
        "cyber",
        "critical infrastructure",
      ]);
    });
  });

  describe("pickAcquisitionBand", () => {
    it("mirrors the checker signal 1:1 (green/amber/red)", () => {
      expect(pickAcquisitionBand("green")).toBe("green");
      expect(pickAcquisitionBand("amber")).toBe("amber");
      expect(pickAcquisitionBand("red")).toBe("red");
    });

    it("stays consistent with a real assessAcquisitionPattern run of the default form", () => {
      // Default form + a headline value + strong consents = green textbook deal.
      const s = makeEmptyAcquisitionWizardFormState();
      s.headline_value_aud = "425000000";
      s.change_of_control_consents_pct = "97";
      const result = assessAcquisitionPattern(toAcquisitionInput(s));
      expect(result.matches_atlassian_pattern).toBe(true);
      expect(pickAcquisitionBand(result.overall_signal)).toBe("green");
    });

    it("flips to red when consents drop below the red floor even with a template match", () => {
      const s = makeEmptyAcquisitionWizardFormState();
      s.headline_value_aud = "425000000";
      s.change_of_control_consents_pct = "50";
      const result = assessAcquisitionPattern(toAcquisitionInput(s));
      expect(pickAcquisitionBand(result.overall_signal)).toBe("red");
      expect(
        result.warnings.some((w) => w.includes("change-of-control")),
      ).toBe(true);
    });
  });

  describe("ACQUISITION_HEADLINE", () => {
    it("supplies a headline for every AcquisitionSignal branch", () => {
      expect(ACQUISITION_HEADLINE.green).toMatch(/Atlassian/i);
      expect(ACQUISITION_HEADLINE.amber).toMatch(/Drifting/i);
      expect(ACQUISITION_HEADLINE.red).toMatch(/red flag/i);
    });
  });
});
