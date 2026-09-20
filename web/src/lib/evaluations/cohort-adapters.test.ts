// cohort-adapters — the tolerant reads behind the program journey (G21 P2-C).
//
// A chainable fake Supabase client answers per table: a missing table (42P01)
// yields EMPTY data, never a throw; present tables map to the shapes the
// journey / report consume. `resolveBatchAccess` falls back to P2-B members.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getBatchForUserMock = vi.fn();
vi.mock("./batch", () => ({ getBatchForUser: (u: string, b: string) => getBatchForUserMock(u, b) }));
// Merge session: `resolveBatchAccess` delegates to P2-B's one membership rule.
const assertBatchRoleMock = vi.fn();
vi.mock("./batch-members", () => ({ assertBatchRole: (b: string, u: string, min: string) => assertBatchRoleMock(b, u, min) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import {
  countOverridesForBatch,
  listCohortSnapshotsForBatch,
  loadDossierProducedByEvaluation,
  loadEvidenceConfidenceBySnapshot,
  loadEvidenceRowsByProject,
  loadFeedbackLetterSentByProject,
  loadScoreHistoryByProject,
  loadShortlistForBatch,
  loadVerificationByProject,
  parseSnapshotRows,
  resolveBatchAccess,
  type DbLike,
} from "./cohort-adapters";

type Answer = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

/** Chainable fake: every builder method returns itself; awaiting resolves the table answer. */
function fakeDb(tables: Record<string, Answer>): DbLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const answer = tables[table] ?? { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "in", "order", "limit", "gt", "maybeSingle"]) chain[m] = self;
      chain.then = (resolve: (v: Answer) => void) => resolve(answer);
      return chain;
    },
  };
}

beforeEach(() => getBatchForUserMock.mockReset());

describe("missing tables answer empty", () => {
  it("every adapter returns its empty shape on 42P01 and on a null client", async () => {
    const db = fakeDb({});
    expect(await listCohortSnapshotsForBatch("b", db)).toEqual([]);
    expect(await countOverridesForBatch([1, 2], db)).toBe(0);
    expect((await loadShortlistForBatch("b", db)).size).toBe(0);
    expect((await loadEvidenceConfidenceBySnapshot(["s"], db)).size).toBe(0);
    expect((await loadVerificationByProject(["p"], db)).size).toBe(0);
    expect((await loadEvidenceRowsByProject(["p"], db)).size).toBe(0);
    expect((await loadScoreHistoryByProject(["p"], 8, db)).size).toBe(0);
    expect((await loadDossierProducedByEvaluation(["e"], db)).size).toBe(0);
    expect((await loadFeedbackLetterSentByProject(["p"], db)).size).toBe(0);
    expect(await listCohortSnapshotsForBatch("b", null)).toEqual([]);
    expect(await countOverridesForBatch([1], null)).toBe(0);
  });

  it("empty id lists never hit the database", async () => {
    const db = fakeDb({});
    await loadVerificationByProject([], db);
    await loadEvidenceRowsByProject([], db);
    await countOverridesForBatch([], db);
    expect(db.calls).toEqual([]);
  });
});

describe("present tables", () => {
  it("snapshots map rows (array or { items } envelope), overrides count, shortlist ids, confidence / verification / evidence / history / dossiers / letters", async () => {
    const db = fakeDb({
      cohort_snapshots: { data: [{ id: "s1", taken_at: "2026-09-01T00:00:00Z", rows: [{ item_id: 1, project_id: "p-1", svi: 60, evidence_confidence: 50, dimension_scores: { tre: { score: 30 } } }] }, { id: "s2", taken_at: "2026-09-08T00:00:00Z", rows: { items: [{ itemId: 1, sviTotal: "64", confidence: 55 }] } }] },
      assessment_overrides: { count: 3, error: null },
      evaluation_batch_items: { data: [{ id: 7, shortlisted: true }, { id: "9" }] },
      svi_snapshots: { data: [{ id: "snap-1", project_id: "p-1", evidence_confidence: 61.4, svi_total: 64, created_at: "2026-09-08" }, { id: "snap-0", project_id: "p-1", evidence_confidence: null, svi_total: 60, created_at: "2026-09-01" }] },
      projects: { data: [{ id: "p-1", verification_level: 3 }, { id: "p-2", verification_level: null }, { id: "p-3", verification_level: 9 }] },
      svi_dimension_evidence: { data: [{ project_id: "p-1", dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" }, { project_id: "p-1", dimension: "ftv", evidence_type: null, confidence_level: null }] },
      ic_reports: { data: [{ evaluation_id: "e-1" }] },
      founder_feedback_letters: { data: [{ project_id: "p-1", status: "sent" }] },
    });
    const snaps = await listCohortSnapshotsForBatch("b", db);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].rows[0]).toEqual({ projectId: "p-1", itemId: 1, svi: 60, confidence: 50, dimensionScores: { tre: 30 } });
    expect(snaps[1].rows[0]).toMatchObject({ itemId: 1, svi: 64, confidence: 55, dimensionScores: null });
    expect(await countOverridesForBatch([1, 2, 3], db)).toBe(3);
    expect(Array.from(await loadShortlistForBatch("b", db))).toEqual([7, 9]);
    expect(Array.from(await loadEvidenceConfidenceBySnapshot(["snap-1", "snap-0"], db))).toEqual([["snap-1", 61]]);
    expect(Array.from(await loadVerificationByProject(["p-1", "p-2", "p-3"], db))).toEqual([["p-1", 3], ["p-2", 0], ["p-3", 5]]);
    const ev = await loadEvidenceRowsByProject(["p-1"], db);
    expect(ev.get("p-1")).toHaveLength(2);
    expect(ev.get("p-1")?.[0]).toEqual({ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" });
    // history: newest first from the db → oldest first out
    expect(Array.from(await loadScoreHistoryByProject(["p-1"], 8, db))).toEqual([["p-1", [60, 64]]]);
    expect(Array.from(await loadDossierProducedByEvaluation(["e-1", "e-2"], db))).toEqual(["e-1"]);
    expect(Array.from(await loadFeedbackLetterSentByProject(["p-1"], db))).toEqual(["p-1"]);
  });

  it("parseSnapshotRows ignores junk and accepts camelCase keys", () => {
    expect(parseSnapshotRows(null)).toEqual([]);
    expect(parseSnapshotRows([1, "x", null])).toEqual([]);
    expect(parseSnapshotRows([{ projectId: "p", itemId: "4", svi_total: 70, evidenceConfidence: 40, dimensions: { ftv: 71 } }])).toEqual([{ projectId: "p", itemId: 4, svi: 70, confidence: 40, dimensionScores: { ftv: 71 } }]);
  });
});

describe("resolveBatchAccess", () => {
  const BATCH = { id: "b-1", userId: "owner", name: "Cohort 5", rubricWeights: null, status: "done", total: 3, doneCount: 3, failedCount: 0, createdAt: "2026-09-01", startedAt: null, finishedAt: null };

  it("delegates to assertBatchRole: owner / reviewer roles pass through, batch included", async () => {
    assertBatchRoleMock.mockResolvedValueOnce({ ok: true, batch: BATCH, role: "owner", isCreator: true });
    const owner = await resolveBatchAccess("owner", "b-1", fakeDb({}));
    expect(owner?.role).toBe("owner");
    expect(owner?.batch.name).toBe("Cohort 5");
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "owner", "viewer");
    assertBatchRoleMock.mockResolvedValueOnce({ ok: true, batch: BATCH, role: "reviewer", isCreator: false });
    const reviewer = await resolveBatchAccess("rev", "b-1", fakeDb({}));
    expect(reviewer?.role).toBe("reviewer");
    expect(reviewer?.batch).toMatchObject({ id: "b-1", userId: "owner", status: "done", total: 3 });
  });

  it("not_found / forbidden / unavailable → null (never a 403 from the journey routes)", async () => {
    for (const error of ["not_found", "forbidden", "unavailable"] as const) {
      assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error });
      expect(await resolveBatchAccess("rev", "b-1", fakeDb({}))).toBeNull();
    }
  });
});
