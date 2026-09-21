// Route tests for GET /api/evaluations/batch/[id]/snapshots (G21 P2-A ·
// G22-A). Pins: 401 anonymous; 404 for a non-uuid id; G22-A: any seat on the
// batch reads (assertBatchRole "viewer" — a reviewer / viewer answers 200,
// a non-member 404, unavailable 503) — the same rule migration 0432 gives
// user-JWT clients; `limit` clamps to 1..100 (default 20); the delta block
// compares the two newest snapshots and carries `weightsChanged` when their
// weights_version differs; private no-store headers.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
}));

const listCohortSnapshotsMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-snapshots", () => ({
  listCohortSnapshots: (id: string, limit: number) => listCohortSnapshotsMock(id, limit),
}));

import { GET } from "./route";

const B_ID = "11111111-1111-4111-a111-111111111111";
const USER = { id: "u-2", email: "viewer@accel.au", plan: "investor_angel" };
const BATCH = { id: B_ID, userId: "u-1", name: "Cohort 4" };
const row = (project_id: string, svi: number) => ({ project_id, evaluation_id: `e-${project_id}`, item_id: 1, svi, evidence_confidence: null, verification_level: 2, dims: { tre: svi }, gaps_count: 1, status: "done" });
const LATEST = { id: "s-2", batchId: B_ID, takenAt: "2026-09-20T00:00:00Z", taken_at: "2026-09-20T00:00:00Z", reason: "manual", weightsVersion: 2, weights_version: 2, rows: [row("p-1", 65)], summary: { n: 1 } };
const PREVIOUS = { ...LATEST, id: "s-1", takenAt: "2026-09-10T00:00:00Z", taken_at: "2026-09-10T00:00:00Z", weightsVersion: 1, weights_version: 1, rows: [row("p-1", 60)] };

const ctx = (id = B_ID) => ({ params: Promise.resolve({ id }) });
const req = (qs = "") => new Request(`http://localhost/api/evaluations/batch/${B_ID}/snapshots${qs}`);
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue({ ok: true, batch: BATCH, role: "viewer", isCreator: false });
  listCohortSnapshotsMock.mockResolvedValue([LATEST, PREVIOUS]);
});

describe("GET /api/evaluations/batch/[id]/snapshots", () => {
  it("401 anonymous; 404 non-uuid (no membership read)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(401);
    expect((await GET(req(), ctx("nope"))).status).toBe(404);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("G22-A: a viewer seat reads the snapshots; a non-member 404; unavailable 503", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(assertBatchRoleMock).toHaveBeenCalledWith(B_ID, "u-2", "viewer");
    expect(res.headers.get("cache-control")).toContain("no-store");
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await GET(req(), ctx())).status).toBe(404);
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    expect((await GET(req(), ctx())).status).toBe(503);
  });

  it("limit defaults to 20 and clamps to 1..100", async () => {
    await GET(req(), ctx());
    expect(listCohortSnapshotsMock).toHaveBeenLastCalledWith(B_ID, 20);
    await GET(req("?limit=5"), ctx());
    expect(listCohortSnapshotsMock).toHaveBeenLastCalledWith(B_ID, 5);
    await GET(req("?limit=500"), ctx());
    expect(listCohortSnapshotsMock).toHaveBeenLastCalledWith(B_ID, 20);
    await GET(req("?limit=0"), ctx());
    expect(listCohortSnapshotsMock).toHaveBeenLastCalledWith(B_ID, 20);
  });

  it("the delta compares the two newest snapshots and flags a weights change between them", async () => {
    const body = await json(await GET(req(), ctx()));
    const delta = body.delta as { byProject: Record<string, { svi: number; weightsChanged: boolean }>; summary: { n: number; up: number } };
    expect(delta.byProject["p-1"]).toMatchObject({ svi: 5, weightsChanged: true });
    expect(delta.summary).toMatchObject({ n: 1, up: 1 });
    listCohortSnapshotsMock.mockResolvedValueOnce([LATEST]);
    const single = await json(await GET(req(), ctx()));
    expect((single.delta as { byProject: Record<string, unknown> }).byProject).toEqual({});
  });
});
