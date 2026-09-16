// consistency-gates (S-R3, spec §C.9 gate 3): deterministic checks the
// orchestrator applies before ASSEMBLE — chapter score ±10 of computeSVI,
// valuation consensus within the stage band, no stated MRR without a revenue
// evidence row, phase blockers in the executive summary = the gate's list.

import { describe, expect, it } from "vitest";
import type { PhaseGateResult } from "@/lib/growth/phase-gate";
import type { DimensionChapter, EvidenceRow, ValuationChapter } from "@/lib/report-v2/schema";
import { VALUATION_BASELINES_AUD } from "@/lib/valuation";
import type { DimKey } from "./dimension-owners";
import { applyConsistencyGates, hasRevenueEvidence, stripRevenueFigures, valuationStageBand, UNEVIDENCED_REVENUE } from "./consistency-gates";

function chapter(dim: DimKey, score: number, extra: Partial<DimensionChapter> = {}): DimensionChapter {
  return {
    dim,
    title: dim.toUpperCase(),
    ownerAgent: "cro",
    weight: 20,
    score,
    band: score >= 70 ? "strong" : score >= 40 ? "developing" : "early",
    benchmark: { p25: 40, p50: 52, p75: 64, percentile: null, stage: 2 },
    verdict: `${dim} verdict`,
    evidence: [],
    criteria: [],
    strengths: [],
    gaps: [],
    nextAction: { title: "x", window: "30d", expectedLift: 3 },
    phaseLens: { phaseId: "validation", whatMattersNow: "" },
    frameworks: [],
    modules: [],
    audit: { grounded: true, uncited: 0, revised: false, auditor: "llm-auditor", at: "2026-09-16T00:00:00.000Z" },
    runIds: [],
    renderAs: "full",
    primaryVisual: { id: "v", kind: "bar", type: "bar", title: "t", data: {}, placement: "inline", agentId: "cro", dataState: "partial", a11y: { tableFallback: [] }, svg: "<svg/>" } as unknown as DimensionChapter["primaryVisual"],
    secondaryVisuals: [],
    ...extra,
  } as DimensionChapter;
}

function valuation(midAud: number): ValuationChapter {
  return {
    currency: "AUD",
    methods: [],
    consensus: { lowAud: midAud * 0.7, midAud, highAud: midAud * 1.4, confidence: 0.7 },
    sectorMultiples: { sector: "saas", low: 3, median: 5, high: 7, sourceLabel: "x", sourceDate: "2026-06" },
    comparables: { n: 33, withMultiplesN: 20, rows: [] },
    scenarios: { bear: midAud * 0.5, base: midAud, bull: midAud * 2 },
    visuals: [],
    narrative: "Consensus narrative.",
    audit: { grounded: false, uncited: 0, revised: false, auditor: "llm-auditor", at: "2026-09-16T00:00:00.000Z" },
  };
}

const stripeRow: EvidenceRow = { evidence_id: "ev-stripe", source: "stripe", label: "Stripe revenue (last sync)", status: "evidenced", value: "mrr_aud = 12400", dims: ["tre"] };
const gate: PhaseGateResult = {
  currentPhase: "validation",
  currentPhaseLabel: "Validation",
  nextPhase: "position",
  phaseOrder: 1,
  completionPct: 40,
  canAdvance: false,
  blockers: [
    { code: "missing_required_criteria", subject: "customer_size", detail: "customer_size evidence is below 'good' quality" },
    { code: "dimension_below_floor", subject: "tre", detail: "TRE 31 is below the phase floor 40" },
  ],
} as unknown as PhaseGateResult;

describe("1. chapter score within ±10 of computeSVI", () => {
  it("keeps a chapter within tolerance and reconciles one outside it (deterministic wins, note + issue)", () => {
    const chapters = new Map<DimKey, DimensionChapter>([
      ["tre", chapter("tre", 58)],
      ["mpc", chapter("mpc", 80)],
    ]);
    const out = applyConsistencyGates({ chapters, dimScores: { tre: 52, mpc: 55 }, stage: 3, evidenceRows: [stripeRow], executiveSummary: "s" });
    expect(out.reconciled).toEqual(["mpc"]);
    expect(chapters.get("tre")!.score).toBe(58);
    expect(chapters.get("tre")!.scoreNote).toBeUndefined();
    const mpc = chapters.get("mpc")!;
    expect(mpc.score).toBe(55);
    expect(mpc.band).toBe("developing");
    expect(mpc.proposedScore).toBe(80);
    expect(mpc.scoreNote).toMatch(/Score reconciled/);
    expect(out.issues.filter((i) => i.type === "score_mismatch")).toHaveLength(1);
    expect(out.issues[0].severity).toBe("medium");
  });

  it("an unscored dimension (no computeSVI value) is left alone", () => {
    const chapters = new Map<DimKey, DimensionChapter>([["svm", chapter("svm", 90)]]);
    const out = applyConsistencyGates({ chapters, dimScores: {}, stage: 3, evidenceRows: [], executiveSummary: "" });
    expect(out.reconciled).toEqual([]);
    expect(chapters.get("svm")!.score).toBe(90);
  });
});

describe("2. valuation consensus within the stage band", () => {
  it("the band is the AU stage baseline widened ×0.5 / ×2", () => {
    const b = valuationStageBand(3);
    expect(b.low).toBe(VALUATION_BASELINES_AUD[3].low * 0.5);
    expect(b.high).toBe(VALUATION_BASELINES_AUD[3].high * 2);
    expect(valuationStageBand(99).mid).toBe(VALUATION_BASELINES_AUD[7].mid);
  });

  it("in-band consensus passes untouched; out-of-band keeps the range, cuts confidence and appends the note once", () => {
    const ok = valuation(VALUATION_BASELINES_AUD[3].mid);
    const outOk = applyConsistencyGates({ dimScores: {}, valuation: ok, stage: 3, evidenceRows: [], executiveSummary: "" });
    expect(outOk.valuationInBand).toBe(true);
    expect(ok.consensus.confidence).toBe(0.7);
    expect(ok.narrative).toBe("Consensus narrative.");

    const high = valuation(VALUATION_BASELINES_AUD[1].high * 5);
    const out = applyConsistencyGates({ dimScores: {}, valuation: high, stage: 1, evidenceRows: [], executiveSummary: "" });
    expect(out.valuationInBand).toBe(false);
    expect(high.consensus.confidence).toBe(0.56);
    expect(high.narrative).toMatch(/Consistency note: .* sits above the AU stage band/);
    expect(out.issues.some((i) => i.type === "data_misalignment")).toBe(true);
    // Idempotent: a second pass does not append a second note.
    applyConsistencyGates({ dimScores: {}, valuation: high, stage: 1, evidenceRows: [], executiveSummary: "" });
    expect(high.narrative.match(/Consistency note:/g)).toHaveLength(1);
  });

  it("no valuation → null verdict", () => {
    expect(applyConsistencyGates({ dimScores: {}, stage: 2, evidenceRows: [], executiveSummary: "" }).valuationInBand).toBeNull();
  });
});

describe("3. TRE must not state MRR without a revenue evidence row", () => {
  it("stripRevenueFigures: leaves burn / cost / salary / target figures alone, strips only revenue claims, swallows the trailing citation (W3 review)", () => {
    expect(stripRevenueFigures("Burn is A$40k per month [E2]").changed).toBe(false);
    expect(stripRevenueFigures("Hosting costs $500/mo and founder salary A$8k per month").changed).toBe(false);
    expect(stripRevenueFigures("Target MRR is A$50k by June").changed).toBe(false);
    expect(stripRevenueFigures("Projected ARR of A$1.2m in FY27").changed).toBe(false);
    const r = stripRevenueFigures("Traction: $12k MRR [E3] with 40 customers.");
    expect(r.changed).toBe(true);
    expect(r.text).toBe(`Traction: ${UNEVIDENCED_REVENUE} with 40 customers.`);
    expect(stripRevenueFigures("MRR reached A$12,400 last month").changed).toBe(true);
  });

  it("hasRevenueEvidence: connector rows or evidenced revenue-labelled rows count; partial / unrelated rows do not", () => {
    expect(hasRevenueEvidence([stripeRow])).toBe(true);
    expect(hasRevenueEvidence([{ ...stripeRow, source: "upload", label: "Revenue statement FY25" }])).toBe(true);
    // Founder-stated revenue counts: the valuation chapter is built from it, so the TRE narrative may cite it.
    expect(hasRevenueEvidence([{ ...stripeRow, source: "self_declared", label: "Founder evidence: revenue", status: "partial" }])).toBe(true);
    expect(hasRevenueEvidence([{ ...stripeRow, source: "self_declared", label: "Founder evidence: team", status: "partial" }])).toBe(false);
    expect(hasRevenueEvidence([{ ...stripeRow, source: "upload", label: "Pitch deck", value: "deck.pdf" }])).toBe(false);
  });

  it("stripRevenueFigures replaces stated MRR / ARR figures in every phrasing and leaves other money alone", () => {
    expect(stripRevenueFigures("MRR is A$12,400 from 9 customers").text).toBe(`${UNEVIDENCED_REVENUE} from 9 customers`);
    expect(stripRevenueFigures("Reached $150k ARR in June").text).toBe(`Reached ${UNEVIDENCED_REVENUE} in June`);
    expect(stripRevenueFigures("ARR: AUD 1.2m").changed).toBe(true);
    expect(stripRevenueFigures("$8k per month recurring").changed).toBe(true);
    expect(stripRevenueFigures("Raising A$1.5m at a A$6m cap").changed).toBe(false);
  });

  it("with no revenue evidence row the TRE verdict / strengths / gaps / criterion cards are cleaned, the chapter is marked ungrounded and an evidence_gap issue is raised", () => {
    const tre = chapter("tre", 55, {
      verdict: "Traction is real: MRR of A$12,400 across 9 customers [unevidenced].",
      strengths: ["ARR hit $150k in June [unevidenced]", "Two pilots signed [unevidenced]"],
      gaps: ["No cohort data [unevidenced]"],
      criteria: [{ key: "revenue", title: "Revenue", score: 55, quality: "good", verdict: "A$12,400 MRR stated", strengths: [], gaps: [], nextAction: "", citations: [], ownerAgent: "cro", lens: "tre" } as unknown as DimensionChapter["criteria"][number]],
    });
    const chapters = new Map<DimKey, DimensionChapter>([["tre", tre]]);
    // A founder-stated revenue row would count (see hasRevenueEvidence); an unrelated self-declared row does not.
    const out = applyConsistencyGates({ chapters, dimScores: { tre: 55 }, stage: 3, evidenceRows: [{ ...stripeRow, source: "self_declared", status: "partial", label: "Founder evidence: team" }], executiveSummary: "" });
    expect(out.treRevenueStripped).toBe(true);
    expect(tre.verdict).toContain(UNEVIDENCED_REVENUE);
    expect(tre.verdict).not.toMatch(/12,400/);
    expect(tre.strengths[0]).toContain(UNEVIDENCED_REVENUE);
    expect(tre.strengths[1]).toBe("Two pilots signed [unevidenced]");
    expect(tre.criteria[0].verdict).toContain(UNEVIDENCED_REVENUE);
    expect(tre.audit.grounded).toBe(false);
    expect(tre.audit.uncited).toBe(1);
    expect(out.issues.some((i) => i.type === "evidence_gap" && i.severity === "high")).toBe(true);
  });

  it("with a Stripe row the MRR statement stays", () => {
    const tre = chapter("tre", 55, { verdict: "MRR of A$12,400 [ev:ev-stripe]" });
    const out = applyConsistencyGates({ chapters: new Map([["tre", tre]]), dimScores: { tre: 55 }, stage: 3, evidenceRows: [stripeRow], executiveSummary: "" });
    expect(out.treRevenueStripped).toBe(false);
    expect(tre.verdict).toBe("MRR of A$12,400 [ev:ev-stripe]");
  });
});

describe("4. phase blockers listed in the executive summary = PhaseGateResult.blockers", () => {
  it("appends the deterministic blocker list when the summary omits one, and leaves a complete summary alone", () => {
    const missing = applyConsistencyGates({ dimScores: {}, stage: 2, evidenceRows: [], phaseGate: gate, executiveSummary: "Overview. Blockers: customer_size evidence is below 'good' quality." });
    expect(missing.blockersAppended).toBe(true);
    expect(missing.executiveSummary).toMatch(/\*\*Phase blockers — Validation/);
    expect(missing.executiveSummary).toMatch(/- TRE 31 is below the phase floor 40/);
    expect(missing.issues.some((i) => i.type === "narrative_conflict")).toBe(true);

    const complete = applyConsistencyGates({ dimScores: {}, stage: 2, evidenceRows: [], phaseGate: gate, executiveSummary: "Blockers: customer_size evidence is below 'good' quality; TRE 31 is below the phase floor 40." });
    expect(complete.blockersAppended).toBe(false);
    expect(complete.executiveSummary).not.toMatch(/Phase blockers —/);
  });

  it("no blockers → nothing appended", () => {
    const out = applyConsistencyGates({ dimScores: {}, stage: 2, evidenceRows: [], phaseGate: { ...gate, blockers: [] }, executiveSummary: "Clean." });
    expect(out.blockersAppended).toBe(false);
    expect(out.executiveSummary).toBe("Clean.");
  });
});
