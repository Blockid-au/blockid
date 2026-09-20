// Colocated tests for the shared ledger row model (G19-S41) that the web
// chapter, the PDF and the DOCX all render from.

import { describe, expect, it } from "vitest";
import { demoReportV2 } from "./fixtures";
import { coverLedgerCells, deterministicScore, isUnassessed, ledgerReconciles, ledgerRowsFor, pendingDimsLine, pendingLine, signed } from "./ledger-rows";
import type { ScoreBreakdown } from "./schema";

const bd: ScoreBreakdown = {
  base: 40,
  signals: [
    { signal: "ABN/ASIC registration confirmed", points: 20, source: "document_uploaded" },
    { signal: "Tech audit: +6 (HTTPS + security headers)", points: 6, source: "audit" },
    { signal: "Evidence vault: LCO documents less than 50% complete", points: -10, source: "document_uploaded", scale: "adjustment" },
  ],
  confidenceMultiplier: 0.5,
  verificationMultiplier: 1.05,
  adjustment: -9, // round((66-50)*0.08*0.5)=1, then −10
  assessed: true,
};

describe("ledger-rows", () => {
  it("signed formats ± with a true minus sign", () => {
    expect(signed(35)).toBe("+35");
    expect(signed(-10)).toBe("−10");
    expect(signed(0)).toBe("0");
  });

  it("deterministicScore ignores adjustment-scale rows and clamps; ledgerReconciles compares with the chapter score", () => {
    expect(deterministicScore(bd)).toBe(66);
    expect(ledgerReconciles(bd, 66)).toBe(true);
    expect(ledgerReconciles(bd, 70)).toBe(false);
    expect(deterministicScore({ ...bd, signals: [{ signal: "x", points: 90, source: "audit" }] })).toBe(100);
  });

  it("ledgerRowsFor: base → signals (± points, localised source, adjustment-scale marker) → = score → × weight × confidence → × verification → = adjustment", () => {
    const rows = ledgerRowsFor({ weight: 8, score: 66, scoreBreakdown: bd }, "en", 3);
    expect(rows.map((r) => r.kind)).toEqual(["base", "signal", "signal", "signal", "score", "factor", "factor", "adjustment"]);
    expect(rows[0].label).toBe("Base 40");
    expect(rows[1]).toMatchObject({ label: "ABN/ASIC registration confirmed", points: "+20", source: "document" });
    expect(rows[2]).toMatchObject({ points: "+6", source: "audit" });
    expect(rows[3]).toMatchObject({ points: "−10", adjustmentScale: true });
    expect(rows[4].label).toBe("= score 66/100 (base + signals, clamped 0–100)");
    expect(rows[5].label).toBe("× weight 8 % × evidence confidence 0.50");
    expect(rows[6].label).toBe("× verification L3 1.05");
    expect(rows[7].label).toBe("= adjustment −9 on the SVI base of 100");
    // No verification level known → no verification row.
    expect(ledgerRowsFor({ weight: 8, score: 66, scoreBreakdown: bd }, "en").map((r) => r.kind)).not.toContain("verification");
    expect(ledgerRowsFor({ weight: 8, score: 66, scoreBreakdown: bd }, "en")).toHaveLength(7);
    // Vietnamese rows carry diacritics.
    const vi = ledgerRowsFor({ weight: 8, score: 66, scoreBreakdown: bd }, "vi", 2);
    expect(vi[0].label).toBe("Điểm nền 40");
    expect(vi[1].source).toBe("tài liệu tải lên");
    expect(vi[5].label).toBe("× trọng số 8 % × độ tin cậy bằng chứng 0.50");
  });

  it("an unassessed or missing ledger yields no rows; pendingLine names the dimension's connectors", () => {
    expect(ledgerRowsFor({ weight: 20, score: 30, scoreBreakdown: { ...bd, assessed: false } })).toEqual([]);
    expect(ledgerRowsFor({ weight: 20, score: 30 })).toEqual([]);
    expect(isUnassessed({ scoreBreakdown: { ...bd, assessed: false } })).toBe(true);
    expect(isUnassessed({})).toBe(false);
    expect(pendingLine({ dim: "tre", scoreBreakdown: { ...bd, assessed: false } })).toEqual({ text: "Not assessed yet — no evidence for this dimension.", add: "Add: stripe, xero, ga4" });
    expect(pendingLine({ dim: "tre" }, "vi").add).toBe("Bổ sung: stripe, xero, ga4");
  });

  it("coverLedgerCells folds the 8 dims, hides zero optional terms and ends on the total; pendingDimsLine counts pending bands", () => {
    const report = demoReportV2();
    expect(coverLedgerCells(report.cover)).toEqual([]);
    expect(pendingDimsLine(report.cover)).toBeNull();
    report.cover.sviLedger = { base: 100, dimAdjustments: { tre: 4, mpc: 3, ftv: 4, ptd: 3, cgh: 2, iri: 2, lco: 2, svm: 1 }, stageBonus: 8, riskPenalties: -6, sectorAdj: 0, metricsBonus: 12, ciBoost: 0, floorClamp: 0, total: 135 };
    expect(coverLedgerCells(report.cover).map((c) => `${c.label} ${c.value}`)).toEqual(["Base 100", "8 dimensions +21", "Stage bonus +8", "Risk penalties −6", "Metrics +12", "Total 135"]);
    report.cover.dims.svm.band = "pending";
    report.cover.dims.iri.band = "pending";
    expect(pendingDimsLine(report.cover)).toBe("2 of 8 dimensions pending");
    expect(pendingDimsLine(report.cover, "vi")).toBe("2 trên 8 khía cạnh chưa đánh giá");
  });
});
