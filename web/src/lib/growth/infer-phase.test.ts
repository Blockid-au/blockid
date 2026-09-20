// G19-S44 (D5) — one phase rule: the dashboard (`displayPhaseFor` over the
// analysis subs + evaluation_criteria rows), the report adapter
// (`fromSnapshot(...).cover.phaseId`) and the pipeline's `inferPhase` call
// must name the same phase for the same startup. Three fixtures: declared
// phase, scored-but-undeclared, and nothing known.

import { describe, expect, it } from "vitest";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { fromSnapshot, inferPhase as adapterInferPhase, qualityFromScore, type SnapshotCriterionState, type SnapshotDimState } from "@/lib/report-v2/adapter";
import { demoSnapshotInput } from "@/lib/report-v2/fixtures";
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";
import { displayPhaseFor, inferPhase, phaseDimsFromAnalysis } from "./infer-phase";

/** What the dashboard has: `SVIAnalysis.subs` + `evaluation_criteria` rows — derived from the same snapshot the adapter reads. */
function dashboardInputs(dimStates: Record<string, SnapshotDimState | undefined>, criteria: SnapshotCriterionState[] | null | undefined) {
  const subs = Object.entries(dimStates).map(([key, st]) => ({ key, value: st?.score ?? undefined }));
  const rows = (criteria ?? []).map((c) => ({ criterion_key: c.key, quality_level: qualityFromScore(Math.max(0, Math.min(100, Math.round(c.score)))) }));
  return { subs, rows };
}

describe("inferPhase — one rule for dashboard, adapter and pipeline", () => {
  it("is the same function the adapter re-exports", () => {
    expect(adapterInferPhase).toBe(inferPhase);
  });

  it("fixture 1 (declared phase): dashboard pill === report cover === pipeline gate", () => {
    const input = demoSnapshotInput();
    expect(input.phaseId).toBe("investor_review");
    const { subs, rows } = dashboardInputs(input.dimStates, input.criterionStates);
    const dashboard = displayPhaseFor({ declared: input.phaseId, criteria: rows, dims: phaseDimsFromAnalysis(subs) });
    const cover = fromSnapshot(input).cover.phaseId;
    const pipeline = inferPhase(input.phaseId, rows, phaseDimsFromAnalysis(subs)).currentPhase;
    expect(dashboard).toBe("investor_review");
    expect(cover).toBe(dashboard);
    expect(pipeline).toBe(dashboard);
  });

  it("fixture 2 (scored, nothing declared): all three walk the gates and land on the same first uncleared phase — never the SVI-band bridge", () => {
    const input = { ...demoSnapshotInput(), phaseId: null };
    const { subs, rows } = dashboardInputs(input.dimStates, input.criterionStates);
    const dashboard = displayPhaseFor({ declared: null, criteria: rows, dims: phaseDimsFromAnalysis(subs) });
    const cover = fromSnapshot(input).cover.phaseId;
    const pipeline = inferPhase(null, rows, phaseDimsFromAnalysis(subs)).currentPhase;
    expect(dashboard).not.toBeNull();
    expect(GROWTH_PHASE_IDS).toContain(dashboard);
    expect(cover).toBe(dashboard);
    expect(pipeline).toBe(dashboard);
    // The demo is strong on every criterion, so the walk goes well past "vision".
    expect(dashboard).not.toBe("vision");
  });

  it("fixture 3 (weak criteria, low dims): the first gate with a blocker wins on every surface", () => {
    const criterionStates: SnapshotCriterionState[] = CRITERIA.map((c) => ({ key: c.key, title: c.title, primary_dimension: c.primaryDimension, weight: c.weight, score: 25, verdict: "thin", strengths: [], gaps: ["no evidence"], next_action: "add evidence" }));
    const dimStates: Record<string, SnapshotDimState> = Object.fromEntries(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"].map((d) => [d, { score: 30 }]));
    const input = { ...demoSnapshotInput(), phaseId: null, criterionStates, dimStates, sviTotal: 30 };
    const { subs, rows } = dashboardInputs(dimStates, criterionStates);
    const dashboard = displayPhaseFor({ declared: null, criteria: rows, dims: phaseDimsFromAnalysis(subs) });
    const report = fromSnapshot(input);
    const gate = inferPhase(null, rows, phaseDimsFromAnalysis(subs));
    expect(dashboard).toBe("vision");
    expect(report.cover.phaseId).toBe(dashboard);
    expect(report.executive.phaseNow.currentPhase).toBe(dashboard);
    expect(gate.currentPhase).toBe(dashboard);
    expect(gate.blockers.length).toBeGreaterThan(0);
  });

  it("nothing known at all → null (dashboard 'start here'); a declared phase alone is enough", () => {
    expect(displayPhaseFor({})).toBeNull();
    expect(displayPhaseFor({ declared: "not-a-phase", criteria: [], dims: {} })).toBeNull();
    expect(displayPhaseFor({ declared: "pitch" })).toBe("pitch");
  });

  it("phaseDimsFromAnalysis: map wins over subs, non-finite dropped, svm ignored (no floor)", () => {
    const dims = phaseDimsFromAnalysis([{ key: "tre", value: 40 }, { key: "svm", value: 90 }, { key: "mpc", value: Number.NaN }], { tre: 55 });
    expect(dims).toEqual({ tre: 55 });
  });
});
