// Route tests for POST | PATCH /api/evaluations/batch/[id]/assessments
// (G13-W5-D3, P2). Owner-only 404; 400 on a bad body; the batch's items
// (with their project ids + snapshot ids) and the caller's acting org are
// handed to bulkSetDecisions; foreign ids come back in `skipped`; 503 while
// 0392 is missing; both verbs apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const getBatchMock = vi.fn();
const listItemsMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({ getBatchForUser: (u: string, id: string) => getBatchMock(u, id), listBatchItems: (id: string) => listItemsMock(id) }));
const bulkMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-decisions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/cohort-decisions")>()),
  bulkSetDecisions: (i: unknown) => bulkMock(i),
}));
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: async () => ({ id: "org-1" }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "e-1", project_id: "p-1" }, { id: "e-2", project_id: "p-2" }], error: null }) }) }),
  }),
}));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { PATCH, POST } from "./route";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small" };
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4" };
const ctx = (id = "b-1") => ({ params: Promise.resolve({ id }) });
const req = (body: unknown, method = "POST") => new Request("http://localhost/api/evaluations/batch/b-1/assessments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getBatchMock.mockReset().mockResolvedValue(BATCH);
  listItemsMock.mockReset().mockResolvedValue([
    { evaluationId: "e-1", snapshotId: "s-1" },
    { evaluationId: "e-2", snapshotId: null },
  ]);
  bulkMock.mockReset().mockResolvedValue({ updated: 1, created: 1, skipped: ["e-9"], failed: [], unavailable: false });
});

describe("POST | PATCH /api/evaluations/batch/[id]/assessments", () => {
  it("both verbs are audited; 401 anonymous; 404 for a batch that is not the caller's; 400 on a bad body", async () => {
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(PATCH)).toBe(true);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(req({ evaluation_ids: ["e-1"], decision: "track" }), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    getBatchMock.mockResolvedValue(null);
    expect((await POST(req({ evaluation_ids: ["e-1"], decision: "track" }), ctx("b-other"))).status).toBe(404);
    getBatchMock.mockResolvedValue(BATCH);
    const bad = await POST(req({ evaluation_ids: ["e-1"] }), ctx());
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues[0].path).toBe("decision");
    expect(bulkMock).not.toHaveBeenCalled();
  });

  it("hands the batch items (project + snapshot) and the acting org to bulkSetDecisions and echoes the counts", async () => {
    const res = await PATCH(req({ evaluation_ids: ["e-1", "e-2", "e-9"], decision: "track", conviction: 3 }, "PATCH"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 1, created: 1, skipped: ["e-9"], failed: [] });
    expect(bulkMock).toHaveBeenCalledWith({
      batchId: "b-1",
      userId: "u-1",
      orgId: "org-1",
      items: [{ evaluationId: "e-1", projectId: "p-1", snapshotId: "s-1" }, { evaluationId: "e-2", projectId: "p-2", snapshotId: null }],
      body: { evaluation_ids: ["e-1", "e-2", "e-9"], decision: "track", conviction: 3 },
    });
  });

  it("503 while 0392 is missing", async () => {
    bulkMock.mockResolvedValue({ updated: 0, created: 0, skipped: [], failed: [], unavailable: true });
    const res = await POST(req({ evaluation_ids: ["e-1"], decision: "pass" }), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("unavailable");
  });
});
