import { describe, expect, it } from "vitest";
import { badgeOfEvidenceType, buildTrajectory, trajectoryTable, type TrajectoryInput } from "./trajectory";

const base: TrajectoryInput = { snapshots: [], evidenceRecords: [], outcomes: [], verificationLevel: "L2" };

describe("buildTrajectory (G21 P3-A)", () => {
  it("empty → state empty, three null milestones", () => {
    const t = buildTrajectory(base);
    expect(t.state).toBe("empty");
    expect(t.points).toEqual([]);
    expect(t.milestones.map((m) => [m.mark, m.point])).toEqual([[0, null], [60, null], [180, null]]);
    expect(t.verificationLevel).toBe("L2");
  });

  it("one snapshot → single; Day 0 tile only; bad rows dropped; one point per day (latest wins)", () => {
    const t = buildTrajectory({ ...base, snapshots: [{ snapshot_date: "2026-03-01", svi_total: 40, evidence_confidence: 20.4, stage: 1 }, { snapshot_date: "2026-03-01T15:00:00Z", svi_total: 42, evidence_confidence: null, stage: 1 }, { snapshot_date: "bad", svi_total: 1, evidence_confidence: null, stage: null }, { snapshot_date: "2026-03-02", svi_total: null, evidence_confidence: null, stage: null }] });
    expect(t.state).toBe("single");
    expect(t.points).toHaveLength(1);
    expect(t.points[0]).toMatchObject({ day: 0, date: "2026-03-01", svi: 42, confidence: null, stage: 1, evidenceTotal: 0, highestLevel: null });
    expect(t.milestones[0]!.point?.svi).toBe(42);
    expect(t.milestones[1]!.point).toBeNull();
    expect(t.day0).toBe("2026-03-01");
  });

  it("series: day offsets from Day 0, cumulative evidence by level as at each point, highest level, Day 60 / 180 pick the nearest point at or before the mark with deltas", () => {
    const t = buildTrajectory({
      ...base,
      snapshots: [
        { snapshot_date: "2026-01-01", svi_total: 38, evidence_confidence: 22, stage: 1 },
        { snapshot_date: "2026-02-15", svi_total: 45, evidence_confidence: 35, stage: 1 },
        { snapshot_date: "2026-03-10", svi_total: 51, evidence_confidence: 48, stage: 2 },
        { snapshot_date: "2026-07-15", svi_total: 58, evidence_confidence: 61, stage: 2 },
      ],
      evidenceRecords: [
        { evidence_type: "L1_self_declared", submitted_at: "2025-12-20T00:00:00Z", status: "active" },
        { evidence_type: "L3_uploaded_document", submitted_at: "2026-02-10T00:00:00Z", status: "active" },
        { evidence_type: "L4_connected_source", submitted_at: "2026-03-10T23:00:00Z", status: "active" },
        { evidence_type: "L6_third_party_verified", submitted_at: "2026-06-01T00:00:00Z", status: "withdrawn" },
        { evidence_type: "document_uploaded", submitted_at: "2026-07-01T00:00:00Z", status: "active" },
        { evidence_type: "weird", submitted_at: "2026-07-01T00:00:00Z", status: "active" },
      ],
    });
    expect(t.state).toBe("series");
    expect(t.points.map((p) => p.day)).toEqual([0, 45, 68, 195]);
    expect(t.points[0]).toMatchObject({ evidenceTotal: 1, highestLevel: "L1" });
    expect(t.points[1]).toMatchObject({ evidenceTotal: 2, highestLevel: "L3" });
    expect(t.points[2]).toMatchObject({ evidenceTotal: 3, highestLevel: "L4", evidenceByLevel: { L1: 1, L2: 0, L3: 1, L4: 1, L5: 0, L6: 0 } });
    // withdrawn L6 dropped; the legacy `document_uploaded` name maps to L3; `weird` dropped
    expect(t.points[3]).toMatchObject({ evidenceTotal: 4, highestLevel: "L4", evidenceByLevel: { L1: 1, L2: 0, L3: 2, L4: 1, L5: 0, L6: 0 } });
    const [d0, d60, d180] = t.milestones;
    expect(d0).toMatchObject({ mark: 0, sviDelta: null, confidenceDelta: null });
    expect(d0!.point?.svi).toBe(38);
    expect(d60!.point?.day).toBe(45);
    expect(d60).toMatchObject({ sviDelta: 7, confidenceDelta: 13 });
    expect(d180!.point?.day).toBe(68);
    expect(d180).toMatchObject({ sviDelta: 13, confidenceDelta: 26 });
    expect(t.latest?.day).toBe(195);
    expect(t.spanDays).toBe(195);
  });

  it("a record younger than the mark leaves Day 60 / 180 null (never a stale substitute)", () => {
    const t = buildTrajectory({ ...base, snapshots: [{ snapshot_date: "2026-09-01", svi_total: 40, evidence_confidence: 20, stage: 1 }, { snapshot_date: "2026-09-15", svi_total: 44, evidence_confidence: 25, stage: 1 }] });
    expect(t.milestones[1]!.point).toBeNull();
    expect(t.milestones[2]!.point).toBeNull();
  });

  it("confirmed outcomes become markers on the day axis (proposed / rejected ignored); ones after the latest snapshot are counted and extend the span", () => {
    const t = buildTrajectory({
      ...base,
      snapshots: [{ snapshot_date: "2026-01-01", svi_total: 40, evidence_confidence: 20, stage: 1 }, { snapshot_date: "2026-03-01", svi_total: 50, evidence_confidence: 30, stage: 2 }],
      outcomes: [
        { id: "o-1", kind: "grant_success", observed_at: "2026-02-10", value: { program: "AEA" }, source: "external_signal", status: "confirmed" },
        { id: "o-2", kind: "funding_raised", observed_at: "2026-04-20", value: { amount_aud: 500000 }, source: "founder", status: "confirmed" },
        { id: "o-3", kind: "survival", observed_at: "2026-02-01", value: {}, source: "founder", status: "proposed" },
        { id: "o-4", kind: "survival", observed_at: "nope", value: {}, source: "founder", status: "confirmed" },
      ],
    });
    expect(t.markers.map((m) => [m.id, m.day, m.label])).toEqual([
      ["o-1", 40, "AEA"],
      ["o-2", 109, "A$500,000"],
    ]);
    expect(t.outcomesAfterLatest).toBe(1);
    expect(t.spanDays).toBe(109);
  });

  it("trajectoryTable: one row per point then per marker; badgeOfEvidenceType handles L-prefixes and ladder names", () => {
    const t = buildTrajectory({ ...base, snapshots: [{ snapshot_date: "2026-01-01", svi_total: 40, evidence_confidence: 20, stage: 1 }], outcomes: [{ id: "o", kind: "next_stage", observed_at: "2026-01-05", value: { to_stage: 2 }, source: "founder", status: "confirmed" }] });
    const rows = trajectoryTable(t);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Day: "0", SVI: "40", "Evidence confidence": "20", Stage: "1", Outcome: "" });
    expect(rows[1]).toMatchObject({ Day: "4", Outcome: "next stage — Stage → 2" });
    expect(badgeOfEvidenceType("L5_transaction_data")).toBe("L5");
    expect(badgeOfEvidenceType("l2")).toBe("L2");
    expect(badgeOfEvidenceType("third_party_verified")).toBe("L6");
    expect(badgeOfEvidenceType("nope")).toBeNull();
    expect(badgeOfEvidenceType(null)).toBeNull();
  });
});
