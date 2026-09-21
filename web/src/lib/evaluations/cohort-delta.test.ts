// Colocated vitest for lib/evaluations/cohort-delta.ts (G21 P2-A).

import { describe, expect, it } from "vitest";
import { cohortDeltaWeightsChanged, deltaByProject, deltaForRows, formatDelta, summariseDeltas, type SnapshotLite } from "./cohort-delta";

const prev: SnapshotLite = {
  taken_at: "2026-09-01T00:00:00Z",
  weights_version: 1,
  rows: [
    { project_id: "p1", svi: 50, evidence_confidence: null, verification_level: 1, dims: { ftv: 40, mpc: 60, tre: 30 }, gaps_count: 12 },
    { project_id: "p2", svi: 61.2, evidence_confidence: 0.4, verification_level: 2, dims: { ftv: 55 }, gaps_count: 8 },
    { project_id: "gone", svi: 20, evidence_confidence: null, verification_level: 0, dims: null, gaps_count: null },
  ],
};
const latest: SnapshotLite = {
  taken_at: "2026-09-20T00:00:00Z",
  weights_version: 2,
  rows: [
    { project_id: "p1", svi: 53.5, evidence_confidence: null, verification_level: 2, dims: { ftv: 44, mpc: 58, tre: 30, ptd: 70 }, gaps_count: 9 },
    { project_id: "p2", svi: null, evidence_confidence: 0.55, verification_level: 2, dims: { ftv: 55 }, gaps_count: 8 },
    { project_id: "new", svi: 70, evidence_confidence: null, verification_level: 1, dims: { ftv: 70 }, gaps_count: 3 },
  ],
};

describe("deltaByProject", () => {
  it("latest − previous per project present in both; one-sided projects have no delta", () => {
    const d = deltaByProject(latest, prev);
    expect([...d.keys()].sort()).toEqual(["p1", "p2"]);
    expect(d.get("p1")).toEqual({
      projectId: "p1",
      svi: 3.5,
      evidenceConfidence: null,
      verificationLevel: 1,
      gapsCount: -3,
      dims: { ftv: 4, mpc: -2, tre: 0 },
      biggestMove: { dimension: "ftv", delta: 4 },
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-20T00:00:00Z",
      weightsChanged: true,
    });
    // p2: unscored in the latest → no SVI delta, but confidence moved.
    expect(d.get("p2")).toMatchObject({ svi: null, evidenceConfidence: 0.2, verificationLevel: 0, gapsCount: 0, dims: { ftv: 0 }, biggestMove: null });
  });
  it("is empty without two snapshots", () => {
    expect(deltaByProject(latest, null).size).toBe(0);
    expect(deltaByProject(null, prev).size).toBe(0);
    expect(deltaByProject({ taken_at: "x", rows: [] }, prev).size).toBe(0);
  });
  it("weightsChanged is false when either version is unknown or equal", () => {
    const d = deltaByProject({ ...latest, weights_version: 1 }, prev);
    expect(d.get("p1")?.weightsChanged).toBe(false);
    expect(deltaByProject({ ...latest, weights_version: undefined }, prev).get("p1")?.weightsChanged).toBe(false);
  });
  it("deltaForRows tolerates string numbers from jsonb", () => {
    const d = deltaForRows(
      { project_id: "p", svi: "62.25" as unknown as number, evidence_confidence: null, verification_level: null, dims: { ftv: "10" as unknown as number }, gaps_count: null },
      { project_id: "p", svi: 60, evidence_confidence: null, verification_level: null, dims: { ftv: 12 }, gaps_count: null },
      { from: "a", to: "b" },
    );
    expect(d.svi).toBe(2.3);
    expect(d.dims).toEqual({ ftv: -2 });
    expect(d.biggestMove).toEqual({ dimension: "ftv", delta: -2 });
  });
});

describe("summariseDeltas / formatDelta", () => {
  it("counts up / down / flat and the median SVI move", () => {
    const d = deltaByProject(latest, prev);
    expect(summariseDeltas(d.values())).toEqual({ n: 1, up: 1, down: 0, flat: 0, medianSvi: 3.5 });
    expect(summariseDeltas([])).toEqual({ n: 0, up: 0, down: 0, flat: 0, medianSvi: null });
    expect(
      summariseDeltas([
        { svi: 2 } as never,
        { svi: -1 } as never,
        { svi: 0 } as never,
        { svi: 5 } as never,
      ]),
    ).toEqual({ n: 4, up: 2, down: 1, flat: 1, medianSvi: 1 });
  });
  it("formats with a sign, a minus sign glyph and an em dash for nothing", () => {
    expect(formatDelta(3.5)).toBe("+3.5");
    expect(formatDelta(-1)).toBe("−1.0");
    expect(formatDelta(0)).toBe("0.0");
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(2, 0)).toBe("+2");
  });
});

describe("cohortDeltaWeightsChanged (G22-A A.3)", () => {
  it("null with fewer than two snapshots or equal versions; { from, to } when they differ (camelCase or snake_case)", () => {
    expect(cohortDeltaWeightsChanged(null, null)).toBeNull();
    expect(cohortDeltaWeightsChanged({ weightsVersion: 2 }, null)).toBeNull();
    expect(cohortDeltaWeightsChanged({ weightsVersion: 2 }, { weightsVersion: 2 })).toBeNull();
    expect(cohortDeltaWeightsChanged({ weightsVersion: 2 }, { weightsVersion: 1 })).toEqual({ from: 1, to: 2 });
    expect(cohortDeltaWeightsChanged({ weights_version: 3 }, { weights_version: 2 })).toEqual({ from: 2, to: 3 });
    // A snapshot without a version (pre-0422 row) cannot claim a change.
    expect(cohortDeltaWeightsChanged({}, { weightsVersion: 1 })).toBeNull();
  });
});
