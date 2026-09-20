// Colocated vitest for lib/evaluations/cohort-decisions (G13-W5-D3, P1 /
// P2; G21 P2-B reason codes). Pins: the latest version per evaluation wins
// (newest first), only the batch owner's seat is read, 42P01 → empty map;
// the bulk Zod (ids 1..200, at least one of decision / conviction, an
// optional `reason_code` from DECISION_REASON_CODES); bulkSetDecisions
// writes a DRAFT per selected row through the S-D2 upsert with the batch
// snapshot, skips ids outside the batch, never submits, audits ONE
// `assessment.bulk_set` with the id list (carrying `reason_code`), and
// emits one FI `decision_recorded` per touched id when a decision was set
// (none when only conviction changed).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state = { rows: [] as Row[], error: null as null | { code?: string; message?: string }, configured: true };
function builder() {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain, in: chain, eq: chain, order: chain, limit: chain,
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.configured ? { from: () => builder() } : null) }));
const { auditMock, upsertMock } = vi.hoisted(() => ({
  auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })),
  upsertMock: vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: true, created: true, assessment: {}, version: 1, history: [] })),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/evaluations/assessments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/assessments")>()),
  upsertAssessment: (ctx: unknown, input: unknown) => upsertMock(ctx, input),
}));
const { emitFiEventMock } = vi.hoisted(() => ({ emitFiEventMock: vi.fn() }));
vi.mock("@/lib/analytics/fi-events", () => ({ emitFiEvent: (name: unknown, envelope: unknown) => emitFiEventMock(name, envelope) }));

import { BULK_MAX_IDS, bulkDecisionSchema, bulkSetDecisions, loadCohortDecisions } from "./cohort-decisions";
import { DECISION_REASON_CODES } from "./cohort-decisions-shared";

const SNAP = "0f6e5c1a-9999-4999-8999-aaaaaaaaaaaa";

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.configured = true;
  auditMock.mockClear();
  upsertMock.mockClear().mockResolvedValue({ ok: true, created: true, assessment: {}, version: 1, history: [] });
  emitFiEventMock.mockClear();
});

describe("loadCohortDecisions", () => {
  it("keeps the newest version per evaluation, maps status / decision / conviction / thesis fit; unknown decision → null", async () => {
    state.rows = [
      { evaluation_id: "e-1", version: 3, status: "submitted", decision: "proceed", conviction: 4, thesis_fit_pct: 80 },
      { evaluation_id: "e-1", version: 2, status: "draft", decision: "track", conviction: 2, thesis_fit_pct: null },
      { evaluation_id: "e-2", version: 1, status: "draft", decision: null, conviction: null, thesis_fit_pct: 55 },
      { evaluation_id: "e-3", version: 1, status: "submitted", decision: "bogus", conviction: "x", thesis_fit_pct: null },
    ];
    const m = await loadCohortDecisions(["e-1", "e-2", "e-3"], "u-owner");
    expect(m.get("e-1")).toEqual({ decision: "proceed", conviction: 4, thesisFitPct: 80, assessmentStatus: "submitted" });
    expect(m.get("e-2")).toEqual({ decision: null, conviction: null, thesisFitPct: 55, assessmentStatus: "draft" });
    expect(m.get("e-3")).toEqual({ decision: null, conviction: null, thesisFitPct: null, assessmentStatus: "submitted" });
  });

  it("empty ids / no owner / no client / 42P01 → empty map, never a throw", async () => {
    expect((await loadCohortDecisions([], "u")).size).toBe(0);
    expect((await loadCohortDecisions(["e-1"], "")).size).toBe(0);
    state.error = { code: "42P01", message: "relation does not exist" };
    expect((await loadCohortDecisions(["e-1"], "u")).size).toBe(0);
    state.configured = false;
    expect((await loadCohortDecisions(["e-1"], "u")).size).toBe(0);
  });
});

describe("bulkDecisionSchema", () => {
  it("needs ids (1..200) and at least one of decision / conviction; strict keys", () => {
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "track" }).success).toBe(true);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], conviction: 3 }).success).toBe(true);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: null }).success).toBe(true);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"] }).success).toBe(false);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: [], decision: "pass" }).success).toBe(false);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "maybe" }).success).toBe(false);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], conviction: 6 }).success).toBe(false);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "pass", extra: 1 }).success).toBe(false);
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => `e-${i}`), decision: "pass" }).success).toBe(false);
  });

  it("G21 P2-B: accepts an optional reason_code from DECISION_REASON_CODES and rejects an unknown one", () => {
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "pass" }).success).toBe(true); // reason_code is optional
    for (const code of DECISION_REASON_CODES) {
      expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "pass", reason_code: code }).success).toBe(true);
    }
    expect(bulkDecisionSchema.safeParse({ evaluation_ids: ["e-1"], decision: "pass", reason_code: "bogus" }).success).toBe(false);
  });
});

describe("bulkSetDecisions", () => {
  const items = [
    { evaluationId: "e-1", projectId: "p-1", snapshotId: SNAP },
    { evaluationId: "e-2", projectId: "p-2", snapshotId: "not-a-uuid" },
  ];

  it("writes a DRAFT per owned row with the batch snapshot, skips foreign ids, dedupes, audits one bulk_set with the id list", async () => {
    upsertMock.mockResolvedValueOnce({ ok: true, created: true, assessment: {}, version: 1, history: [] }).mockResolvedValueOnce({ ok: true, created: false, assessment: {}, version: 2, history: [] });
    const r = await bulkSetDecisions({ batchId: "b-1", userId: "u-owner", orgId: "org-1", items, body: { evaluation_ids: ["e-1", "e-2", "e-2", "e-other"], decision: "track", conviction: 3 } });
    expect(r).toEqual({ updated: 1, created: 1, skipped: ["e-other"], failed: [], unavailable: false });
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[0]).toEqual([{ evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-owner", orgId: "org-1" }, { decision: "track", conviction: 3, snapshot_id: SNAP }]);
    // A non-uuid batch snapshot id is not forwarded (0392 FK is uuid).
    expect(upsertMock.mock.calls[1][1]).toEqual({ decision: "track", conviction: 3 });
    for (const call of upsertMock.mock.calls) expect((call[1] as Row).status).toBeUndefined();
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "assessment.bulk_set", resource_type: "evaluation_batch", resource_id: "b-1", detail: { evaluation_ids: ["e-1", "e-2"], decision: "track", conviction: 3, created: 1, updated: 1, skipped: 1, failed: 0 } });
  });

  it("clearing a decision passes null; a failed row is reported; 0392 missing stops the loop as unavailable with no audit", async () => {
    upsertMock.mockResolvedValueOnce({ ok: true, created: false, assessment: {}, version: 1, history: [] }).mockResolvedValueOnce({ ok: false, error: "db_error", message: "x" });
    const r = await bulkSetDecisions({ batchId: "b-1", userId: "u", items, body: { evaluation_ids: ["e-1", "e-2"], decision: null } });
    expect(r.updated).toBe(1);
    expect(r.failed).toEqual([{ evaluationId: "e-2", error: "db_error" }]);
    expect(upsertMock.mock.calls[0][1]).toEqual({ decision: null, snapshot_id: SNAP });
    upsertMock.mockReset().mockResolvedValue({ ok: false, error: "unavailable", message: "x" });
    auditMock.mockClear();
    const u = await bulkSetDecisions({ batchId: "b-1", userId: "u", items, body: { evaluation_ids: ["e-1", "e-2"], decision: "pass" } });
    expect(u.unavailable).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("G21 P2-B: carries reason_code on the bulk_set audit detail and emits one decision_recorded per touched id", async () => {
    upsertMock.mockResolvedValueOnce({ ok: true, created: true, assessment: {}, version: 1, history: [] }).mockResolvedValueOnce({ ok: true, created: false, assessment: {}, version: 2, history: [] });
    const r = await bulkSetDecisions({
      batchId: "b-1",
      userId: "u-owner",
      orgId: "org-1",
      actor: { plan: "vc_small", email: "owner@x.test" },
      items,
      body: { evaluation_ids: ["e-1", "e-2"], decision: "proceed", conviction: 5, reason_code: "thesis_fit" },
    });
    expect(r).toEqual({ updated: 1, created: 1, skipped: [], failed: [], unavailable: false });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: "assessment.bulk_set", detail: { reason_code: "thesis_fit", decision: "proceed", conviction: 5 } });

    expect(emitFiEventMock).toHaveBeenCalledTimes(2);
    expect(emitFiEventMock.mock.calls[0][0]).toBe("decision_recorded");
    expect(emitFiEventMock.mock.calls[0][1]).toMatchObject({ organisation: "u-owner", startup: "p-1", decision: "proceed", reason_code: "thesis_fit", batch_id: "b-1", channel: "cohort" });
    expect(emitFiEventMock.mock.calls[1][1]).toMatchObject({ organisation: "u-owner", startup: "p-2", decision: "proceed", reason_code: "thesis_fit", batch_id: "b-1", channel: "cohort" });
  });

  it("G21 P2-B: emits no decision_recorded event when only conviction is set (no decision)", async () => {
    upsertMock.mockResolvedValueOnce({ ok: true, created: true, assessment: {}, version: 1, history: [] });
    const r = await bulkSetDecisions({ batchId: "b-1", userId: "u-owner", items, body: { evaluation_ids: ["e-1"], conviction: 3, reason_code: "team_strength" } });
    expect(r.updated + r.created).toBe(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({ detail: { reason_code: "team_strength", decision: null, conviction: 3 } });
    expect(emitFiEventMock).not.toHaveBeenCalled();
  });
});
