// Route tests for GET /api/evaluations/batch/[id]/items/[itemId]/trajectory
// (G22-A A.5). Pins: 401 anonymous; 404 for a non-uuid batch / non-integer
// item; assertBatchRole minRole "viewer" (404 non-member, 503 unavailable);
// 404 when the item is not in the batch; the item's evaluation consent tier
// decides `withholdOutcomeValues` (attributed_only → withheld, reports_shared
// / full_mentor → not) and the response echoes it; the project verification
// level is passed as "L<n>" (or a stored "L2" string as-is, null when
// unknown); loadTrajectory is called with the item's project id; private
// no-store headers.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
}));

const findBatchItemMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-rows-loader", () => ({
  findBatchItemIds: (batch: unknown, itemId: number) => findBatchItemMock(batch, itemId),
}));

const loadTrajectoryMock = vi.fn();
vi.mock("@/lib/svi/trajectory-load", () => ({
  loadTrajectory: (db: unknown, projectId: string, opts: unknown) => loadTrajectoryMock(db, projectId, opts),
}));

const rows: { evaluations: Record<string, unknown> | null; projects: Record<string, unknown> | null } = { evaluations: null, projects: null };
const state = { configured: true };
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () =>
    state.configured
      ? {
          from: (table: "evaluations" | "projects") => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }) }),
          }),
        }
      : null,
}));

import { GET, withholdsOutcomeValues } from "./route";

const B_ID = "11111111-1111-4111-a111-111111111111";
const USER = { id: "u-2", email: "reviewer@accel.au", plan: "investor_angel" };
const BATCH = { id: B_ID, userId: "u-1", name: "Cohort 4", status: "done", total: 2 };
const VIEWER = { ok: true as const, batch: BATCH, role: "viewer" as const, isCreator: false };
const ITEM = { id: 7, evaluationId: "e-1", projectId: "p-1", snapshotId: "s-1", sviTotal: 61, dimensionScores: null };
const TRAJECTORY = { state: "series", day0: "2026-01-01", spanDays: 90, points: [], markers: [], milestones: [], latest: null, verificationLevel: "L2", outcomesAfterLatest: 0 };

const ctx = (id = B_ID, itemId = "7") => ({ params: Promise.resolve({ id, itemId }) });
const req = () => new Request(`http://localhost/api/evaluations/batch/${B_ID}/items/7/trajectory`);
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  rows.evaluations = { consent_tier: "reports_shared" };
  rows.projects = { verification_level: 2 };
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue(VIEWER);
  findBatchItemMock.mockResolvedValue(ITEM);
  loadTrajectoryMock.mockResolvedValue(TRAJECTORY);
});

describe("withholdsOutcomeValues", () => {
  it("only attributed_only withholds", () => {
    expect(withholdsOutcomeValues("attributed_only")).toBe(true);
    expect(withholdsOutcomeValues("reports_shared")).toBe(false);
    expect(withholdsOutcomeValues("full_mentor")).toBe(false);
  });
});

describe("GET …/items/[itemId]/trajectory", () => {
  it("401 anonymous; 404 for a non-uuid batch or a bad item id (no membership read)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(401);
    expect((await GET(req(), ctx("nope", "7"))).status).toBe(404);
    expect((await GET(req(), ctx(B_ID, "x"))).status).toBe(404);
    expect((await GET(req(), ctx(B_ID, "0"))).status).toBe(404);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("viewer gate: 404 non-member, 503 unavailable; 404 when the item is not in the batch", async () => {
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await GET(req(), ctx())).status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith(B_ID, "u-2", "viewer");
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    expect((await GET(req(), ctx())).status).toBe(503);
    findBatchItemMock.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(404);
    expect(loadTrajectoryMock).not.toHaveBeenCalled();
  });

  it("reports_shared: values shown; the project's level is passed as L<n>; the trajectory is the item's project's", async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, item_id: 7, project_id: "p-1", consent_tier: "reports_shared", values_withheld: false, trajectory: TRAJECTORY });
    expect(findBatchItemMock).toHaveBeenCalledWith(BATCH, 7);
    expect(loadTrajectoryMock).toHaveBeenCalledWith(expect.anything(), "p-1", { verificationLevel: "L2", withholdOutcomeValues: false });
  });

  it("attributed_only: outcome values withheld (the cohort seat never sees wider than the evaluation's tier); an unknown tier reads as attributed_only", async () => {
    rows.evaluations = { consent_tier: "attributed_only" };
    let body = await json(await GET(req(), ctx()));
    expect(body).toMatchObject({ values_withheld: true, consent_tier: "attributed_only" });
    expect(loadTrajectoryMock).toHaveBeenLastCalledWith(expect.anything(), "p-1", expect.objectContaining({ withholdOutcomeValues: true }));
    rows.evaluations = null;
    body = await json(await GET(req(), ctx()));
    expect(body).toMatchObject({ values_withheld: true, consent_tier: "attributed_only" });
  });

  it("verification level: a stored 'l3' string passes through upper-cased; a missing project row → null", async () => {
    rows.projects = { verification_level: "l3" };
    await GET(req(), ctx());
    expect(loadTrajectoryMock).toHaveBeenLastCalledWith(expect.anything(), "p-1", expect.objectContaining({ verificationLevel: "L3" }));
    rows.projects = null;
    await GET(req(), ctx());
    expect(loadTrajectoryMock).toHaveBeenLastCalledWith(expect.anything(), "p-1", expect.objectContaining({ verificationLevel: null }));
  });

  it("503 without a DB client", async () => {
    state.configured = false;
    expect((await GET(req(), ctx())).status).toBe(503);
  });
});
