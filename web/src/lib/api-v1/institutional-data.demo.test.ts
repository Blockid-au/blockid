// G24-C — the fictional demo cohort never leaves through the institutional
// API: listReadableBatches drops `is_demo` rows, and a keyed read of the
// demo batch (cohort / snapshots) is a 404 exactly like a foreign id.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const listBatchesMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({ listBatches: (...a: unknown[]) => listBatchesMock(...(a as [])) }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({ assertBatchRole: (...a: unknown[]) => assertBatchRoleMock(...(a as [])) }));

const loadRowsMock = vi.fn(async () => ({ rows: [], baseRows: [], overridesAvailable: false }));
vi.mock("@/lib/evaluations/cohort-rows-loader", () => ({ loadBlockIdCohortRows: (...a: unknown[]) => loadRowsMock(...(a as [])) }));
const listSnapshotsMock = vi.fn(async () => []);
vi.mock("@/lib/evaluations/cohort-snapshots", () => ({ listCohortSnapshots: (...a: unknown[]) => listSnapshotsMock(...(a as [])) }));
vi.mock("@/lib/svi/assessment-context", () => ({ loadAssessmentContext: async () => ({ benchmark: null, unverifiedMaterialClaims: null, evidenceConfidence: null }) }));

import { listReadableBatches, loadCohortForKey, loadCohortSnapshotsForKey } from "./institutional-data";
import { equalWeights, type EvaluationBatch } from "@/lib/evaluations/batch-shared";

function batch(over: Partial<EvaluationBatch> = {}): EvaluationBatch {
  return {
    id: "b-real",
    userId: "u-1",
    name: "Spring",
    rubricWeights: equalWeights(),
    status: "done",
    total: 3,
    doneCount: 3,
    failedCount: 0,
    createdAt: "2026-09-20T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    programName: null,
    intakeId: null,
    templateId: null,
    weightsVersion: 1,
    applicantsCap: null,
    pilotOrderId: null,
    orgId: null,
    isDemo: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("institutional API — demo cohort exclusion (G24-C)", () => {
  it("listReadableBatches drops the demo batch and keeps the real ones", async () => {
    listBatchesMock.mockResolvedValue([
      { ...batch(), role: "owner" },
      { ...batch({ id: "b-demo", name: "Demo cohort", isDemo: true }), role: "owner" },
      { ...batch({ id: "b-member", userId: "u-9" }), role: "viewer" },
    ]);
    const out = await listReadableBatches("u-1", 50);
    expect(out.map((c) => c.id)).toEqual(["b-real", "b-member"]);
    expect(JSON.stringify(out)).not.toContain("b-demo");
  });

  it("loadCohortForKey / loadCohortSnapshotsForKey answer not_found for the demo batch even for its owner", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: batch({ id: "b-demo", isDemo: true }), role: "owner", isCreator: true });
    expect(await loadCohortForKey("b-demo", "u-1")).toEqual({ ok: false, error: "not_found" });
    expect(await loadCohortSnapshotsForKey("b-demo", "u-1")).toEqual({ ok: false, error: "not_found" });
    expect(loadRowsMock).not.toHaveBeenCalled();
    expect(listSnapshotsMock).not.toHaveBeenCalled();
  });

  it("a real batch still loads", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: true, batch: batch(), role: "owner", isCreator: true });
    const r = await loadCohortForKey("b-real", "u-1");
    expect(r.ok).toBe(true);
    expect(loadRowsMock).toHaveBeenCalledTimes(1);
  });
});
