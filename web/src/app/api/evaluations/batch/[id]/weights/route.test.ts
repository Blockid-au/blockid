// Route tests for PATCH /api/evaluations/batch/[id]/weights (G22-A A.3).
// Pins: 401 anonymous; 404 for a non-uuid id; assertBatchRole minRole
// "owner" (403 reviewer / viewer, 404 non-member, 503 unavailable); zod:
// every dimension required, 0..100, no unknown keys, at least one > 0;
// updateBatchWeights receives the parsed set; a changed set answers 200 with
// weights_version + previous_version + audit `cohort.weights_updated`; an
// unchanged set answers 200 changed:false with NO audit row; the write
// errors map to 503 / 404 / 500; the handler is audited (apiRoute).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const rateLimitMock = vi.fn(() => null as Response | null);
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
}));

const updateBatchWeightsMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  updateBatchWeights: (batch: unknown, weights: unknown) => updateBatchWeightsMock(batch, weights),
}));

const auditMock = vi.fn(async () => ({ id: 1n }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { PATCH, WEIGHTS_WRITES_PER_MINUTE, weightsPatchSchema } from "./route";

const B_ID = "11111111-1111-4111-a111-111111111111";
const USER = { id: "u-1", email: "owner@accel.au", plan: "investor_vc_small" };
const EQUAL = { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 };
const BATCH = { id: B_ID, userId: "u-1", name: "Cohort 4", rubricWeights: EQUAL, weightsVersion: 1, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };
const OWNER = { ok: true as const, batch: BATCH, role: "owner" as const, isCreator: true };

const ctx = (id = B_ID) => ({ params: Promise.resolve({ id }) });
function req(body: unknown, id = B_ID): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/weights`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue(OWNER);
  rateLimitMock.mockReturnValue(null);
  updateBatchWeightsMock.mockResolvedValue({ ok: true, batch: { ...BATCH, rubricWeights: { ...EQUAL, tre: 40 }, weightsVersion: 2 }, previousVersion: 1, changed: true });
});

describe("weightsPatchSchema", () => {
  it("accepts the 8 dimensions 0..100; rejects a missing key, an out-of-range value, an unknown key and an all-zero set", () => {
    expect(weightsPatchSchema.safeParse({ rubric_weights: EQUAL }).success).toBe(true);
    expect(weightsPatchSchema.safeParse({ rubric_weights: { ...EQUAL, tre: 100 } }).success).toBe(true);
    const { svm: _svm, ...missing } = EQUAL;
    expect(weightsPatchSchema.safeParse({ rubric_weights: missing }).success).toBe(false);
    expect(weightsPatchSchema.safeParse({ rubric_weights: { ...EQUAL, tre: 101 } }).success).toBe(false);
    expect(weightsPatchSchema.safeParse({ rubric_weights: { ...EQUAL, tre: -1 } }).success).toBe(false);
    expect(weightsPatchSchema.safeParse({ rubric_weights: { ...EQUAL, bogus: 1 } }).success).toBe(false);
    expect(weightsPatchSchema.safeParse({ rubric_weights: EQUAL, extra: true }).success).toBe(false);
    const zero = Object.fromEntries(Object.keys(EQUAL).map((k) => [k, 0]));
    expect(weightsPatchSchema.safeParse({ rubric_weights: zero }).success).toBe(false);
  });
});

describe("PATCH /api/evaluations/batch/[id]/weights", () => {
  it("is wrapped by apiRoute (audited)", () => {
    expect(isAuditedHandler(PATCH)).toBe(true);
    expect(WEIGHTS_WRITES_PER_MINUTE).toBe(30);
  });

  it("401 anonymous; 404 for a non-uuid id (no membership read)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(401);
    const res = await PATCH(req({ rubric_weights: EQUAL }, "not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("owner gate: 403 for a reviewer / viewer, 404 non-member, 503 unavailable", async () => {
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "forbidden" });
    const forbidden = await PATCH(req({ rubric_weights: EQUAL }), ctx());
    expect(forbidden.status).toBe(403);
    expect(assertBatchRoleMock).toHaveBeenCalledWith(B_ID, "u-1", "owner");
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(404);
    assertBatchRoleMock.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(503);
    expect(updateBatchWeightsMock).not.toHaveBeenCalled();
  });

  it("429 from the rate limiter is returned as-is", async () => {
    rateLimitMock.mockReturnValueOnce(new Response("slow down", { status: 429 }));
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(429);
    expect(updateBatchWeightsMock).not.toHaveBeenCalled();
  });

  it("400 invalid_body with issues for a bad set", async () => {
    const res = await PATCH(req({ rubric_weights: { ...EQUAL, tre: 500 } }), ctx());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("invalid_body");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(updateBatchWeightsMock).not.toHaveBeenCalled();
  });

  it("a changed set → 200 with the new + previous version and an audit row cohort.weights_updated", async () => {
    const res = await PATCH(req({ rubric_weights: { ...EQUAL, tre: 40 } }), ctx());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, weights_version: 2, previous_version: 1, changed: true });
    expect(updateBatchWeightsMock).toHaveBeenCalledWith(BATCH, { ...EQUAL, tre: 40 });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u-1", action: "cohort.weights_updated", resource_type: "evaluation_batch", resource_id: B_ID, detail: expect.objectContaining({ previous_version: 1, weights_version: 2 }) }),
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("an unchanged set → 200 changed:false, same version, no audit row", async () => {
    updateBatchWeightsMock.mockResolvedValueOnce({ ok: true, batch: BATCH, previousVersion: 1, changed: false });
    const res = await PATCH(req({ rubric_weights: EQUAL }), ctx());
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, weights_version: 1, previous_version: 1, changed: false });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("write errors map: unavailable → 503, not_found → 404, write_failed → 500 (message is the lib's user copy)", async () => {
    updateBatchWeightsMock.mockResolvedValueOnce({ ok: false, error: "unavailable", message: "Cohorts are not available right now" });
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(503);
    updateBatchWeightsMock.mockResolvedValueOnce({ ok: false, error: "not_found", message: "Cohort not found" });
    expect((await PATCH(req({ rubric_weights: EQUAL }), ctx())).status).toBe(404);
    updateBatchWeightsMock.mockResolvedValueOnce({ ok: false, error: "write_failed", message: "Could not save the program weights. Please try again." });
    const res = await PATCH(req({ rubric_weights: EQUAL }), ctx());
    expect(res.status).toBe(500);
    expect((await json(res)).message).toBe("Could not save the program weights. Please try again.");
  });
});
