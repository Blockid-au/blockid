import { describe, expect, it } from "vitest";
import {
  assessLpReportSlot,
  LP_REPORT_K_THRESHOLD,
} from "@/lib/investor-pack/lp-report-anonymisation";
import {
  LP_REPORT_HEADLINE,
  makeEmptyLpReportComposerFormState,
  parseMonthlyRevenueSeries,
  parseNameList,
  pickLpReportBand,
  toLpReportSlotInput,
  type LpReportComposerFormState,
} from "./lp-report-composer.helpers";

describe("lp-report-composer helpers", () => {
  describe("makeEmptyLpReportComposerFormState", () => {
    it("seeds an empty form so the founder must supply every metric", () => {
      const s = makeEmptyLpReportComposerFormState();
      expect(s.cohort_id).toBe("");
      expect(s.cohort_size).toBe("");
      expect(s.peers_in_same_growth_band).toBe("");
      expect(s.reveal_shape).toBe(false);
      expect(s.company_name).toBe("");
      expect(s.founder_names_csv).toBe("");
      expect(s.customer_logos_csv).toBe("");
      expect(s.latest_valuation_aud).toBe("");
      expect(s.arr_aud).toBe("");
      expect(s.headcount).toBe("");
      expect(s.monthly_revenue_series_aud_csv).toBe("");
      expect(s.sector).toBe("");
      expect(s.growth_phase).toBe("");
    });
  });

  describe("parseNameList", () => {
    it("splits on commas, semicolons, and newlines with whitespace tolerance", () => {
      expect(parseNameList("Alice, Bob; Cara\nDan")).toEqual([
        "Alice",
        "Bob",
        "Cara",
        "Dan",
      ]);
    });

    it("returns [] for blank or whitespace-only input", () => {
      expect(parseNameList("")).toEqual([]);
      expect(parseNameList("   \n  ")).toEqual([]);
    });

    it("de-duplicates case-insensitively while preserving first-seen casing", () => {
      expect(parseNameList("ACME, acme, Acme, Contoso")).toEqual([
        "ACME",
        "Contoso",
      ]);
    });

    it("drops empty tokens caused by trailing separators", () => {
      expect(parseNameList("Alice,,,")).toEqual(["Alice"]);
    });
  });

  describe("parseMonthlyRevenueSeries", () => {
    it("parses a CSV of numbers, dropping non-finite / negative entries silently", () => {
      expect(parseMonthlyRevenueSeries("12000, 15000, na, -2000, 18000")).toEqual([
        12000, 15000, 18000,
      ]);
    });

    it("accepts whitespace, tab, semicolon separators", () => {
      expect(parseMonthlyRevenueSeries("100 200\t300;400")).toEqual([
        100, 200, 300, 400,
      ]);
    });

    it("returns [] for blank input", () => {
      expect(parseMonthlyRevenueSeries("")).toEqual([]);
      expect(parseMonthlyRevenueSeries("   ")).toEqual([]);
    });
  });

  describe("toLpReportSlotInput", () => {
    it("collapses blank optional fields to null so the assessor sees them as unspecified", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: "8",
      };
      const input = toLpReportSlotInput(state);
      expect(input.cohortSize).toBe(8);
      expect(input.revealShape).toBe(false);
      expect(input.cohortId).toBeUndefined();
      expect(input.peersInSameGrowthBand).toBeUndefined();
      expect(input.slot.companyName).toBeNull();
      expect(input.slot.founderNames).toBeNull();
      expect(input.slot.customerLogos).toBeNull();
      expect(input.slot.latestValuationAud).toBeNull();
      expect(input.slot.arrAud).toBeNull();
      expect(input.slot.headcount).toBeNull();
      expect(input.slot.monthlyRevenueSeriesAud).toBeNull();
      expect(input.slot.sector).toBeNull();
      expect(input.slot.growthPhase).toBeNull();
    });

    it("propagates every populated field into the wire shape", () => {
      const state: LpReportComposerFormState = {
        cohort_id: "cohort-2026-Q3",
        cohort_size: "12",
        peers_in_same_growth_band: "6",
        reveal_shape: true,
        company_name: "Contoso Pty Ltd",
        founder_names_csv: "Alice, Bob",
        customer_logos_csv: "Woolworths; Coles",
        latest_valuation_aud: "12500000",
        arr_aud: "2400000",
        headcount: "18",
        monthly_revenue_series_aud_csv: "150000, 170000, 200000, 230000",
        sector: "saas",
        growth_phase: "6",
      };
      const input = toLpReportSlotInput(state);
      expect(input.cohortId).toBe("cohort-2026-Q3");
      expect(input.cohortSize).toBe(12);
      expect(input.peersInSameGrowthBand).toBe(6);
      expect(input.revealShape).toBe(true);
      expect(input.slot.companyName).toBe("Contoso Pty Ltd");
      expect(input.slot.founderNames).toEqual(["Alice", "Bob"]);
      expect(input.slot.customerLogos).toEqual(["Woolworths", "Coles"]);
      expect(input.slot.latestValuationAud).toBe(12_500_000);
      expect(input.slot.arrAud).toBe(2_400_000);
      expect(input.slot.headcount).toBe(18);
      expect(input.slot.monthlyRevenueSeriesAud).toEqual([
        150000, 170000, 200000, 230000,
      ]);
      expect(input.slot.sector).toBe("saas");
      expect(input.slot.growthPhase).toBe(6);
    });

    it("floors decimal cohort size + growth phase to whole numbers", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: "8.7",
        growth_phase: "5.9",
        peers_in_same_growth_band: "3.4",
      };
      const input = toLpReportSlotInput(state);
      expect(input.cohortSize).toBe(8);
      expect(input.slot.growthPhase).toBe(5);
      expect(input.peersInSameGrowthBand).toBe(3);
    });

    it("garbage cohort size falls back to 0 so the assessor sees cohort_below_k", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: "not-a-number",
      };
      const input = toLpReportSlotInput(state);
      expect(input.cohortSize).toBe(0);
    });
  });

  describe("pickLpReportBand", () => {
    it("returns grey when the founder has not entered a cohort size yet", () => {
      const state = makeEmptyLpReportComposerFormState();
      const assessment = assessLpReportSlot(toLpReportSlotInput(state));
      expect(pickLpReportBand(assessment, state)).toBe("grey");
    });

    it("returns red when the cohort is below k (below-k branch of the policy)", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: String(LP_REPORT_K_THRESHOLD - 1),
      };
      const assessment = assessLpReportSlot(toLpReportSlotInput(state));
      expect(assessment.ok).toBe(false);
      expect(pickLpReportBand(assessment, state)).toBe("red");
    });

    it("returns amber when peers in growth band < k-1 (founder-isolated warning)", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: "12",
        peers_in_same_growth_band: "1",
        latest_valuation_aud: "3000000",
        headcount: "8",
        arr_aud: "800000",
        sector: "saas",
        growth_phase: "5",
      };
      const assessment = assessLpReportSlot(toLpReportSlotInput(state));
      expect(assessment.ok).toBe(true);
      expect(assessment.warnings.length).toBeGreaterThan(0);
      expect(pickLpReportBand(assessment, state)).toBe("amber");
    });

    it("returns green when the assessment is ok with no warnings", () => {
      const state: LpReportComposerFormState = {
        ...makeEmptyLpReportComposerFormState(),
        cohort_size: "12",
        peers_in_same_growth_band: "10",
        latest_valuation_aud: "3000000",
        headcount: "8",
        arr_aud: "800000",
        sector: "saas",
        growth_phase: "5",
      };
      const assessment = assessLpReportSlot(toLpReportSlotInput(state));
      expect(assessment.ok).toBe(true);
      expect(assessment.warnings).toEqual([]);
      expect(pickLpReportBand(assessment, state)).toBe("green");
    });
  });

  describe("LP_REPORT_HEADLINE", () => {
    it("supplies a distinct headline for every band", () => {
      const bands: Array<keyof typeof LP_REPORT_HEADLINE> = [
        "grey",
        "green",
        "amber",
        "red",
      ];
      const headlines = bands.map((b) => LP_REPORT_HEADLINE[b]);
      expect(new Set(headlines).size).toBe(bands.length);
      for (const h of headlines) expect(h.length).toBeGreaterThan(0);
    });
  });
});
