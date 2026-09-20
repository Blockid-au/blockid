// G19-S43 / D2 — one lift model. Pins that the dashboard ("Evidence to add"
// block), the TBR chapter next action / 90-day plan and the engine's
// evidenceGaps all quote the same "+N" for the same catalogue item, and
// that no surface falls back to the pre-S43 `weight × (70 − score) / 100`
// "+1" default.

import { describe, expect, it } from "vitest";
import { deriveEvidenceGaps } from "@/lib/dashboard/evidence-gaps";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { EVIDENCE_CATALOG, calculateDimensionCompleteness, generateFixRoadmap } from "./svi-completeness";
import { catalogueCodeForSource, catalogueLift, clampLift, derivedLift, engineGapLift, liftForSource, nextBandTarget, reconcileLift, SOURCE_CATALOGUE_CODE } from "./svi-lift";

describe("svi-lift — the one lift model over EVIDENCE_CATALOG", () => {
  it("catalogueLift returns estimatedSviImpact for every catalogue code and undefined for unknown codes", () => {
    for (const items of Object.values(EVIDENCE_CATALOG)) for (const item of items) expect(catalogueLift(item.code)).toBe(item.estimatedSviImpact);
    expect(catalogueLift("no_such_code")).toBeUndefined();
    expect(catalogueLift(null)).toBeUndefined();
  });

  it("every source → code mapping names a real catalogue item on that dimension", () => {
    for (const [dim, map] of Object.entries(SOURCE_CATALOGUE_CODE)) {
      for (const [source, code] of Object.entries(map)) {
        const item = EVIDENCE_CATALOG[dim].find((i) => i.code === code);
        expect(item, `${dim}.${source} → ${code}`).toBeTruthy();
        expect(liftForSource(dim, source)).toBe(item!.estimatedSviImpact);
        expect(catalogueCodeForSource(dim, source)).toBe(code);
      }
    }
    expect(liftForSource("cgh", "stripe")).toBeUndefined();
  });

  it("derivedLift scales criterion weight × gap-to-next-band onto 1–10 and is never the old weight×(70−score)/100", () => {
    expect(nextBandTarget(50)).toBe(70);
    expect(nextBandTarget(69)).toBe(85);
    expect(nextBandTarget(80)).toBe(85);
    expect(derivedLift(8, 50)).toBe(6); // 8 × 20 / 25
    expect(derivedLift(6, 69)).toBe(4); // 6 × 16 / 25
    expect(derivedLift(10, 84)).toBe(1); // clamp floor
    expect(derivedLift(10, 0)).toBe(10); // clamp ceiling
    // The old formula printed +1 for a weight-12 dimension at 60; the model says +5 (12 × 10 / 25).
    expect(derivedLift(12, 60)).toBe(5);
    expect(Math.max(1, Math.round((12 * (70 - 60)) / 100))).toBe(1);
  });

  it("clampLift / reconcileLift: the catalogue wins when the action adds evidence, otherwise the LLM proposal is clamped to 1–10", () => {
    expect(clampLift(0)).toBe(1);
    expect(clampLift(40)).toBe(10);
    expect(clampLift(Number.NaN)).toBe(1);
    expect(reconcileLift(40, "ptd", "github", () => 3)).toBe(catalogueLift("github_repo"));
    expect(reconcileLift(40, "cgh", "stripe", () => 3)).toBe(10);
    expect(reconcileLift(0, "cgh", undefined, () => 3)).toBe(3);
  });

  it("engineGapLift keys the engine's gap labels to catalogue codes; the ladder step is website + founder_linkedin", () => {
    expect(engineGapLift("cap_table")).toBe(catalogueLift("cap_table_spreadsheet"));
    expect(engineGapLift("abn")).toBe(catalogueLift("abn_registration"));
    expect(engineGapLift("evidence_ladder")).toBe(clampLift(catalogueLift("website")! + catalogueLift("founder_linkedin")!));
  });
});

describe("dashboard · chapter · evidenceGaps agree (demo fixture)", () => {
  it("the dashboard 'Evidence to add' pts, the FTV / PTD chapter next action and the engine gap for GitHub all equal EVIDENCE_CATALOG.ptd.github_repo", () => {
    const expected = catalogueLift("github_repo")!;
    // Dashboard: no GitHub evidence on PTD → the roadmap item for github_repo carries the catalogue number.
    const dash = deriveEvidenceGaps({ evidenceRows: [], growthPhaseId: null, criteria: [], subs: null, limit: 8 });
    const roadmap = generateFixRoadmap(Object.keys(EVIDENCE_CATALOG).map((d) => calculateDimensionCompleteness(d, new Set())));
    expect(roadmap.find((r) => r.evidenceType === "github_repo")?.estimatedSviImpact).toBe(expected);
    expect(dash.gaps.every((g) => g.pts === catalogueLift(g.code))).toBe(true);
    // Chapter: the demo's FTV / PTD chapters carry a missing GitHub row → next action = the linked CTA at the catalogue lift.
    const report = demoReportV2();
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    const ptd = report.dimensions.find((d) => d.dim === "ptd")!;
    expect(ftv.nextAction).toMatchObject({ evidenceToAdd: "github", expectedLift: expected });
    expect(ptd.nextAction).toMatchObject({ evidenceToAdd: "github", expectedLift: expected });
    expect(ftv.evidence.find((e) => e.status === "missing" && e.source === "github")?.cta?.lift).toBe(expected);
    // Plan: the step for that chapter quotes the same lift; the P1 gap row too.
    expect(report.actionPlan.steps.find((s) => s.evidenceToAdd === "github")?.expectedLift).toBe(expected);
    expect(report.actionPlan.evidenceToAdd?.find((e) => /source code/i.test(e.label))?.cta?.lift).toBe(expected);
    // Engine: the same number on the "Link source code repository" gap.
    const analysis = computeSVI(extractSignals({ rawText: "We build compliance software for SMEs." }));
    expect(analysis.evidenceGaps.find((g) => g.label === "Link source code repository")?.impact).toBe(expected);
  });

  it("no demo chapter quotes the old '+1' default and every lift sits inside the catalogue range", () => {
    const report = demoReportV2();
    const lifts = report.dimensions.map((d) => d.nextAction.expectedLift);
    expect(lifts.every((l) => l >= 1 && l <= 10)).toBe(true);
    expect(lifts.filter((l) => l === 1).length).toBeLessThan(lifts.length / 2);
    expect(report.actionPlan.steps.every((s) => s.expectedLift >= 1 && s.expectedLift <= 10)).toBe(true);
  });
});
