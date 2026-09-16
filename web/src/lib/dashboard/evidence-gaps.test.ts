// Block 4 "Evidence to add" — pure derivation pins (G13-W3-IA3 spec §B.1 row 4).

import { describe, expect, it } from "vitest";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import { deriveEvidenceGaps, dimensionLabel, sviDimensionsFromSubs } from "./evidence-gaps";

describe("deriveEvidenceGaps", () => {
  it("zero data → three gaps on three different dimensions, ordered by SVI impact, no phase gate", () => {
    const out = deriveEvidenceGaps({ evidenceRows: [], growthPhaseId: null, criteria: [], subs: null });
    expect(out.gaps).toHaveLength(3);
    expect(new Set(out.gaps.map((g) => g.dimension)).size).toBe(3);
    expect(out.gaps[0].pts).toBeGreaterThanOrEqual(out.gaps[1].pts);
    expect(out.gaps[1].pts).toBeGreaterThanOrEqual(out.gaps[2].pts);
    // revenue_proof (+10, tre) is the single biggest catalogue item.
    expect(out.gaps[0]).toMatchObject({ code: "revenue_proof", dimension: "tre", dimensionLabel: "Traction & Revenue", blocked: false });
    expect(out.phaseGate).toBeNull();
    expect(out.blockers).toEqual([]);
    expect(out.presentCount).toBe(0);
  });

  it("present catalogue rows are excluded and counted", () => {
    const out = deriveEvidenceGaps({
      evidenceRows: [
        { dimension: "tre", evidence_type: "revenue_proof" },
        { dimension: "TRE", evidence_type: "mrr_dashboard" },
        { dimension: null, evidence_type: "ignored" },
      ],
      growthPhaseId: null,
      criteria: [],
      subs: null,
    });
    expect(out.presentCount).toBe(2);
    expect(out.gaps.some((g) => g.code === "revenue_proof" || g.code === "mrr_dashboard")).toBe(false);
  });

  it("a phase-blocked dimension outranks a bigger catalogue item elsewhere", () => {
    // legal_equity floors: cgh 50, lco 45 — subs below both → blocked dims first.
    const out = deriveEvidenceGaps({
      evidenceRows: [],
      growthPhaseId: "legal_equity",
      criteria: [],
      subs: [
        { key: "cgh", value: 20 },
        { key: "lco", value: 20 },
        { key: "tre", value: 90 },
      ],
    });
    expect(out.phaseGate?.currentPhase).toBe("legal_equity");
    expect(out.blockers.length).toBeGreaterThan(0);
    expect(out.gaps[0].blocked).toBe(true);
    expect(["cgh", "lco"]).toContain(out.gaps[0].dimension);
    expect(out.gaps[1].blocked).toBe(true);
    expect(out.gaps[2].blocked).toBe(false);
  });

  it("honours `limit` and an unknown phase id is treated as no phase", () => {
    const out = deriveEvidenceGaps({ evidenceRows: [], growthPhaseId: "not-a-phase", criteria: [], subs: [], limit: 1 });
    expect(out.gaps).toHaveLength(1);
    expect(out.phaseGate).toBeNull();
  });

  it("sviDimensionsFromSubs keeps only the 7 floor dimensions with finite numbers", () => {
    expect(
      sviDimensionsFromSubs([
        { key: "ftv", value: 55 },
        { key: "svm", value: 40 },
        { key: "tre", value: Number.NaN },
        { key: "bogus", value: 1 },
      ]),
    ).toEqual({ ftv: 55 });
    expect(sviDimensionsFromSubs(null)).toEqual({});
  });

  it("dimensionLabel covers every catalogue dimension", () => {
    for (const dim of Object.keys(EVIDENCE_CATALOG)) {
      expect(dimensionLabel(dim)).not.toBe(dim.toUpperCase());
    }
    expect(dimensionLabel("zzz")).toBe("ZZZ");
  });
});
