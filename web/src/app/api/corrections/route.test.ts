// HTTP contract for POST / GET /api/corrections (G21 P1-C): 401 anon, 400
// invalid body, 404 non-member, 403 member (only the owner files), 201 with
// the audit action `correction.filed`, 429 on the per-user limit, GET owner
// list. The service is mocked at its boundary (covered in
// lib/corrections/service.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertProjectAccess: vi.fn(),
  fileCorrection: vi.fn(),
  listProjectCorrections: vi.fn(),
  checkRateLimit: vi.fn(),
  auditAction: vi.fn(),
  auditNote: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/projects", () => {
  class ProjectAccessError extends Error {
    constructor(msg: string, public code: "not_found" | "forbidden" | "service_unavailable") {
      super(msg);
    }
  }
  return { ProjectAccessError, assertProjectAccess: (...a: unknown[]) => mocks.assertProjectAccess(...a) };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => mocks.checkRateLimit(...a) }));
vi.mock("@/lib/audit/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/context")>("@/lib/audit/context");
  return { ...actual, auditAction: (...a: unknown[]) => mocks.auditAction(...a), auditNote: (...a: unknown[]) => mocks.auditNote(...a) };
});
vi.mock("@/lib/corrections/service", () => ({
  fileCorrection: (...a: unknown[]) => mocks.fileCorrection(...a),
  listProjectCorrections: (...a: unknown[]) => mocks.listProjectCorrections(...a),
}));

import { GET, POST } from "./route";
import { ProjectAccessError } from "@/lib/projects";

const PID = "11111111-2222-4333-8444-555555555555";
const FOUNDER = { id: "u-1", email: "f@x.io", role: "user", plan: "founder_free" };
const ROW = { id: "c-1", project_id: PID, kind: "stale_data", target_ref: "dimension:tre", message: "MRR is A$12k.", proposed: {}, status: "open", submitted_by: "u-1", resolved_by: null, resolution: null, resolved_at: null, created_at: "2026-09-20", updated_at: "2026-09-20" };

function post(body: unknown) {
  return POST(new Request("http://localhost/api/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
}
function get(qs: string) {
  return GET(new Request(`http://localhost/api/corrections${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(FOUNDER);
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetIn: 1000 });
  mocks.assertProjectAccess.mockResolvedValue({ isOwner: true, role: "owner", ownerUserId: "u-1", project: { id: PID, name: "Acme" } });
  mocks.fileCorrection.mockResolvedValue({ ok: true, row: ROW, warnings: [] });
  mocks.listProjectCorrections.mockResolvedValue([ROW]);
});

describe("POST /api/corrections", () => {
  it("401 anonymous", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await post({ projectId: PID, kind: "stale_data", message: "x" });
    expect(res.status).toBe(401);
    expect(mocks.fileCorrection).not.toHaveBeenCalled();
  });

  it("429 when the per-user limit is hit, with Retry-After", async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetIn: 30_000 });
    const res = await post({ projectId: PID, kind: "stale_data", message: "x" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("corrections:file:u-1", 10, 3_600_000);
  });

  it("400 invalid JSON / invalid body (field named)", async () => {
    expect((await post("{not json")).status).toBe(400);
    const res = await post({ projectId: PID, kind: "nope", message: "x" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("kind");
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it("404 non-member · 403 accepted member (only the owner files)", async () => {
    mocks.assertProjectAccess.mockRejectedValueOnce(new ProjectAccessError("nf", "not_found"));
    expect((await post({ projectId: PID, kind: "stale_data", message: "x" })).status).toBe(404);
    mocks.assertProjectAccess.mockResolvedValueOnce({ isOwner: false, role: "editor", ownerUserId: "u-9", project: { id: PID, name: "Acme" } });
    const res = await post({ projectId: PID, kind: "stale_data", message: "x" });
    expect(res.status).toBe(403);
    expect(mocks.fileCorrection).not.toHaveBeenCalled();
  });

  it("201 owner: files with the parsed input + submitter, sets the correction.filed audit action", async () => {
    const res = await post({ projectId: PID, kind: "stale_data", targetRef: "dimension:tre", message: "  MRR is A$12k.  " });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.correction.id).toBe("c-1");
    expect(mocks.fileCorrection.mock.calls[0]![1]).toMatchObject({ projectId: PID, kind: "stale_data", targetRef: "dimension:tre", message: "MRR is A$12k.", submittedBy: "u-1", submitterEmail: "f@x.io", projectName: "Acme" });
    expect(mocks.auditAction).toHaveBeenCalledWith("correction.filed");
    expect(mocks.auditNote).toHaveBeenCalledWith("c-1", { project_id: PID, kind: "stale_data", target_ref: "dimension:tre" });
  });

  it("surfaces the service's too_many_open as 429", async () => {
    mocks.fileCorrection.mockResolvedValue({ ok: false, error: "too_many_open", message: "wait", status: 429 });
    const res = await post({ projectId: PID, kind: "stale_data", message: "x" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("too_many_open");
  });
});

describe("GET /api/corrections", () => {
  it("401 anon · 400 missing project · 403 member · 200 owner list keyed on the project", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await get(`?project=${PID}`)).status).toBe(401);
    expect((await get("")).status).toBe(400);
    mocks.assertProjectAccess.mockResolvedValueOnce({ isOwner: false, role: "viewer", ownerUserId: "u-9", project: { id: PID } });
    expect((await get(`?project=${PID}`)).status).toBe(403);
    const res = await get(`?project=${PID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.corrections).toHaveLength(1);
    expect(mocks.listProjectCorrections).toHaveBeenCalledWith(expect.anything(), PID);
  });
});
