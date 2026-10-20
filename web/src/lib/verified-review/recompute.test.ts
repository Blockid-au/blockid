import { describe, expect, it } from "vitest";
import { hasAcceptedFinancials, recomputeAfterReview, reviewedDimensionLevels, verificationInputsAfterReview } from "./recompute";

describe("verification level after review (level-engine.ts)", () => {
  it("accepted financial evidence lifts L2 → L3, never further", () => {
    const r = recomputeAfterReview({ currentLevel: 2, items: [{ decision: "accept", dims: ["tre"], level: "third_party_verified", source: "evidence_hub" }] });
    expect(r.previousLevel).toBe(2);
    expect(r.verificationLevel).toBe(3);
    expect(r.levelChanged).toBe(true);
    expect(r.inputs.independentlyAudited).toBe(false);
  });

  it("cannot skip a rung: an L1 startup with accepted financials stays L1 (no ABN / domain proof)", () => {
    const r = recomputeAfterReview({ currentLevel: 1, items: [{ decision: "accept", dims: ["tre"], level: "transaction_data", source: "stripe" }] });
    expect(r.verificationLevel).toBe(1);
    expect(r.levelChanged).toBe(false);
  });

  it("rejected or non-financial evidence does not attest financials; never demotes the persisted level", () => {
    expect(hasAcceptedFinancials([{ decision: "reject", dims: ["tre"], level: "transaction_data", source: "stripe" }])).toBe(false);
    expect(hasAcceptedFinancials([{ decision: "accept", dims: ["lco"], level: "third_party_verified" }])).toBe(false);
    expect(hasAcceptedFinancials([{ decision: "accept", dims: ["tre"], level: "document_uploaded" }])).toBe(false);
    expect(hasAcceptedFinancials([{ decision: "accept", dims: ["mpc"], level: "public_url", source: "xero" }])).toBe(true);
    expect(recomputeAfterReview({ currentLevel: 4, items: [] }).verificationLevel).toBe(4);
  });

  it("an ABN on file counts as the business id for an L0 project", () => {
    expect(verificationInputsAfterReview({ currentLevel: 0, hasAbn: true, items: [] })).toMatchObject({ hasBusinessId: true, emailVerified: true, abrConfirmed: false });
    expect(recomputeAfterReview({ currentLevel: 0, hasAbn: true, items: [] }).verificationLevel).toBe(1);
  });
});

describe("evidence confidence after review (evidence-confidence.ts)", () => {
  const analysis = {
    subs: [
      { key: "tre", breakdown: [{ source: "self_declared" }], assessed: true },
      { key: "lco", breakdown: [{ source: "document_uploaded" }], assessed: true },
    ],
  } as never;

  it("reviewed dims take the reviewer outcome; unreviewed dims keep the analysis rung", () => {
    const before = recomputeAfterReview({ currentLevel: 2, items: [], analysis });
    const after = recomputeAfterReview({ currentLevel: 2, items: [{ decision: "accept", dims: ["tre"], level: "third_party_verified" }], analysis });
    expect(after.evidenceConfidence.score).toBeGreaterThan(before.evidenceConfidence.score);
    expect(after.reviewedDims).toEqual(["tre"]);
    expect(after.evidenceConfidence.strongest).toBe("third_party_verified");
  });

  it("a dimension whose every reviewed item was rejected drops to no evidence", () => {
    const levels = reviewedDimensionLevels([{ decision: "reject", dims: ["lco"], level: "document_uploaded" }]);
    expect(levels.get("lco")).toBeNull();
    const r = recomputeAfterReview({ currentLevel: 2, items: [{ decision: "reject", dims: ["lco"], level: "document_uploaded" }], analysis });
    expect(r.evidenceConfidence.unevidenced).toContain("lco");
    expect(r.rejected).toBe(1);
  });

  it("no analysis: only the reviewer's accepted evidence counts", () => {
    const r = recomputeAfterReview({ currentLevel: 0, items: [{ decision: "accept", dims: ["ftv", "tre"], level: "connected_source" }] });
    expect(r.evidenceConfidence.score).toBeGreaterThan(0);
    expect(r.evidenceConfidence.unevidenced).not.toContain("ftv");
    expect(r.evidenceConfidence.unevidenced).toContain("svm");
  });
});
