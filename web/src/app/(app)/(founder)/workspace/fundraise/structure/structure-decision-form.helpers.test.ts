import { describe, it, expect } from "vitest";
import {
  makeEmptyStructureDecisionFormState,
  pickStructureBand,
  STRUCTURE_HEADLINE,
  toStructureDecisionInput,
  type StructureDecisionFormState,
} from "./structure-decision-form.helpers";

describe("P10-structure-decision-ui form helpers", () => {
  describe("makeEmptyStructureDecisionFormState", () => {
    it("returns all booleans false and revenue empty", () => {
      const s = makeEmptyStructureDecisionFormState();
      expect(s.wants_us_listing).toBe(false);
      expect(s.wants_asx_listing).toBe(false);
      expect(s.wants_founder_control_after_dilution).toBe(false);
      expect(s.expects_2plus_venture_rounds).toBe(false);
      expect(s.has_us_offshore_parent_appetite).toBe(false);
      expect(s.has_specialist_counsel_engaged).toBe(false);
      expect(s.annual_revenue_aud).toBe("");
    });
  });

  describe("toStructureDecisionInput", () => {
    it("passes booleans through unchanged", () => {
      const s: StructureDecisionFormState = {
        wants_us_listing: true,
        wants_asx_listing: false,
        wants_founder_control_after_dilution: true,
        expects_2plus_venture_rounds: true,
        has_us_offshore_parent_appetite: true,
        has_specialist_counsel_engaged: false,
        annual_revenue_aud: "7500000",
      };
      const wire = toStructureDecisionInput(s);
      expect(wire.wants_us_listing).toBe(true);
      expect(wire.wants_asx_listing).toBe(false);
      expect(wire.wants_founder_control_after_dilution).toBe(true);
      expect(wire.expects_2plus_venture_rounds).toBe(true);
      expect(wire.has_us_offshore_parent_appetite).toBe(true);
      expect(wire.has_specialist_counsel_engaged).toBe(false);
      expect(wire.annual_revenue_aud).toBe(7_500_000);
    });

    it("coerces empty revenue to null", () => {
      const s = makeEmptyStructureDecisionFormState();
      expect(toStructureDecisionInput(s).annual_revenue_aud).toBeNull();
    });

    it("coerces whitespace revenue to null", () => {
      const s = { ...makeEmptyStructureDecisionFormState(), annual_revenue_aud: "   " };
      expect(toStructureDecisionInput(s).annual_revenue_aud).toBeNull();
    });

    it("coerces negative revenue to null", () => {
      const s = { ...makeEmptyStructureDecisionFormState(), annual_revenue_aud: "-1000" };
      expect(toStructureDecisionInput(s).annual_revenue_aud).toBeNull();
    });

    it("coerces non-numeric revenue to null", () => {
      const s = { ...makeEmptyStructureDecisionFormState(), annual_revenue_aud: "abc" };
      expect(toStructureDecisionInput(s).annual_revenue_aud).toBeNull();
    });

    it("accepts zero revenue as zero (not null)", () => {
      const s = { ...makeEmptyStructureDecisionFormState(), annual_revenue_aud: "0" };
      expect(toStructureDecisionInput(s).annual_revenue_aud).toBe(0);
    });
  });

  describe("pickStructureBand", () => {
    it("returns slate for insufficient_signal with no blockers", () => {
      expect(pickStructureBand("insufficient_signal", 0)).toBe("slate");
    });

    it("returns emerald for single_class_default", () => {
      expect(pickStructureBand("single_class_default", 0)).toBe("emerald");
    });

    it("returns amber for single_class_with_founder_protections", () => {
      expect(pickStructureBand("single_class_with_founder_protections", 0)).toBe(
        "amber",
      );
    });

    it("returns amber for consider_dual_class_offshore without blockers", () => {
      expect(pickStructureBand("consider_dual_class_offshore", 0)).toBe("amber");
    });

    it("returns red when a blocked_path is present regardless of recommendation", () => {
      expect(pickStructureBand("single_class_default", 1)).toBe("red");
      expect(pickStructureBand("consider_dual_class_offshore", 1)).toBe("red");
      expect(pickStructureBand("single_class_with_founder_protections", 2)).toBe(
        "red",
      );
    });
  });

  describe("STRUCTURE_HEADLINE", () => {
    it("covers every recommendation branch", () => {
      const keys: (keyof typeof STRUCTURE_HEADLINE)[] = [
        "insufficient_signal",
        "single_class_default",
        "single_class_with_founder_protections",
        "consider_dual_class_offshore",
      ];
      for (const k of keys) {
        expect(STRUCTURE_HEADLINE[k]).toBeTruthy();
        expect(STRUCTURE_HEADLINE[k].length).toBeGreaterThan(10);
      }
    });
  });
});
