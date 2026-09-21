// Route tests for POST|DELETE /api/evaluations/batch/demo (G24-C). Pins:
// both handlers audited (apiRoute); POST goes through the shared evaluator
// gate (401 / 403 feature_locked pass straight through), resolves the acting
// org itself (never from a body), answers 201 on create and 200 on the
// idempotent repeat, 503 migration_pending before 0436; DELETE is owner-only
// (404 when the caller holds no demo batch or is not its creator), 200 with
// the removed count; both rate-limited at 10 / minute.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const gateMock = vi.fn();
vi.mock("@/lib/evaluations/batch-gate", () => ({ gateBatchRequest: (surface: string) => gateMock(surface) }));

const rateLimitMock = vi.fn(() => null as Response | null);
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));

const resolveActingOrgMock = vi.fn(async () => ({ id: "org-1" }));
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: (uid: string) => resolveActingOrgMock(uid as never) }));

const createMock = vi.fn();
const findMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/evaluations/demo-cohort", () => ({
  createDemoBatch: (input: unknown) => createMock(input),
  findDemoBatch: (uid: string, org: string | null) => findMock(uid, org),
  deleteDemoBatch: (batch: unknown, actor: string) => deleteMock(batch, actor),
}));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { DELETE, DEMO_CALLS_PER_MINUTE, POST } from "./route";

const USER = { id: "u-1", email: "pm@program.org", plan: "investor_vc_small" };
const BATCH = { id: "b-demo", userId: "u-1", name: "Demo cohort", status: "done", total: 5, doneCount: 5, failedCount: 0, isDemo: true };

const req = (method: string) => new Request("http://localhost/api/evaluations/batch/demo", { method });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  gateMock.mockResolvedValue({ user: USER, flags: ["lp_export"], response: null });
  rateLimitMock.mockReturnValue(null);
  resolveActingOrgMock.mockResolvedValue({ id: "org-1" });
  createMock.mockResolvedValue({ ok: true, created: true, batch: BATCH, items: 5 });
  findMock.mockResolvedValue({ ok: true, batch: BATCH });
  deleteMock.mockResolvedValue({ ok: true, removedProjects: 5 });
});

describe("POST|DELETE /api/evaluations/batch/demo", () => {
  it("both handlers are wrapped by apiRoute (audited); 10 calls / minute", () => {
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(DELETE)).toBe(true);
    expect(DEMO_CALLS_PER_MINUTE).toBe(10);
  });

  it("POST: the evaluator gate's 401 / 403 pass straight through and nothing is created", async () => {
    gateMock.mockResolvedValueOnce({ user: null, flags: [], response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) });
    expect((await POST(req("POST"))).status).toBe(401);
    gateMock.mockResolvedValueOnce({ user: null, flags: [], response: NextResponse.json({ ok: false, error: "feature_locked", feature: "lp_export" }, { status: 403 }) });
    const locked = await POST(req("POST"));
    expect(locked.status).toBe(403);
    expect(await json(locked)).toMatchObject({ error: "feature_locked" });
    expect(createMock).not.toHaveBeenCalled();
    expect(gateMock).toHaveBeenCalledWith("api/evaluations/batch/demo");
  });

  it("POST: 201 created with the acting org resolved server-side; 200 on the idempotent repeat", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ ok: true, created: true, batch_id: "b-demo", items: 5 });
    expect(createMock).toHaveBeenCalledWith({ userId: "u-1", orgId: "org-1" });
    expect(res.headers.get("cache-control")).toMatch(/no-store/);

    createMock.mockResolvedValueOnce({ ok: true, created: false, batch: BATCH, items: 5 });
    const again = await POST(req("POST"));
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ ok: true, created: false, batch_id: "b-demo" });
  });

  it("POST: a missing org table → orgId null, never a failure; migration_pending → 503; create_failed → 500; rate limit short-circuits", async () => {
    resolveActingOrgMock.mockRejectedValueOnce(new Error("no table"));
    await POST(req("POST"));
    expect(createMock).toHaveBeenLastCalledWith({ userId: "u-1", orgId: null });

    createMock.mockResolvedValueOnce({ ok: false, error: "migration_pending", message: "pending" });
    const pending = await POST(req("POST"));
    expect(pending.status).toBe(503);
    expect(await json(pending)).toMatchObject({ ok: false, error: "migration_pending" });

    createMock.mockResolvedValueOnce({ ok: false, error: "create_failed", message: "nope" });
    expect((await POST(req("POST"))).status).toBe(500);

    rateLimitMock.mockReturnValueOnce(NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 }));
    expect((await POST(req("POST"))).status).toBe(429);
  });

  it("DELETE: 401 anonymous; 404 when the caller has no demo batch; 404 when the demo batch was created by someone else", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await DELETE(req("DELETE"))).status).toBe(401);

    findMock.mockResolvedValueOnce({ ok: true, batch: null });
    const none = await DELETE(req("DELETE"));
    expect(none.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();

    findMock.mockResolvedValueOnce({ ok: true, batch: { ...BATCH, userId: "u-9" } });
    expect((await DELETE(req("DELETE"))).status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
    // The owner lookup is by creator only (never widened to the org).
    expect(findMock).toHaveBeenCalledWith("u-1", null);
  });

  it("DELETE: 200 removed for the creator; 503 before 0436 / without a DB; a delete failure → 500", async () => {
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, removed: true, batch_id: "b-demo", removed_projects: 5 });
    expect(deleteMock).toHaveBeenCalledWith(BATCH, "u-1");

    findMock.mockResolvedValueOnce({ ok: false, error: "migration_pending" });
    expect((await DELETE(req("DELETE"))).status).toBe(503);

    deleteMock.mockResolvedValueOnce({ ok: false, error: "delete_failed", message: "x" });
    expect((await DELETE(req("DELETE"))).status).toBe(500);
  });
});
