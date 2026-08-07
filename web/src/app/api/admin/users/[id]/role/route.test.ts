// Colocated vitest for POST /api/admin/users/[id]/role — P9 batch 3.
//
// Admin role change for a user. Self-demotion is blocked. Suite covers:
//   - 401 unauthenticated
//   - 403 non-admin
//   - 400 self-role-change blocked
//   - 400 bad JSON
//   - 400 invalid role value
//   - 503 DB not configured
//   - 404 user not found
//   - 200 unchanged when role already matches
//   - 500 on DB update error
//   - happy path: updates role + returns ok
//   - audit log is written on role change
//   - audit log failure is non-fatal

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/reseller/require-admin", () => ({
  requireAdmin: (user: unknown) => mocks.requireAdmin(user),
  AdminGateError: class AdminGateError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => mocks.appendAudit(...a) }));

import { POST } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const TARGET_USER = { id: "target-1", email: "target@example.com", role: "user" };

function makeSb(opts?: {
  target?: typeof TARGET_USER | null;
  updateError?: unknown;
}) {
  const maybeSingle = vi.fn().mockReturnValue({
    data: opts?.target !== undefined ? opts.target : TARGET_USER,
  });
  const updateEq = vi.fn().mockReturnValue({ error: opts?.updateError ?? null });

  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
      update: () => ({
        eq: updateEq,
      }),
    })),
    _maybeSingle: maybeSingle,
    _updateEq: updateEq,
  };
}

function postReq(body: unknown, userId = "target-1", opts?: { badJson?: boolean }) {
  return new Request(`http://x/api/admin/users/${userId}/role`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function params(id = "target-1") {
  return { params: Promise.resolve({ id }) };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.requireAdmin.mockReturnValue(undefined);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.appendAudit.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/admin/users/[id]/role", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("not_admin"); });
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change own role", async () => {
    const res = await POST(postReq({ role: "user" }, "admin-1"), params("admin-1"));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("cannot_change_own_role");
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(postReq(null, "target-1", { badJson: true }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 400 when role is invalid", async () => {
    const res = await POST(postReq({ role: "superuser" }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("role_invalid");
  });

  it("returns 400 when role is missing", async () => {
    const res = await POST(postReq({}), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("role_invalid");
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(503);
  });

  it("returns 404 when user not found", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ target: null }));
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("not_found");
  });

  it("returns 200 unchanged when role already matches", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ target: { ...TARGET_USER, role: "admin" } }));
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.unchanged).toBe(true);
  });

  it("returns 500 on DB update error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ updateError: { message: "update failed" } }));
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("update_failed");
  });

  it("happy path: updates role and returns ok", async () => {
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.role).toBe("admin");
  });

  it("writes audit log on role change", async () => {
    await POST(postReq({ role: "admin" }), params());
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.role.changed" }),
    );
  });

  it("audit log failure is non-fatal (still 200)", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("audit db down"));
    const res = await POST(postReq({ role: "admin" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
