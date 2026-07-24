// P12c-lp-report-anon-policy — pin the LP-report founder-slot
// anonymisation policy so the k-threshold + always-on strips + growth-
// band bucketing branch matrix cannot silently drift.
//
// Closes §1 phase 12 P2 gap in
// docs/plans/atlassian-standard-mapping-goal.md:
//   "LP-report anonymisation k-threshold policy documented but no
//    unit-test fixture."

import { describe, it, expect } from "vitest";
import {
  LP_REPORT_ANONYMISATION_DISCLAIMER,
  LP_REPORT_GROWTH_BANDS,
  LP_REPORT_K_THRESHOLD,
  assessLpReportSlot,
} from "./lp-report-anonymisation";
import { K_ANONYMITY_THRESHOLD } from "@/lib/reseller/portfolio-aggregates";

const FULL_SLOT = {
  companyName: "Acme Pty Ltd",
  founderNames: ["Jane Founder", "Kim Co-Founder"],
  customerLogos: ["BigBank", "MegaCorp"],
  latestValuationAud: 12_500_000,
  arrAud: 1_200_000,
  headcount: 18,
  monthlyRevenueSeriesAud: [80_000, 90_000, 100_000, 115_000, 132_000, 152_000],
  sector: "SaaS",
  growthPhase: 8,
} as const;

describe("LP-report anonymisation constants", () => {
  it("LP_REPORT_K_THRESHOLD matches the reseller K_ANONYMITY_THRESHOLD so the two ends of the pipe never drift", () => {
    expect(LP_REPORT_K_THRESHOLD).toBe(5);
    expect(LP_REPORT_K_THRESHOLD).toBe(K_ANONYMITY_THRESHOLD);
  });

  it("growth bands are ordered lowest-to-highest MoM and cover the full real line", () => {
    expect(LP_REPORT_GROWTH_BANDS).toHaveLength(5);
    const keys = LP_REPORT_GROWTH_BANDS.map((b) => b.key);
    expect(keys).toEqual(["contracting", "flat", "steady", "strong", "hyper"]);
    expect(LP_REPORT_GROWTH_BANDS[0].minMoM).toBe(-Infinity);
    expect(LP_REPORT_GROWTH_BANDS[LP_REPORT_GROWTH_BANDS.length - 1].maxMoM).toBe(Infinity);
    for (let i = 1; i < LP_REPORT_GROWTH_BANDS.length; i++) {
      expect(LP_REPORT_GROWTH_BANDS[i].minMoM).toBe(
        LP_REPORT_GROWTH_BANDS[i - 1].maxMoM,
      );
    }
  });

  it("disclaimer cites APP 6 + s766B Corps Act so downstream renderers inherit the boundary on face", () => {
    expect(LP_REPORT_ANONYMISATION_DISCLAIMER).toMatch(/APP 6/);
    expect(LP_REPORT_ANONYMISATION_DISCLAIMER).toMatch(/s766B/);
    expect(LP_REPORT_ANONYMISATION_DISCLAIMER).toMatch(/Corporations Act/);
    expect(LP_REPORT_ANONYMISATION_DISCLAIMER).toMatch(/withdraw/);
  });
});

describe("assessLpReportSlot — cohort below k", () => {
  it("blanks every sensitive field when cohortSize < k and reports cohort_below_k", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 4 });
    expect(res.ok).toBe(false);
    expect(res.slot.valuationBand).toBeNull();
    expect(res.slot.headcountBand).toBeNull();
    expect(res.slot.growthBand).toBeNull();
    expect(res.slot.monthlyRevenueSeriesAud).toBeNull();
    // Non-identifying fields still surface so the reseller pack has
    // something to show even at k-blocked cohorts.
    expect(res.slot.sector).toBe("SaaS");
    expect(res.slot.growthPhase).toBe(8);
    expect(res.redactions.map((r) => r.kind)).toContain("cohort_below_k");
    expect(res.disclaimer).toBe(LP_REPORT_ANONYMISATION_DISCLAIMER);
  });

  it("honours a bespoke k override — cohort=6 with k=10 still blocks", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 6, k: 10 });
    expect(res.ok).toBe(false);
    expect(res.redactions[0].kind).toBe("cohort_below_k");
    expect(res.redactions[0].reason).toMatch(/k-threshold is 10/);
  });

  it("uses the reseller-assigned cohortId when supplied, else falls back to a generic tag", () => {
    const named = assessLpReportSlot({
      slot: FULL_SLOT,
      cohortSize: 2,
      cohortId: "acme-cohort-q3-2026",
    });
    expect(named.slot.cohortId).toBe("acme-cohort-q3-2026");
    const anon = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 2 });
    expect(anon.slot.cohortId).toBe("cohort-founder-anon");
  });
});

describe("assessLpReportSlot — cohort meets k, always-on strips", () => {
  it("strips company + founder names + customer logos every time even at k+", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    expect(res.ok).toBe(true);
    const kinds = res.redactions.map((r) => r.kind);
    expect(kinds).toContain("company_name_stripped");
    expect(kinds).toContain("founder_names_stripped");
    expect(kinds).toContain("customer_logos_stripped");
  });

  it("coarsens exact valuation into a band and reports the coarsening", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    expect(res.slot.valuationBand?.key).toBe("5m_25m");
    expect(res.slot.valuationBand?.label).toBe("A$5M–A$25M");
    expect(res.redactions.map((r) => r.kind)).toContain("valuation_coarsened");
  });

  it("coarsens exact headcount into a band and reports the coarsening", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    expect(res.slot.headcountBand?.key).toBe("medium");
    expect(res.slot.headcountBand?.label).toBe("11–25");
    expect(res.redactions.map((r) => r.kind)).toContain("headcount_coarsened");
  });

  it("null / negative / non-finite valuation + headcount coarsen to null without throwing", () => {
    const res = assessLpReportSlot({
      slot: {
        ...FULL_SLOT,
        latestValuationAud: Number.NaN,
        headcount: -5,
      },
      cohortSize: 8,
    });
    expect(res.slot.valuationBand).toBeNull();
    expect(res.slot.headcountBand).toBeNull();
  });
});

describe("assessLpReportSlot — revenue-curve shape", () => {
  it("hides the raw monthly series by default (revealShape=false) and exposes a growth-band chip only", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    expect(res.slot.monthlyRevenueSeriesAud).toBeNull();
    // MoM average across [80k…152k] ≈ 13.8% → steady band.
    expect(res.slot.growthBand).toBe("steady");
    expect(res.redactions.map((r) => r.kind)).toContain(
      "revenue_curve_shape_hidden",
    );
  });

  it("exposes the raw monthly series verbatim only when revealShape=true AND cohort meets k", () => {
    const res = assessLpReportSlot({
      slot: FULL_SLOT,
      cohortSize: 8,
      revealShape: true,
    });
    expect(res.slot.monthlyRevenueSeriesAud).toEqual(FULL_SLOT.monthlyRevenueSeriesAud);
    // revealShape=true skips the shape-hidden redaction — the founder
    // has opted in.
    expect(res.redactions.map((r) => r.kind)).not.toContain(
      "revenue_curve_shape_hidden",
    );
  });

  it("falls back to no_signal when no revenue series AND no ARR is provided", () => {
    const res = assessLpReportSlot({
      slot: { sector: "SaaS", growthPhase: 5 },
      cohortSize: 8,
    });
    expect(res.slot.growthBand).toBeNull();
    expect(res.slot.monthlyRevenueSeriesAud).toBeNull();
    expect(res.redactions.map((r) => r.kind)).toContain("no_signal");
  });

  it("falls back to revenue_coarsened when only ARR (no series) is provided", () => {
    const res = assessLpReportSlot({
      slot: { sector: "SaaS", growthPhase: 5, arrAud: 800_000 },
      cohortSize: 8,
    });
    expect(res.slot.growthBand).toBeNull();
    expect(res.slot.monthlyRevenueSeriesAud).toBeNull();
    expect(res.redactions.map((r) => r.kind)).toContain("revenue_coarsened");
    expect(res.redactions.map((r) => r.kind)).not.toContain("no_signal");
  });

  it("picks the hyper band when MoM average exceeds 30%", () => {
    const hyperSeries = [10_000, 15_000, 25_000, 40_000, 65_000, 110_000];
    const res = assessLpReportSlot({
      slot: { ...FULL_SLOT, monthlyRevenueSeriesAud: hyperSeries },
      cohortSize: 8,
    });
    expect(res.slot.growthBand).toBe("hyper");
  });

  it("picks the contracting band when average MoM is deeply negative", () => {
    const contracting = [100_000, 90_000, 80_000, 70_000, 60_000];
    const res = assessLpReportSlot({
      slot: { ...FULL_SLOT, monthlyRevenueSeriesAud: contracting },
      cohortSize: 8,
    });
    expect(res.slot.growthBand).toBe("contracting");
  });

  it("skips zero + non-finite entries when computing MoM growth", () => {
    const noisy = [0, 0, 100_000, 115_000, 130_000];
    const res = assessLpReportSlot({
      slot: { ...FULL_SLOT, monthlyRevenueSeriesAud: noisy },
      cohortSize: 8,
    });
    // 100k → 115k (+15%), 115k → 130k (+13%) → steady band.
    expect(res.slot.growthBand).toBe("steady");
  });
});

describe("assessLpReportSlot — founder-isolated-in-band warning", () => {
  it("warns when peersInSameGrowthBand < k-1 even at cohortSize >= k", () => {
    const res = assessLpReportSlot({
      slot: FULL_SLOT,
      cohortSize: 8,
      peersInSameGrowthBand: 1,
    });
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => /identify you/.test(w))).toBe(true);
    expect(res.redactions.map((r) => r.kind)).toContain("founder_isolated_in_band");
  });

  it("does NOT warn when peersInSameGrowthBand >= k-1", () => {
    const res = assessLpReportSlot({
      slot: FULL_SLOT,
      cohortSize: 8,
      peersInSameGrowthBand: 4,
    });
    expect(res.warnings).toHaveLength(0);
    expect(res.redactions.map((r) => r.kind)).not.toContain(
      "founder_isolated_in_band",
    );
  });

  it("omits the isolated-band check entirely when peersInSameGrowthBand is not supplied", () => {
    const res = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    expect(res.redactions.map((r) => r.kind)).not.toContain(
      "founder_isolated_in_band",
    );
  });
});

describe("assessLpReportSlot — disclaimer + defensive input handling", () => {
  it("attaches LP_REPORT_ANONYMISATION_DISCLAIMER to every result branch", () => {
    const blocked = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 2 });
    const ok = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: 8 });
    const empty = assessLpReportSlot({ slot: {}, cohortSize: 8 });
    expect(blocked.disclaimer).toBe(LP_REPORT_ANONYMISATION_DISCLAIMER);
    expect(ok.disclaimer).toBe(LP_REPORT_ANONYMISATION_DISCLAIMER);
    expect(empty.disclaimer).toBe(LP_REPORT_ANONYMISATION_DISCLAIMER);
  });

  it("garbage cohortSize (NaN / -1) coerces to 0 → cohort_below_k", () => {
    const nan = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: Number.NaN });
    expect(nan.ok).toBe(false);
    expect(nan.redactions[0].kind).toBe("cohort_below_k");
    const neg = assessLpReportSlot({ slot: FULL_SLOT, cohortSize: -3 });
    expect(neg.ok).toBe(false);
    expect(neg.redactions[0].kind).toBe("cohort_below_k");
  });
});
