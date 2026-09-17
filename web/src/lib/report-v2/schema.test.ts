// Colocated tests for the ReportV2 contract (spec §A.2 Zod rules).
// The demo fixture is the "known good" document; each rule is exercised by
// mutating one field and asserting the validator names it.

import { describe, expect, it } from "vitest";
import { demoReportV2 } from "./fixtures";
import {
  DATA_PRINCIPLE_SENTENCE,
  DIM_ORDER,
  ReportV2ValidationError,
  assertReportV2,
  isReportV2,
  looksLikeReportV2,
  type ReportV2,
} from "./schema";

function clone(): ReportV2 {
  return JSON.parse(JSON.stringify(demoReportV2())) as ReportV2;
}

function issuesOf(r: unknown): string[] {
  try {
    assertReportV2(r);
    return [];
  } catch (e) {
    if (e instanceof ReportV2ValidationError) return e.issues;
    throw e;
  }
}

describe("ReportV2 schema — happy path", () => {
  it("accepts the demo fixture and narrows the type", () => {
    const r = assertReportV2(demoReportV2());
    expect(r.schemaVersion).toBe("2.0");
    expect(r.dimensions).toHaveLength(8);
    expect(isReportV2(r)).toBe(true);
    expect(looksLikeReportV2(r)).toBe(true);
    expect(looksLikeReportV2({ schemaVersion: "2.0" })).toBe(false);
    expect(looksLikeReportV2(null)).toBe(false);
  });

  it("chapters follow DIM_ORDER and every primary visual is a rendered, accessible SVG", () => {
    const r = demoReportV2();
    expect(r.dimensions.map((d) => d.dim)).toEqual([...DIM_ORDER]);
    for (const d of r.dimensions) {
      expect(d.primaryVisual.svg).toContain('role="img"');
      expect(d.primaryVisual.svg).toContain("<title");
      expect(d.criteria.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("ReportV2 schema — rules", () => {
  it("rejects 7 chapters", () => {
    const r = clone();
    r.dimensions.pop();
    expect(issuesOf(r).some((i) => i.includes("exactly 8"))).toBe(true);
  });

  it("rejects chapters out of DIM_ORDER", () => {
    const r = clone();
    [r.dimensions[0], r.dimensions[1]] = [r.dimensions[1], r.dimensions[0]];
    expect(issuesOf(r).some((i) => i.includes("DIM_ORDER"))).toBe(true);
  });

  it("rejects a chapter whose primary visual has no rendered svg", () => {
    const r = clone();
    r.dimensions[2].primaryVisual.svg = undefined;
    expect(issuesOf(r).some((i) => i.startsWith("dimensions.2.primaryVisual") && i.includes('role="img"'))).toBe(true);
  });

  it("rejects a chapter with zero criterion cards", () => {
    const r = clone();
    r.dimensions[3].criteria = [];
    expect(issuesOf(r).some((i) => i.includes("criteria.length"))).toBe(true);
  });

  it("rejects `real` primary visuals on chapters with no evidence rows", () => {
    const r = clone();
    r.dimensions[4].evidence = [];
    r.dimensions[4].primaryVisual.dataState = "real";
    expect(issuesOf(r).some((i) => i.includes("dimensions.4.primaryVisual.dataState"))).toBe(true);
    // …but allows it once an evidence row exists.
    r.dimensions[4].evidence = [{ evidence_id: "ev-1", source: "upload", label: "Cap table register", status: "evidenced", dims: ["cgh"] }];
    expect(issuesOf(r)).toEqual([]);
  });

  it("rejects a verdict longer than 80 words", () => {
    const r = clone();
    r.dimensions[0].verdict = Array.from({ length: 81 }, (_, i) => `w${i}`).join(" ");
    expect(issuesOf(r).some((i) => i.includes("80 words"))).toBe(true);
  });

  it("requires exactly the 6 valuation methods with scorecard at weight 0", () => {
    const r = clone();
    r.valuation.methods = r.valuation.methods.slice(0, 5);
    expect(issuesOf(r).some((i) => i.includes("6 methods"))).toBe(true);
    const r2 = clone();
    r2.valuation.methods = r2.valuation.methods.map((m) => (m.method === "scorecard" ? { ...m, weight: 0.5 } : m));
    expect(issuesOf(r2).some((i) => i.includes("scorecard"))).toBe(true);
    const r3 = clone();
    r3.valuation.methods[0] = { ...r3.valuation.methods[1] };
    expect(issuesOf(r3).some((i) => i.includes("unique"))).toBe(true);
  });

  it("pins the approved data-principle sentence", () => {
    const r = clone();
    r.appendix.dataPrinciple = "We keep your data safe.";
    expect(issuesOf(r).some((i) => i.startsWith("appendix.dataPrinciple"))).toBe(true);
    expect(DATA_PRINCIPLE_SENTENCE).toContain("Your data belongs to your startup.");
  });

  // G14-S36 — cover.verification (optional; adapter always fills it).
  it("cover.verification: demo fixture is L2 'Verified ABN'; a pre-S36 document without it stays valid; bad level / label rejected", () => {
    const r = clone();
    expect(r.cover.verification).toEqual({ level: 2, abnVerified: true, label: "Verified ABN" });
    expect(isReportV2(r)).toBe(true);

    const legacy = clone();
    delete legacy.cover.verification;
    expect(isReportV2(legacy)).toBe(true);

    const badLevel = clone();
    badLevel.cover.verification = { level: 7, abnVerified: true, label: "Verified ABN" };
    expect(issuesOf(badLevel).some((i) => i.startsWith("cover.verification.level"))).toBe(true);

    const badLabel = clone();
    badLabel.cover.verification = { level: 0, abnVerified: false, label: "Unverified" as never };
    expect(issuesOf(badLabel).some((i) => i.startsWith("cover.verification.label"))).toBe(true);
  });

  it("three questions are ≤ 30 words each", () => {
    const r = clone();
    r.cover.threeQuestions.where = Array.from({ length: 31 }, () => "x").join(" ");
    expect(issuesOf(r).some((i) => i.startsWith("cover.threeQuestions.where"))).toBe(true);
  });

  it("rejects an unknown visual kind and an unknown agent", () => {
    const r = clone();
    (r.cover.visuals[0] as { kind: string }).kind = "hologram";
    (r.dimensions[0] as { ownerAgent: string }).ownerAgent = "cxo";
    const issues = issuesOf(r);
    expect(issues.some((i) => i.startsWith("cover.visuals.0.kind"))).toBe(true);
    expect(issues.some((i) => i.startsWith("dimensions.0.ownerAgent"))).toBe(true);
  });

  it("lists every issue in the thrown error", () => {
    const r = clone();
    (r as { schemaVersion: string }).schemaVersion = "1.0";
    r.dimensions = [];
    let err: ReportV2ValidationError | null = null;
    try {
      assertReportV2(r);
    } catch (e) {
      err = e as ReportV2ValidationError;
    }
    expect(err).toBeInstanceOf(ReportV2ValidationError);
    expect(err!.issues.length).toBeGreaterThanOrEqual(2);
    expect(err!.message).toContain("ReportV2 invalid");
  });
});
