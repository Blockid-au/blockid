// charts-v2 (G13-W2-R2, spec §C.4 / §C.11): chapter visuals come from
// module outputs / evidence numbers; an owner-proposed series is accepted
// only when its kind is allowed AND every number passes provenance.

import { describe, expect, it } from "vitest";
import {
  checkProvenance,
  evidenceNumbers,
  generateChartsV2,
  numberTraceable,
  proposalToData,
  type ChapterVisualDraft,
} from "./chart-generator";
import { DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import type { EvidenceRow } from "@/lib/report-v2/schema";

const row = (id: string, value?: string): EvidenceRow => ({ evidence_id: id, source: "self_declared", label: id, status: "partial", value, dims: ["tre"] });

function draft(dim: DimKey, extra: Partial<ChapterVisualDraft> = {}): ChapterVisualDraft {
  return {
    dim,
    ownerAgent: DIMENSION_OWNERS[dim].primary,
    score: 55,
    benchmark: { p25: 40, p50: 52, p75: 64 },
    stageLabel: "Seed",
    criterionScore: (key) => (key === "revenue" ? 61 : key === "customer_size" ? 58 : null),
    moduleOutputs: [{ id: "svi-analysis.ts:extractSignals(traction)", output: { mrrAud: 12400, hasRevenue: true } }],
    evidence: [row("ev-1", "MRR A$12,400 from 9 customers")],
    ...extra,
  };
}

describe("number provenance", () => {
  it("evidenceNumbers parses every figure in the row values (commas stripped)", () => {
    expect(evidenceNumbers([row("a", "MRR A$12,400 from 9 customers"), row("b")])).toEqual([12400, 9]);
  });
  it("numberTraceable allows rounding (0.5 abs or 1 %)", () => {
    expect(numberTraceable(12401, [12400])).toBe(true);
    expect(numberTraceable(12550, [12400])).toBe(false);
    expect(numberTraceable(52, [52.4])).toBe(true);
  });
  it("checkProvenance flags every untraceable number in values and points", () => {
    const rep = checkProvenance({ kind: "line", series: [{ label: "x", points: [12400, 9, 777] }, { label: "y", value: 55 }] }, [12400, 9, 55]);
    expect(rep.checked).toBe(4);
    expect(rep.unresolved).toEqual([777]);
    expect(rep.downgraded).toBe(true);
  });
});

describe("generateChartsV2", () => {
  it("every dimension renders a deterministic primary + ≥ 1 secondary with an accessible SVG", () => {
    DIM_ORDER.forEach((dim) => {
      const out = generateChartsV2(draft(dim, { evidence: [] }));
      expect(out.primary.kind).toBe(DIMENSION_OWNERS[dim].primaryVisual);
      expect(out.primary.svg).toContain("role=\"img\"");
      expect(out.primary.svg).toContain("<title");
      expect(out.primary.dataState).not.toBe("real");
      expect(out.secondary.length).toBeGreaterThanOrEqual(1);
      expect(out.provenance.downgraded).toBe(false);
    });
  });

  it("uses an owner proposal when the kind is allowed and every number is traceable", () => {
    const out = generateChartsV2(draft("tre", { proposedPrimary: { kind: "bar", data_state: "real", title: "MRR vs customers", series: [{ label: "MRR", value: 12400 }, { label: "Customers", value: 9 }] } }));
    expect(out.primary.kind).toBe("bar");
    expect(out.primary.title).toBe("MRR vs customers");
    expect(out.primary.dataState).toBe("real");
    expect(out.primary.data).toEqual({ bars: [{ label: "MRR", value: 12400 }, { label: "Customers", value: 9 }], max: 100 });
    expect(out.provenance.downgraded).toBe(false);
  });

  it("downgrades to the deterministic chart (data_state partial) when a number is untraceable", () => {
    const out = generateChartsV2(draft("tre", { proposedPrimary: { kind: "bar", data_state: "real", series: [{ label: "MRR", value: 99999 }] } }));
    expect(out.primary.kind).toBe("sparkline");
    expect(out.primary.dataState).not.toBe("real");
    expect(out.provenance.unresolved).toEqual([99999]);
    expect(out.provenance.downgraded).toBe(true);
  });

  it("never lets a proposal claim `real` without evidence rows", () => {
    const out = generateChartsV2(draft("tre", { evidence: [], proposedPrimary: { kind: "bar", data_state: "real", series: [{ label: "MRR", value: 12400 }] } }));
    expect(out.primary.kind).toBe("bar");
    expect(out.primary.dataState).toBe("partial");
  });

  it("rejects kinds outside allowedVisuals and kinds the generic series cannot fill", () => {
    const wrongKind = generateChartsV2(draft("cgh", { proposedPrimary: { kind: "sparkline", series: [{ label: "a", value: 55 }] } }));
    expect(wrongKind.primary.kind).toBe("donut");
    expect(wrongKind.provenance.downgraded).toBe(true);
    const heat = generateChartsV2(draft("ftv", { proposedPrimary: { kind: "heat_map", series: [{ label: "a", value: 55 }] } }));
    expect(heat.primary.id).toBe("dim-ftv-primary");
    expect(heat.provenance.downgraded).toBe(true);
  });

  it("proposalToData maps generic series onto the kind shapes", () => {
    expect(proposalToData("donut", { kind: "donut", series: [{ label: "F", value: 70 }] })).toEqual({ slices: [{ label: "F", value: 70 }] });
    expect(proposalToData("line", { kind: "line", series: [{ label: "F", points: [70, 56] }] })).toEqual({ series: [{ label: "F", points: [70, 56] }] });
    expect(proposalToData("sparkline", { kind: "sparkline", series: [{ label: "m", points: [1, 2, 3] }] })).toEqual({ points: [{ value: 1 }, { value: 2 }, { value: 3 }] });
    expect(proposalToData("radar", { kind: "radar", series: [{ label: "a", value: 1 }] })).toBeNull();
    expect(proposalToData("heat_map", { kind: "heat_map", series: [] })).toBeNull();
  });

  it("module outputs drive the deterministic charts (Antler bars, compliance checklist, moat radar, readiness ring)", () => {
    const ftv = generateChartsV2(draft("ftv", { moduleOutputs: [{ id: "agents/antler-signals.ts:evaluateAntlerSignals", output: { progressionScore: 60, team: 70, market: 40 } }] }));
    expect(ftv.secondary[0].title).toContain("Antler");
    const lco = generateChartsV2(draft("lco", { moduleOutputs: [{ id: "agents/clo-compliance.ts:calculateComplianceScore", output: { completedIds: ["acn", "sha"] } }] }));
    const items = (lco.primary.data as { items: Array<{ status: string }> }).items;
    expect(items[0].status).toBe("done");
    expect(items[1].status).toBe("pending");
    const svm = generateChartsV2(draft("svm", { moduleOutputs: [{ id: "report-pipeline/module-precompute.ts:fiveFactorMoat", output: { networkEffects: 100, switchingCosts: 0, brand: 20, proprietaryData: 100, economiesOfScale: 50 } }] }));
    expect(svm.primary.title).toContain("5-factor moat");
    const iri = generateChartsV2(draft("iri", { moduleOutputs: [{ id: "agents/cro-funding-readiness.ts:scoreFundingReadiness", output: { overall: 47 } }] }));
    expect((iri.secondary[0].data as { value: number }).value).toBe(47);
  });
});
