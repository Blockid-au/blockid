// Route tests for PATCH /api/evaluations/batch/[id]/items/[itemId] (G21
// P2-B). Pins: 401 anonymous; not-an-int itemId -> 404 before assertBatchRole
// runs; assertBatchRole("reviewer") 404 / 403 / 503 mapping; empty / unknown
// / bad-enum bodies -> 400; a `reviewer_id` that is neither the caller nor
// the batch creator is checked against loadMemberRole; the update patch
// carries only the keys sent, scoped by id + batch_id; a missing-column
// (42703) error degrades to 503, any other DB error is 500, no row is 404;
// the happy path audits cohort.item_updated with batch_id + role + patch.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertBatchRoleMock = vi.fn();
const loadMemberRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
  loadMemberRole: (batchId: string, userId: string) => loadMemberRoleMock(batchId, userId),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const appendAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ appendAudit: (e: Record<string, unknown>) => appendAuditMock(e) }));

interface FakeState {
  fromCalls: string[];
  updates: Array<Record<string, unknown>>;
  eqCalls: Array<[string, unknown]>;
  selectCalls: string[];
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
}
const state: FakeState = { fromCalls: [], updates: [], eqCalls: [], selectCalls: [], data: null, error: null };

function makeChain() {
  const api: Record<string, unknown> = {};
  api.update = (patch: Record<string, unknown>) => {
    state.updates.push(patch);
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCalls.push([col, val]);
    return api;
  };
  api.select = (cols: string) => {
    state.selectCalls.push(cols);
    return api;
  };
  api.maybeSingle = () => Promise.resolve({ data: state.data, error: state.error });
  return api;
}
const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdminMock() }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { ITEM_PATCHES_PER_MINUTE, PATCH, itemPatchSchema } from "./route";

const USER = { id: "11111111-1111-4111-a111-111111111111", email: "reviewer@accel.au", plan: null };
const BATCH = { id: "b-1", userId: "u-creator", name: "Cohort 4", rubricWeights: {}, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };
const OK_ACCESS = { ok: true as const, batch: BATCH, role: "reviewer" as const, isCreator: false };

const ctx = (id = "b-1", itemId = "5") => ({ params: Promise.resolve({ id, itemId }) });
function req(body: unknown): Request {
  return new Request("http://localhost/api/evaluations/batch/b-1/items/5", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.fromCalls = [];
  state.updates = [];
  state.eqCalls = [];
  state.selectCalls = [];
  state.data = { id: 5, shortlisted: true, review_status: "reviewed", reviewer_id: null };
  state.error = null;
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue(OK_ACCESS);
  loadMemberRoleMock.mockResolvedValue(null);
  appendAuditMock.mockResolvedValue(undefined);
  getSupabaseAdminMock.mockReturnValue({
    from(table: string) {
      state.fromCalls.push(table);
      return makeChain();
    },
  });
});

describe("PATCH /api/evaluations/batch/[id]/items/[itemId]", () => {
  it("is audited; ITEM_PATCHES_PER_MINUTE is 60; itemPatchSchema refuses {}", () => {
    expect(isAuditedHandler(PATCH)).toBe(true);
    expect(ITEM_PATCHES_PER_MINUTE).toBe(60);
    expect(itemPatchSchema.safeParse({}).success).toBe(false);
  });

  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(req({ shortlisted: true }), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-1", "5.5"])("404s a non-positive-int itemId (%s) before assertBatchRole runs", async (itemId) => {
    const res = await PATCH(req({ shortlisted: true }), ctx("b-1", itemId));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("not_found");
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole(id, userId, 'reviewer') and maps not_found / forbidden / unavailable", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    const notFound = await PATCH(req({ shortlisted: true }), ctx());
    expect(notFound.status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "11111111-1111-4111-a111-111111111111", "reviewer");

    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    const forbidden = await PATCH(req({ shortlisted: true }), ctx());
    expect(forbidden.status).toBe(403);
    expect((await json(forbidden)).error).toBe("forbidden");

    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "unavailable" });
    const unavailable = await PATCH(req({ shortlisted: true }), ctx());
    expect(unavailable.status).toBe(503);
    expect((await json(unavailable)).error).toBe("unavailable");
  });

  it("400s an empty body", async () => {
    const res = await PATCH(req({}), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
  });

  it("400s an unknown key", async () => {
    const res = await PATCH(req({ foo: 1 }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
  });

  it("400s a bad review_status", async () => {
    const res = await PATCH(req({ review_status: "bogus" }), ctx());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("invalid_body");
    expect((body.issues as Array<{ path: string }>)[0].path).toBe("review_status");
  });

  it("checks a reviewer_id that is neither the caller nor the creator against loadMemberRole; null -> 400 invalid_reviewer", async () => {
    loadMemberRoleMock.mockResolvedValue(null);
    const res = await PATCH(req({ reviewer_id: "22222222-2222-4222-a222-222222222222" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_reviewer");
    expect(loadMemberRoleMock).toHaveBeenCalledWith("b-1", "22222222-2222-4222-a222-222222222222");
  });

  it("a viewer-seat reviewer_id -> 400 invalid_reviewer", async () => {
    loadMemberRoleMock.mockResolvedValue("viewer");
    const res = await PATCH(req({ reviewer_id: "22222222-2222-4222-a222-222222222222" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_reviewer");
  });

  it("a reviewer/owner-seat reviewer_id passes loadMemberRole and proceeds to the update", async () => {
    loadMemberRoleMock.mockResolvedValue("reviewer");
    state.data = { id: 5, shortlisted: false, review_status: "unreviewed", reviewer_id: "22222222-2222-4222-a222-222222222222" };
    const res = await PATCH(req({ reviewer_id: "22222222-2222-4222-a222-222222222222" }), ctx());
    expect(res.status).toBe(200);
    expect(state.updates.at(-1)).toEqual({ reviewer_id: "22222222-2222-4222-a222-222222222222" });
  });

  it("does not consult loadMemberRole when reviewer_id is the caller's own id", async () => {
    const res = await PATCH(req({ reviewer_id: USER.id }), ctx());
    expect(res.status).toBe(200);
    expect(loadMemberRoleMock).not.toHaveBeenCalled();
  });

  it("happy path: 200 with the mapped item, patch scoped to id + batch_id, and only the sent keys in the patch", async () => {
    state.data = { id: 5, shortlisted: true, review_status: "reviewed", reviewer_id: null };
    const res = await PATCH(req({ shortlisted: true, review_status: "reviewed" }), ctx());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, item: { id: 5, shortlisted: true, review_status: "reviewed", reviewer_id: null } });
    expect(state.updates.at(-1)).toEqual({ shortlisted: true, review_status: "reviewed" });
    expect(state.eqCalls).toContainEqual(["id", 5]);
    expect(state.eqCalls).toContainEqual(["batch_id", "b-1"]);
    expect(state.selectCalls.at(-1)).toBe("id, shortlisted, review_status, reviewer_id");
  });

  it("a patch with only `shortlisted` updates only that key", async () => {
    state.data = { id: 5, shortlisted: false, review_status: "unreviewed", reviewer_id: null };
    await PATCH(req({ shortlisted: false }), ctx());
    expect(state.updates.at(-1)).toEqual({ shortlisted: false });
  });

  it("audits cohort.item_updated with batch_id + role + patch", async () => {
    await PATCH(req({ shortlisted: true, review_status: "reviewed" }), ctx());
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const entry = appendAuditMock.mock.calls[0]?.[0];
    expect(entry.action).toBe("cohort.item_updated");
    expect(entry.resource_type).toBe("evaluation_batch_item");
    expect(entry.resource_id).toBe("5");
    expect(entry.detail).toEqual({ batch_id: "b-1", role: "reviewer", shortlisted: true, review_status: "reviewed" });
  });

  it("a 42703 missing-column error -> 503", async () => {
    state.data = null;
    state.error = { code: "42703", message: "column evaluation_batch_items.shortlisted does not exist" };
    const res = await PATCH(req({ shortlisted: true }), ctx());
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("unavailable");
  });

  it("any other DB error -> 500", async () => {
    state.data = null;
    state.error = { message: "row locked" };
    const res = await PATCH(req({ shortlisted: true }), ctx());
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("db_error");
  });

  it("no row (item not of this batch) -> 404", async () => {
    state.data = null;
    state.error = null;
    const res = await PATCH(req({ shortlisted: true }), ctx());
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("not_found");
  });
});
