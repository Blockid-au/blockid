// Route tests for POST /api/evaluations/batch/[id]/snapshot and
// GET /api/evaluations/batch/[id]/snapshots (G21 P2-A).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const getEntitlementsMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: () => getEntitlementsMock(), recordGateHit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const getBatchForUserMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({ getBatchForUser: (u: string, id: string) => getBatchForUserMock(u, id) }));

const snapMocks = vi.hoisted(() => ({ take: vi.fn(), latest: vi.fn(), requeue: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/evaluations/cohort-snapshots", () => ({
  RESCORE_STALE_DAYS: 30,
  takeCohortSnapshot: (id: string, opts: unknown) => snapMocks.take(id, opts),
  latestSnapshots: (id: string) => snapMocks.latest(id),
  requeueStaleItems: (b: unknown, opts: unknown) => snapMocks.requeue(b, opts),
  listCohortSnapshots: (id: string, limit: number) => snapMocks.list(id, limit),
}));

import { POST } from "./route";
import { GET } from "../snapshots/route";

const ID = "11111111-2222-4333-8444-555555555555";
const USER = { id: "u-1", email: "p@x.au", plan: "investor_vc_small" };
const BATCH = { id: ID, userId: "u-1", status: "done", total: 2, weightsVersion: 1 };
const SNAP = (taken_at: string, svi: number) => ({ id: `s-${taken_at}`, batchId: ID, takenAt: taken_at, taken_at, reason: "manual", weightsVersion: 1, weights_version: 1, rows: [{ project_id: "p-1", svi, evidence_confidence: null, verification_level: 1, dims: { ftv: svi }, gaps_count: 4 }], summary: { n: 1 }, createdBy: null });

const post = (body: unknown) => new Request(`http://localhost/api/evaluations/batch/${ID}/snapshot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(["lp_export"]);
  getBatchForUserMock.mockResolvedValue(BATCH);
  snapMocks.take.mockResolvedValue({ ok: true, snapshot: SNAP("2026-09-20T00:00:00Z", 55) });
  snapMocks.latest.mockResolvedValue({ latest: SNAP("2026-09-20T00:00:00Z", 55), previous: SNAP("2026-09-01T00:00:00Z", 50), count: 2 });
  snapMocks.requeue.mockResolvedValue({ requeued: [2], fresh: 1, batchStatus: "queued" });
  snapMocks.list.mockResolvedValue([SNAP("2026-09-20T00:00:00Z", 55), SNAP("2026-09-01T00:00:00Z", 50)]);
});

describe("POST /snapshot", () => {
  it("401 / 403 / 404", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await POST(post({}), ctx())).status).toBe(401);
    getEntitlementsMock.mockResolvedValueOnce(["watchlist"]);
    expect((await POST(post({}), ctx())).status).toBe(403);
    expect((await POST(post({}), ctx("bad"))).status).toBe(404);
    getBatchForUserMock.mockResolvedValueOnce(null);
    expect((await POST(post({}), ctx())).status).toBe(404);
    expect(snapMocks.take).not.toHaveBeenCalled();
  });

  it("400 on a bad reason / days", async () => {
    expect((await POST(post({ reason: "batch_complete" }), ctx())).status).toBe(400);
    expect((await POST(post({ reason: "rescore", older_than_days: -1 }), ctx())).status).toBe(400);
  });

  it("manual: takes the snapshot with createdBy + batch, no re-queue, returns the delta summary", async () => {
    const res = await POST(post({}), ctx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(snapMocks.requeue).not.toHaveBeenCalled();
    expect(snapMocks.take).toHaveBeenCalledWith(ID, { reason: "manual", createdBy: "u-1", batch: BATCH });
    expect(json).toMatchObject({ ok: true, requeued: [], batch_status: "done", delta: { n: 1, up: 1, medianSvi: 5 } });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rescore: re-queues stale items (default 30 d, or older_than_days) then snapshots with reason rescore", async () => {
    const res = await POST(post({ reason: "rescore", older_than_days: 7 }), ctx());
    expect(res.status).toBe(201);
    expect(snapMocks.requeue).toHaveBeenCalledWith(BATCH, { olderThanDays: 7 });
    expect(snapMocks.take).toHaveBeenCalledWith(ID, expect.objectContaining({ reason: "rescore" }));
    expect(await res.json()).toMatchObject({ requeued: [2], fresh: 1, batch_status: "queued" });
  });

  it("503 not_migrated passes the message through", async () => {
    snapMocks.take.mockResolvedValueOnce({ ok: false, error: "not_migrated", message: "apply 0422" });
    const res = await POST(post({}), ctx());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "not_migrated", message: "apply 0422" });
  });
});

describe("GET /snapshots", () => {
  const get = (qs = "") => new Request(`http://localhost/api/evaluations/batch/${ID}/snapshots${qs}`);

  it("401 anonymous, 404 not mine", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET(get(), ctx())).status).toBe(401);
    getBatchForUserMock.mockResolvedValueOnce(null);
    expect((await GET(get(), ctx())).status).toBe(404);
  });

  it("lists snapshots newest first with deltaByProject + summary; clamps limit", async () => {
    const res = await GET(get("?limit=5"), ctx());
    expect(res.status).toBe(200);
    expect(snapMocks.list).toHaveBeenCalledWith(ID, 5);
    const json = await res.json();
    expect(json.snapshots).toHaveLength(2);
    expect(json.delta.byProject["p-1"]).toMatchObject({ svi: 5, dims: { ftv: 5 }, from: "2026-09-01T00:00:00Z", to: "2026-09-20T00:00:00Z" });
    expect(json.delta.summary).toEqual({ n: 1, up: 1, down: 0, flat: 0, medianSvi: 5 });
    await GET(get("?limit=999"), ctx());
    expect(snapMocks.list).toHaveBeenLastCalledWith(ID, 20);
  });
});
