// Route tests for GET | POST /api/evaluations/batch/[id]/overrides (G21
// P2-B). Pins: 401 anonymous; assertBatchRole minRole "viewer" for GET /
// "reviewer" for POST, with not_found / forbidden / unavailable mapped to
// 404 / 403 / 503; a 400 for an invalid body (missing reason_code, "other"
// without a note); 404 when findBatchItem cannot resolve the item; the
// happy path hands createOverride the item's model score for the chosen
// dimension (or the SVI total for "total") as `from_value`; createOverride's
// error union maps to 503 / 404 / 500; POST is audited, GET is not.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
}));

const findBatchItemMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-rows-loader", () => ({
  findBatchItem: (batch: unknown, itemId: number) => findBatchItemMock(batch, itemId),
}));

const createOverrideMock = vi.fn();
const listBatchOverridesMock = vi.fn();
vi.mock("@/lib/evaluations/overrides", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/overrides")>()),
  createOverride: (i: unknown) => createOverrideMock(i),
  listBatchOverrides: (batchId: string) => listBatchOverridesMock(batchId),
}));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { GET, OVERRIDES_PER_MINUTE, POST } from "./route";

const USER = { id: "u-1", email: "reviewer@accel.au", plan: "investor_vc_small" };
const BATCH = { id: "b-1", userId: "u-creator", name: "Cohort 4", rubricWeights: {}, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };
const VIEWER_ACCESS = { ok: true as const, batch: BATCH, role: "viewer" as const, isCreator: false };
const REVIEWER_ACCESS = { ok: true as const, batch: BATCH, role: "reviewer" as const, isCreator: false };

const ITEM = { id: 5, evaluationId: "e-1", projectId: "p-1", snapshotId: "snap-1", sviTotal: 71, dimensionScores: { tre: 40, ftv: 80 } };
const OVERRIDE_ROW = { id: "ov-1", batchId: "b-1", itemId: 5, projectId: "p-1", dimension: "tre", fromValue: 40, toValue: 62, reasonCode: "sector_context", note: null, reviewerId: "u-1", reviewerName: null, createdAt: "2026-09-11T00:00:00Z" };

const ctx = (id = "b-1") => ({ params: Promise.resolve({ id }) });
function getReq(id = "b-1"): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/overrides`);
}
function postReq(body: unknown, id = "b-1"): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue(REVIEWER_ACCESS);
  findBatchItemMock.mockResolvedValue(ITEM);
  createOverrideMock.mockResolvedValue({ ok: true, override: OVERRIDE_ROW });
  listBatchOverridesMock.mockResolvedValue({ rows: [OVERRIDE_ROW], available: true });
});

describe("GET /api/evaluations/batch/[id]/overrides", () => {
  it("OVERRIDES_PER_MINUTE is 30; GET is not audited, POST is", () => {
    expect(OVERRIDES_PER_MINUTE).toBe(30);
    expect(isAuditedHandler(GET)).toBe(false);
    expect(isAuditedHandler(POST)).toBe(true);
  });

  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole with minRole 'viewer' and maps not_found / forbidden", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    const notFound = await GET(getReq(), ctx());
    expect(notFound.status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "u-1", "viewer");

    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    const forbidden = await GET(getReq(), ctx());
    expect(forbidden.status).toBe(403);
  });

  it("200s with { ok, available, overrides }", async () => {
    assertBatchRoleMock.mockResolvedValue(VIEWER_ACCESS);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, available: true, overrides: [OVERRIDE_ROW] });
    expect(listBatchOverridesMock).toHaveBeenCalledWith("b-1");
  });
});

describe("POST /api/evaluations/batch/[id]/overrides", () => {
  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq({}), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole with minRole 'reviewer' and maps not_found / forbidden (viewer) / unavailable", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    const notFound = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(notFound.status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "u-1", "reviewer");

    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    const forbidden = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(forbidden.status).toBe(403);

    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "unavailable" });
    const unavailable = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(unavailable.status).toBe(503);
  });

  it("400s a body missing reason_code", async () => {
    const res = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60 }), ctx());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("invalid_body");
    expect((body.issues as Array<{ path: string }>).some((i) => i.path === "reason_code")).toBe(true);
    expect(createOverrideMock).not.toHaveBeenCalled();
  });

  it("400s reason_code 'other' with no note; issue path is 'note'", async () => {
    const res = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "other" }), ctx());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect((body.issues as Array<{ path: string }>).some((i) => i.path === "note")).toBe(true);
  });

  it("404s when findBatchItem cannot resolve the item", async () => {
    findBatchItemMock.mockResolvedValue(null);
    const res = await POST(postReq({ item_id: 999, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("not_found");
    expect(createOverrideMock).not.toHaveBeenCalled();
  });

  it("hands createOverride the item's model score for the chosen dimension as from_value", async () => {
    await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(createOverrideMock).toHaveBeenCalledWith({
      batchId: "b-1",
      reviewer: { id: "u-1", email: "reviewer@accel.au", plan: "investor_vc_small" },
      item: { id: 5, projectId: "p-1", fromValue: 40 },
      body: { item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" },
    });
  });

  it("hands createOverride the SVI total as from_value when dimension is 'total'", async () => {
    await POST(postReq({ item_id: 5, dimension: "total", to_value: 80, reason_code: "sector_context" }), ctx());
    expect(createOverrideMock).toHaveBeenCalledWith(
      expect.objectContaining({ item: { id: 5, projectId: "p-1", fromValue: 71 } }),
    );
  });

  it("201s with { ok:true, override, canonical_unchanged:true }", async () => {
    const res = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, override: OVERRIDE_ROW, canonical_unchanged: true });
  });

  it("maps createOverride's error union: unavailable -> 503, item_not_in_batch -> 404, db_error -> 500", async () => {
    createOverrideMock.mockResolvedValue({ ok: false, error: "unavailable", message: "not yet" });
    const unavailable = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(unavailable.status).toBe(503);

    createOverrideMock.mockResolvedValue({ ok: false, error: "item_not_in_batch", message: "no" });
    const notInBatch = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(notInBatch.status).toBe(404);

    createOverrideMock.mockResolvedValue({ ok: false, error: "db_error", message: "boom" });
    const dbErr = await POST(postReq({ item_id: 5, dimension: "tre", to_value: 60, reason_code: "sector_context" }), ctx());
    expect(dbErr.status).toBe(500);
  });
});
