// Colocated vitest for lib/evaluations/cohort-snapshots.ts (G21 P2-A). Pins:
//   * gapsCountFromEvidenceRows = catalogue items with no row, over 8 dims;
//   * buildSnapshotRows joins items → project, copies dims, defaults
//     verification 0, gaps = full catalogue when nothing on file (null when
//     the evidence table was unreadable), evidence_confidence null (P1-B);
//   * summariseSnapshotRows medians;
//   * mapSnapshotRow tolerates malformed jsonb;
//   * takeCohortSnapshot writes rows + summary + weights_version and answers
//     not_migrated on 42P01; requeueStaleItems re-queues only stale terminal
//     items and reopens the batch.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";

const batchMocks = vi.hoisted(() => ({
  getBatchById: vi.fn(),
  listBatchItems: vi.fn(),
  loadEvaluationJoins: vi.fn(),
  markItem: vi.fn(),
}));
vi.mock("./batch", () => ({
  getBatchById: (id: string) => batchMocks.getBatchById(id),
  listBatchItems: (id: string) => batchMocks.listBatchItems(id),
  loadEvaluationJoins: (ids: string[]) => batchMocks.loadEvaluationJoins(ids),
  markItem: (id: number, patch: unknown) => batchMocks.markItem(id, patch),
}));

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sb.client }));

import { fakeSupabase } from "@/test/fake-supabase";
import {
  EVIDENCE_CATALOG_SIZE,
  buildSnapshotRows,
  gapsCountFromEvidenceRows,
  mapSnapshotRow,
  requeueStaleItems,
  summariseSnapshotRows,
  takeCohortSnapshot,
} from "./cohort-snapshots";

const BATCH = {
  id: "b-1",
  userId: "u-1",
  name: "Round 1",
  rubricWeights: {},
  status: "done" as const,
  total: 2,
  doneCount: 2,
  failedCount: 0,
  createdAt: "2026-09-01T00:00:00Z",
  startedAt: null,
  finishedAt: "2026-09-02T00:00:00Z",
  programName: null,
  intakeId: null,
  templateId: null,
  weightsVersion: 3,
  applicantsCap: null,
  pilotOrderId: null,
};

const ITEMS = [
  { id: 1, batchId: "b-1", evaluationId: "ev-1", status: "done" as const, reportId: null, snapshotId: null, shareToken: null, sviTotal: 61, dimensionScores: { ftv: 70, mpc: 50 }, error: null, scoredAt: "2026-09-02T00:00:00Z" },
  { id: 2, batchId: "b-1", evaluationId: "ev-2", status: "failed" as const, reportId: null, snapshotId: null, shareToken: null, sviTotal: null, dimensionScores: null, error: "x", scoredAt: "2026-06-01T00:00:00Z" },
  { id: 3, batchId: "b-1", evaluationId: "ev-orphan", status: "queued" as const, reportId: null, snapshotId: null, shareToken: null, sviTotal: null, dimensionScores: null, error: null, scoredAt: null },
];
const JOINS = new Map([
  ["ev-1", { projectId: "p-1" }],
  ["ev-2", { projectId: "p-2" }],
]);

describe("pure helpers", () => {
  it("gapsCountFromEvidenceRows counts catalogue items with no row across the 8 dimensions", () => {
    expect(gapsCountFromEvidenceRows([])).toBe(EVIDENCE_CATALOG_SIZE);
    const first = EVIDENCE_CATALOG.ftv![0]!;
    expect(gapsCountFromEvidenceRows([{ dimension: "FTV", evidence_type: first.code }])).toBe(EVIDENCE_CATALOG_SIZE - 1);
    expect(gapsCountFromEvidenceRows([{ dimension: "ftv", evidence_type: "not-in-catalogue" }, { dimension: null, evidence_type: first.code }])).toBe(EVIDENCE_CATALOG_SIZE);
  });

  it("buildSnapshotRows: joins, dims, verification default 0, gaps default = full catalogue, confidence null", () => {
    const rows = buildSnapshotRows(ITEMS, JOINS, { verification: new Map([["p-1", 2]]), gaps: new Map([["p-1", 5]]), gapsAvailable: true, confidence: new Map() });
    expect(rows).toEqual([
      { project_id: "p-1", evaluation_id: "ev-1", item_id: 1, svi: 61, evidence_confidence: null, verification_level: 2, dims: { ftv: 70, mpc: 50 }, gaps_count: 5, status: "done", scored_at: "2026-09-02T00:00:00Z" },
      { project_id: "p-2", evaluation_id: "ev-2", item_id: 2, svi: null, evidence_confidence: null, verification_level: 0, dims: {}, gaps_count: EVIDENCE_CATALOG_SIZE, status: "failed", scored_at: "2026-06-01T00:00:00Z" },
    ]);
    const noEvidence = buildSnapshotRows(ITEMS, JOINS, { verification: new Map(), gaps: new Map(), gapsAvailable: false, confidence: new Map() });
    expect(noEvidence.map((r) => r.gaps_count)).toEqual([null, null]);
  });

  it("summariseSnapshotRows: n, scored, medians per field and per dimension", () => {
    const s = summariseSnapshotRows([
      { project_id: "a", svi: 50, evidence_confidence: 0.4, verification_level: 1, dims: { ftv: 40 }, gaps_count: 10 },
      { project_id: "b", svi: 70, evidence_confidence: null, verification_level: 3, dims: { ftv: 60, mpc: 55 }, gaps_count: 4 },
      { project_id: "c", svi: null, evidence_confidence: null, verification_level: 0, dims: null, gaps_count: null },
    ]);
    expect(s).toMatchObject({ n: 3, scored: 2, median_svi: 60, median_confidence: 0.4, median_verification: 1, median_gaps: 7 });
    expect(s.dims.ftv).toBe(50);
    expect(s.dims.mpc).toBe(55);
    expect(s.dims.tre).toBeNull();
  });

  it("mapSnapshotRow tolerates malformed jsonb and recomputes a missing summary", () => {
    const snap = mapSnapshotRow({ id: "s", batch_id: "b", taken_at: "2026-09-20T00:00:00Z", reason: "weird", weights_version: "2", rows: [{ project_id: "p", svi: 40 }, "junk", null], summary: null, created_by: null });
    expect(snap).toMatchObject({ id: "s", reason: "manual", weightsVersion: 2, weights_version: 2, takenAt: "2026-09-20T00:00:00Z" });
    expect(snap.rows).toHaveLength(1);
    expect(snap.summary.median_svi).toBe(40);
  });
});

describe("takeCohortSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchMocks.getBatchById.mockResolvedValue(BATCH);
    batchMocks.listBatchItems.mockResolvedValue(ITEMS);
    batchMocks.loadEvaluationJoins.mockResolvedValue(JOINS);
  });

  it("writes rows + summary stamped with the batch's weights_version and reason", async () => {
    const fake = fakeSupabase({ projects: [{ id: "p-1", verification_level: 2 }], svi_dimension_evidence: [], cohort_snapshots: [] });
    sb.client = fake;
    const r = await takeCohortSnapshot("b-1", { reason: "batch_complete" });
    expect(r.ok).toBe(true);
    const insert = fake.find("cohort_snapshots", "insert")[0]!.args[0] as { rows: unknown[]; summary: { n: number }; weights_version: number; reason: string; batch_id: string };
    expect(insert).toMatchObject({ batch_id: "b-1", reason: "batch_complete", weights_version: 3 });
    expect(insert.rows).toHaveLength(2);
    expect(insert.summary.n).toBe(2);
    // projects were read for both project ids; the evidence table for both.
    expect(fake.calls.some((c) => c.table === "projects" && c.op === "in")).toBe(true);
  });

  it("not_found when the batch does not exist; service_unavailable without a client", async () => {
    sb.client = null;
    expect(await takeCohortSnapshot("b-1", { reason: "manual" })).toMatchObject({ ok: false, error: "service_unavailable" });
    sb.client = fakeSupabase();
    batchMocks.getBatchById.mockResolvedValue(null);
    expect(await takeCohortSnapshot("nope", { reason: "manual" })).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("requeueStaleItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchMocks.listBatchItems.mockResolvedValue(ITEMS);
    batchMocks.markItem.mockResolvedValue(undefined);
  });

  it("re-queues only terminal items older than the cut-off and reopens the batch", async () => {
    const fake = fakeSupabase({ evaluation_batches: [{ id: "b-1" }] });
    sb.client = fake;
    const r = await requeueStaleItems(BATCH, { olderThanDays: 30, now: new Date("2026-09-20T00:00:00Z") });
    expect(r).toEqual({ requeued: [2], fresh: 1, requeuedFailed: 0, batchStatus: "queued" });
    expect(batchMocks.markItem).toHaveBeenCalledWith(2, { status: "queued", error: null });
    expect(fake.find("evaluation_batches", "update")[0]!.args[0]).toEqual({ status: "queued", finished_at: null });
  });

  it("nothing stale → nothing re-queued, batch untouched", async () => {
    const fake = fakeSupabase();
    sb.client = fake;
    const r = await requeueStaleItems(BATCH, { olderThanDays: 3650, now: new Date("2026-09-20T00:00:00Z") });
    expect(r).toEqual({ requeued: [], fresh: 2, requeuedFailed: 0, batchStatus: "done" });
    expect(fake.find("evaluation_batches", "update")).toHaveLength(0);
  });
});
