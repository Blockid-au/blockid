// Colocated vitest for PATCH /api/admin/evidence/[id]/review — G14-S36.
// Admin gate (401 anonymous / 403 non-admin), body validation, and the
// decision delegated to lib/evidence/review (mocked here — its own suite
// pins the arithmetic).

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user, ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

const applyMock = vi.fn();
vi.mock("@/lib/evidence/review", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evidence/review")>("@/lib/evidence/review");
  return { ...actual, applyEvidenceReview: (...a: unknown[]) => applyMock(...a) };
});

import { PATCH } from "./route";

const ID = "6f1c2b3a-1b2c-4d5e-8f90-abcdef123456";

function call(body: unknown, id = ID) {
  return PATCH(
    new Request(`http://x/api/admin/evidence/${id}/review`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  auth.user = { id: "admin-1", email: "admin@blockid.au", role: "admin" };
  applyMock.mockReset().mockResolvedValue({ ok: true, row: { id: ID, project_id: "p", dimension: "lco", evidence_type: "abn_registration", confidence_level: "third_party_verified", review_status: "approved" }, linked: null });
});

describe("PATCH /api/admin/evidence/[id]/review — gate", () => {
  it("401 anonymous, 403 for a signed-in non-admin, nothing applied", async () => {
    auth.user = null;
    expect((await call({ decision: "approve" })).status).toBe(401);
    auth.user = { id: "u", email: "founder@x.co", role: "user" };
    expect((await call({ decision: "approve" })).status).toBe(403);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/evidence/[id]/review — body", () => {
  it("400 on a bad id, a bad decision, a reject without a note", async () => {
    expect((await call({ decision: "approve" }, "not-a-uuid")).status).toBe(400);
    expect((await call({ decision: "verify" })).status).toBe(400);
    expect((await call({ decision: "reject" })).status).toBe(400);
    expect((await call({ decision: "reject", note: "   " })).status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("approve → applyEvidenceReview with the admin as reviewer; admin approve → is_verified row echoed", async () => {
    const res = await call({ decision: "approve", note: "ASIC extract matches" });
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evidenceId: ID, decision: "approve", reviewerUserId: "admin-1", note: "ASIC extract matches" }));
    expect(await res.json()).toMatchObject({ ok: true, decision: "approve", row: { confidence_level: "third_party_verified", review_status: "approved" } });
  });

  it("maps not_found → 404, not_pending → 409, db_error → 500", async () => {
    applyMock.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await call({ decision: "approve" })).status).toBe(404);
    applyMock.mockResolvedValueOnce({ ok: false, error: "not_pending" });
    expect((await call({ decision: "approve" })).status).toBe(409);
    applyMock.mockResolvedValueOnce({ ok: false, error: "db_error" });
    expect((await call({ decision: "reject", note: "x" })).status).toBe(500);
  });
});
