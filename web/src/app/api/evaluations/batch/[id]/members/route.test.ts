// Route tests for GET | POST | DELETE /api/evaluations/batch/[id]/members
// (G21 P2-B). Pins: 401 anonymous; assertBatchRole minRole "viewer" for GET
// / "owner" for POST + DELETE; POST invalid-body 400s (bad e-mail, unknown
// role, unknown key); role defaults to "reviewer"; addBatchMember's
// siteBase comes from NEXT_PUBLIC_SITE_URL when set, else the request
// origin; addBatchMember's error union maps to 404 (unknown_email, with a
// "sign up" hint) / 400 (invalid_email, self) / 503 / 500; removeBatchMember
// rejects a non-uuid user_id and maps creator -> 400 / unavailable -> 503;
// POST + DELETE are audited, GET is not.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const assertBatchRoleMock = vi.fn();
const listBatchMembersMock = vi.fn();
const addBatchMemberMock = vi.fn();
const removeBatchMemberMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/batch-members")>()),
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
  listBatchMembers: (batch: unknown) => listBatchMembersMock(batch),
  addBatchMember: (i: unknown) => addBatchMemberMock(i),
  removeBatchMember: (i: unknown) => removeBatchMemberMock(i),
}));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { DELETE, GET, INVITES_PER_HOUR, POST } from "./route";

const USER = { id: "u-1", email: "owner@accel.au", plan: "investor_vc_small", displayName: "Prog Owner" };
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4", rubricWeights: {}, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };
const VIEWER_ACCESS = { ok: true as const, batch: BATCH, role: "viewer" as const, isCreator: false };
const OWNER_ACCESS = { ok: true as const, batch: BATCH, role: "owner" as const, isCreator: true };

const MEMBER = { userId: "u-2", role: "reviewer" as const, email: "reviewer@accel.au", displayName: "Rev Name", invitedBy: "u-1", createdAt: "2026-09-11T00:00:00Z", isCreator: false };
const TARGET_UUID = "22222222-2222-4222-a222-222222222222";

const ctx = (id = "b-1") => ({ params: Promise.resolve({ id }) });
function getReq(id = "b-1"): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/members`);
}
function postReq(body: unknown, id = "b-1"): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function deleteReq(body: unknown, id = "b-1"): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue(OWNER_ACCESS);
  listBatchMembersMock.mockResolvedValue({ members: [MEMBER], available: true });
  addBatchMemberMock.mockResolvedValue({ ok: true, member: MEMBER, emailSent: true, already: false });
  removeBatchMemberMock.mockResolvedValue({ ok: true, removed: true });
});

describe("module exports", () => {
  it("INVITES_PER_HOUR is 20; GET is not audited; POST + DELETE are", () => {
    expect(INVITES_PER_HOUR).toBe(20);
    expect(isAuditedHandler(GET)).toBe(false);
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(DELETE)).toBe(true);
  });
});

describe("GET /api/evaluations/batch/[id]/members", () => {
  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole with minRole 'viewer' and 404s a non-member", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "u-1", "viewer");
  });

  it("200s with { ok, available, role, members[] } mapped from listBatchMembers", async () => {
    assertBatchRoleMock.mockResolvedValue(VIEWER_ACCESS);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      available: true,
      role: "viewer",
      members: [{ user_id: "u-2", role: "reviewer", email: "reviewer@accel.au", display_name: "Rev Name", is_creator: false, created_at: "2026-09-11T00:00:00Z" }],
    });
    expect(listBatchMembersMock).toHaveBeenCalledWith(BATCH);
  });
});

describe("POST /api/evaluations/batch/[id]/members", () => {
  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ email: "x@y.com" }), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole with minRole 'owner'; 403s a reviewer seat", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = await POST(postReq({ email: "new@accel.au" }), ctx());
    expect(res.status).toBe(403);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "u-1", "owner");
    expect(addBatchMemberMock).not.toHaveBeenCalled();
  });

  it("400s a bad e-mail", async () => {
    const res = await POST(postReq({ email: "x" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
    expect(addBatchMemberMock).not.toHaveBeenCalled();
  });

  it("400s an unknown role", async () => {
    const res = await POST(postReq({ email: "new@accel.au", role: "admin" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
  });

  it("400s an unknown key", async () => {
    const res = await POST(postReq({ email: "new@accel.au", role: "reviewer", extra: 1 }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
  });

  it("role defaults to 'reviewer' when omitted", async () => {
    await POST(postReq({ email: "new@accel.au" }), ctx());
    expect(addBatchMemberMock).toHaveBeenCalledWith(expect.objectContaining({ role: "reviewer" }));
  });

  it("calls addBatchMember with batch + inviter + email + role + siteBase (from the request origin by default)", async () => {
    await POST(postReq({ email: "new@accel.au", role: "viewer" }), ctx());
    expect(addBatchMemberMock).toHaveBeenCalledWith({
      batch: BATCH,
      inviter: { id: "u-1", email: "owner@accel.au", displayName: "Prog Owner" },
      email: "new@accel.au",
      role: "viewer",
      siteBase: "http://localhost",
    });
  });

  it("uses NEXT_PUBLIC_SITE_URL for siteBase when set, trimming a trailing slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    await POST(postReq({ email: "new@accel.au" }), ctx());
    expect(addBatchMemberMock).toHaveBeenCalledWith(expect.objectContaining({ siteBase: "https://blockid.au" }));
  });

  it("201s with { ok, member, email_sent, already:false } on a new invite", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: true, member: MEMBER, emailSent: true, already: false });
    const res = await POST(postReq({ email: "new@accel.au" }), ctx());
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({
      ok: true,
      member: { user_id: "u-2", role: "reviewer", email: "reviewer@accel.au", display_name: "Rev Name", is_creator: false, created_at: "2026-09-11T00:00:00Z" },
      email_sent: true,
      already: false,
    });
  });

  it("200s (not 201) when already:true", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: true, member: MEMBER, emailSent: false, already: true });
    const res = await POST(postReq({ email: "new@accel.au" }), ctx());
    expect(res.status).toBe(200);
    expect((await json(res)).already).toBe(true);
  });

  it("maps addBatchMember's error union: unknown_email -> 404 with a sign-up hint", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: false, error: "unknown_email", message: "No BlockID account with that e-mail yet — ask them to sign up at /signup first, then invite again." });
    const res = await POST(postReq({ email: "ghost@accel.au" }), ctx());
    expect(res.status).toBe(404);
    expect((await json(res)).message as string).toContain("sign up");
  });

  it("maps invalid_email / self -> 400", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: false, error: "invalid_email", message: "bad" });
    const invalid = await POST(postReq({ email: "ghost@accel.au" }), ctx());
    expect(invalid.status).toBe(400);

    addBatchMemberMock.mockResolvedValue({ ok: false, error: "self", message: "self" });
    const self = await POST(postReq({ email: "ghost@accel.au" }), ctx());
    expect(self.status).toBe(400);
  });

  it("maps unavailable -> 503", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: false, error: "unavailable", message: "not yet" });
    const res = await POST(postReq({ email: "ghost@accel.au" }), ctx());
    expect(res.status).toBe(503);
  });

  it("maps db_error -> 500", async () => {
    addBatchMemberMock.mockResolvedValue({ ok: false, error: "db_error", message: "boom" });
    const res = await POST(postReq({ email: "ghost@accel.au" }), ctx());
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/evaluations/batch/[id]/members", () => {
  it("401s an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("calls assertBatchRole with minRole 'owner'; 403s a reviewer seat", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(res.status).toBe(403);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-1", "u-1", "owner");
    expect(removeBatchMemberMock).not.toHaveBeenCalled();
  });

  it("400s a non-uuid user_id", async () => {
    const res = await DELETE(deleteReq({ user_id: "not-a-uuid" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_body");
    expect(removeBatchMemberMock).not.toHaveBeenCalled();
  });

  it("calls removeBatchMember with { batch, actorId, userId }", async () => {
    await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(removeBatchMemberMock).toHaveBeenCalledWith({ batch: BATCH, actorId: "u-1", userId: TARGET_UUID });
  });

  it("200s with { ok, removed }", async () => {
    removeBatchMemberMock.mockResolvedValue({ ok: true, removed: true });
    const res = await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, removed: true });
  });

  it("maps creator -> 400", async () => {
    removeBatchMemberMock.mockResolvedValue({ ok: false, error: "creator", message: "The cohort owner cannot be removed" });
    const res = await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(res.status).toBe(400);
  });

  it("maps unavailable -> 503", async () => {
    removeBatchMemberMock.mockResolvedValue({ ok: false, error: "unavailable", message: "not yet" });
    const res = await DELETE(deleteReq({ user_id: TARGET_UUID }), ctx());
    expect(res.status).toBe(503);
  });
});
