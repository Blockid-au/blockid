// G21-P1-B — the one Evidence Confidence number: deterministic, table-tested.

import { describe, expect, it } from "vitest";
import { EVIDENCE_CONFIDENCE, computeSVI, extractSignals } from "@/lib/svi-analysis";
import { VERIFICATION_MULTIPLIER } from "@/lib/verification/confidence-multiplier";
import { DIM_WEIGHTS } from "@/lib/report-pipeline/dimension-owners";
import {
  EVIDENCE_LEVEL_BADGES,
  badgeForLevel,
  evidenceConfidence,
  evidenceConfidenceFromAnalysis,
  evidenceConfidenceInputFromAnalysis,
  ladderWeight,
  levelForBadge,
  strongestSignalLevel,
  verificationLabel,
} from "./evidence-confidence";

const DIMS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
const all = (level: string | null, extra: Partial<{ weight: number; assessed: boolean }> = {}) => DIMS.map((dim) => ({ dim, level, ...extra }));

describe("evidenceConfidence — table", () => {
  it.each([
    // label · dimensions · verification · expected score
    ["nothing evidenced", all(null), null, 0],
    ["every dimension self-declared", all("self_declared"), null, 20],
    ["every dimension public URL", all("public_url"), null, 35],
    ["every dimension document uploaded", all("document_uploaded"), null, 50],
    ["every dimension connected", all("connected_source"), null, 75],
    ["every dimension transaction data", all("transaction_data"), null, 90],
    ["every dimension third-party verified", all("third_party_verified"), null, 100],
    ["half the dimensions documented, half empty (equal weights)", [...DIMS.slice(0, 4).map((dim) => ({ dim, level: "document_uploaded" })), ...DIMS.slice(4).map((dim) => ({ dim, level: null }))], null, 25],
    ["unassessed dimensions contribute 0 whatever they say", all("third_party_verified", { assessed: false }), null, 0],
    ["L0 lowers (×0.85)", all("document_uploaded"), 0, 43],
    ["L2 is neutral", all("document_uploaded"), 2, 50],
    ["L5 lifts (×1.10) but never above the next rung", all("document_uploaded"), 5, 55],
    ["self-declared at L5 is bounded by the public_url rung ceiling", all("self_declared"), 5, 22],
    ["third-party verified at L5 stays at 100", all("third_party_verified"), 5, 100],
    ["empty input", [], 3, 0],
  ])("%s", (_label, dimensions, verificationLevel, expected) => {
    expect(evidenceConfidence({ dimensions, verificationLevel }).score).toBe(expected);
  });

  it("is order-independent and deterministic", () => {
    const a = evidenceConfidence({ dimensions: [{ dim: "tre", level: "transaction_data", weight: 20 }, { dim: "lco", level: "self_declared", weight: 8 }], verificationLevel: 2 });
    const b = evidenceConfidence({ dimensions: [{ dim: "lco", level: "self_declared", weight: 8 }, { dim: "tre", level: "transaction_data", weight: 20 }], verificationLevel: 2 });
    expect(a).toEqual(b);
    // weighted share: (20 × 0.9 + 8 × 0.2) / 28 = 0.7 → 70
    expect(a.score).toBe(70);
    expect(a.strongest).toBe("transaction_data");
    expect(a.unevidenced).toEqual([]);
  });

  it("caps a level by its origin (D4): founder prose never reaches document_uploaded", () => {
    const r = evidenceConfidence({ dimensions: all("third_party_verified").map((d) => ({ ...d, origin: "founder_text" as const })) });
    expect(r.score).toBe(Math.round(EVIDENCE_CONFIDENCE.self_declared * 100));
    const upload = evidenceConfidence({ dimensions: all("third_party_verified").map((d) => ({ ...d, origin: "founder_upload" as const })) });
    expect(upload.score).toBe(50);
  });

  it("reuses the ladder + multiplier constants rather than its own numbers", () => {
    for (const [level, w] of Object.entries(EVIDENCE_CONFIDENCE)) expect(ladderWeight(level as never)).toBe(w);
    const base = evidenceConfidence({ dimensions: all("connected_source") });
    const l0 = evidenceConfidence({ dimensions: all("connected_source"), verificationLevel: 0 });
    expect(l0.score).toBe(Math.round(base.share * VERIFICATION_MULTIPLIER[0] * 100));
    expect(l0.verificationMultiplier).toBeCloseTo(VERIFICATION_MULTIPLIER[0], 2);
  });

  it("lists the unevidenced dimensions", () => {
    const r = evidenceConfidence({ dimensions: [{ dim: "tre", level: "document_uploaded" }, { dim: "mpc", level: null }, { dim: "ftv", level: "bogus" }] });
    expect(r.unevidenced).toEqual(["mpc", "ftv"]);
  });
});

describe("badges + labels", () => {
  it("maps the six rungs to L1–L6 and back", () => {
    expect(EVIDENCE_LEVEL_BADGES.self_declared).toBe("L1");
    expect(EVIDENCE_LEVEL_BADGES.third_party_verified).toBe("L6");
    expect(badgeForLevel("document_uploaded")).toBe("L3");
    expect(badgeForLevel("nope")).toBeUndefined();
    expect(levelForBadge("L4")).toBe("connected_source");
    expect(levelForBadge("L9")).toBeUndefined();
  });

  it("verificationLabel: the state is called BlockID Verified; L0 is honest", () => {
    expect(verificationLabel(3)).toMatchObject({ level: 3, short: "L3", label: "BlockID Verified L3", tier: "Trust", verified: true });
    expect(verificationLabel(0)).toMatchObject({ level: 0, short: "L0", label: "Not yet BlockID Verified", verified: false });
    expect(verificationLabel(1).verified).toBe(false);
    expect(verificationLabel("7").level).toBe(5);
    expect(verificationLabel(undefined).level).toBe(0);
  });
});

describe("from a stored analysis", () => {
  it("reads each sub-score's strongest ledger rung, weights by DIM_WEIGHTS and honours meta.verification", () => {
    const analysis = computeSVI(extractSignals({ rawText: "Serial founder with two exits. Co-founder team. MRR A$12,000 with 40 paying customers. ABN registered. https://example.com" }), undefined, undefined, undefined, undefined, undefined, undefined, undefined, 2);
    const input = evidenceConfidenceInputFromAnalysis(analysis);
    expect(input.dimensions).toHaveLength(8);
    for (const d of input.dimensions) expect(d.weight).toBe(DIM_WEIGHTS[d.dim as keyof typeof DIM_WEIGHTS]);
    expect(input.verificationLevel).toBe(2);
    const score = evidenceConfidenceFromAnalysis(analysis);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    // The same analysis always yields the same number.
    expect(evidenceConfidenceFromAnalysis(analysis)).toBe(score);
  });

  it("strongestSignalLevel ignores non-ladder sources", () => {
    expect(strongestSignalLevel([{ signal: "a", points: 5, source: "stage" }, { signal: "b", points: 5, source: "public_url" }, { signal: "c", points: 1, source: "penalty" }])).toBe("public_url");
    expect(strongestSignalLevel([])).toBeNull();
    expect(strongestSignalLevel(undefined)).toBeNull();
  });

  it("pre-S41 rows (no breakdown) fall back to the analysis-wide evidence level; pending dims read as null", () => {
    const input = evidenceConfidenceInputFromAnalysis({ subs: [{ key: "tre", assessed: true }, { key: "mpc", assessed: false }], signals: { evidenceLevel: "document_uploaded" } });
    expect(input.dimensions.find((d) => d.dim === "tre")?.level).toBe("document_uploaded");
    expect(input.dimensions.find((d) => d.dim === "mpc")?.level).toBeNull();
    expect(input.dimensions.find((d) => d.dim === "ftv")?.level).toBe("document_uploaded");
  });
});
