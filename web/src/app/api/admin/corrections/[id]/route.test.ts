// HTTP contract for PATCH /api/admin/corrections/[id] (G21 P1-C): the admin
// ladder (401 anon / 403 non-admin), 400 bad id / decision / missing reject
// resolution, 404 / 409 from the service, 200 with the audit action and the
// applied / change facts. Resolution itself is covered in
// lib/corrections/service.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveCorrection: vi.fn(),
  auditAction: vi.fn(),
  auditNote: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/audit/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/context")>("@/lib/audit/context");
  return { ...actual, auditAction: (...a: unknown[]) => mocks.auditAction(...a), auditNote: (...a: unknown[]) => mocks.auditNote(...a) };
});
vi.mock("@/lib/corrections/service", () => ({ resolveCorrection: (...a: unknown[]) => mocks.resolveCorrection(...a) }));

import { PATCH } from "./route";

const CID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin", plan: null };
const FOUNDER = { id: "u-9", email: "founder@x.io", role: "user", plan: "free" };
const ROW = { id: CID, project_id: "p-1", kind: "wrong_sector_stage", target_ref: "profile:sector", status: "accepted", resolution: "Accepted — industry → fintech written through the project update path (versioned, audit-logged)." };

function patch(id: string, body: unknown) {
  return PATCH(new Request(`http://localhost/api/admin/corrections/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ADMIN);
  mocks.resolveCorrection.mockResolvedValue({ ok: true, row: ROW, applied: true, change: { field: "industry", value: "fintech" }, warnings: [] });
});

describe("PATCH /api/admin/corrections/[id]", () => {
  it("401 anon · 403 non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await patch(CID, { decision: "accept" })).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValueOnce(FOUNDER);
    expect((await patch(CID, { decision: "accept" })).status).toBe(403);
    expect(mocks.resolveCorrection).not.toHaveBeenCalled();
  });

  it("400 bad id / bad decision / reject without a resolution / bad JSON", async () => {
    expect((await patch("nope", { decision: "accept" })).status).toBe(400);
    expect((await patch(CID, { decision: "maybe" })).status).toBe(400);
    expect((await patch(CID, { decision: "reject" })).status).toBe(400);
    expect((await patch(CID, "{oops")).status).toBe(400);
    expect(mocks.resolveCorrection).not.toHaveBeenCalled();
  });

  it("200 accept: passes the admin id + note, sets correction.accepted, returns applied + change", async () => {
    const res = await patch(CID, { decision: "accept", resolution: "  Confirmed with ABR.  " });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, applied: true, change: { field: "industry", value: "fintech" } });
    expect(mocks.resolveCorrection).toHaveBeenCalledWith(expect.anything(), { id: CID, decision: "accept", note: "Confirmed with ABR.", adminId: "admin-1" });
    expect(mocks.auditAction).toHaveBeenCalledWith("correction.accepted");
    expect(mocks.auditNote).toHaveBeenCalledWith(CID, expect.objectContaining({ project_id: "p-1", applied: true, change_field: "industry" }));
  });

  it("200 reject with a resolution sets correction.rejected", async () => {
    mocks.resolveCorrection.mockResolvedValue({ ok: true, row: { ...ROW, status: "rejected", resolution: "No." }, applied: false, change: null, warnings: [] });
    const res = await patch(CID, { decision: "reject", resolution: "No." });
    expect(res.status).toBe(200);
    expect(mocks.auditAction).toHaveBeenCalledWith("correction.rejected");
  });

  it("404 / 409 from the service are passed through", async () => {
    mocks.resolveCorrection.mockResolvedValueOnce({ ok: false, error: "not_found", message: "x", status: 404 });
    expect((await patch(CID, { decision: "accept" })).status).toBe(404);
    mocks.resolveCorrection.mockResolvedValueOnce({ ok: false, error: "not_open", message: "x", status: 409 });
    expect((await patch(CID, { decision: "accept" })).status).toBe(409);
    // concurrent resolve: the conditioned UPDATE matched zero rows
    mocks.resolveCorrection.mockResolvedValueOnce({ ok: false, error: "already_resolved", message: "Another reviewer resolved this correction first.", status: 409 });
    const race = await patch(CID, { decision: "accept" });
    expect(race.status).toBe(409);
    expect(await race.json()).toMatchObject({ ok: false, error: "already_resolved" });
    expect(mocks.auditAction).not.toHaveBeenCalledWith("correction.accepted");
  });
});
