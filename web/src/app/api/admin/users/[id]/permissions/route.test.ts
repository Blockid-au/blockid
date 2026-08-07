// Colocated vitest for POST /api/admin/users/[id]/permissions — P9 batch 3.
//
// Admin permission grant/revoke. Self-mutation blocked. Audit trail. Suite covers:
//   - 401 unauthenticated
//   - 403 non-admin
//   - 400 self-permission-change blocked
//   - 400 bad JSON
//   - 400 invalid body (validatePermissionBody fails)
//   - 503 DB not configured
//   - 404 user not found
//   - 200 unchanged when no mutation needed
//   - 500 on DB update error
//   - happy path grant: returns permissions array
//   - happy path revoke: returns updated permissions
//   - audit log on grant
//   - audit log failure is non-fatal

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  appendAudit: vi.fn(),
  validatePermissionBody: vi.fn(),
  applyPermissionMutation: vi.fn(),
  normalisePermissionsColumn: vi.fn(),
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
vi.mock("@/lib/admin/permissions-mutation", () => ({
  validatePermissionBody: (raw: unknown) => mocks.validatePermissionBody(raw),
  applyPermissionMutation: (...a: unknown[]) => mocks.applyPermissionMutation(...a),
  normalisePermissionsColumn: (p: unknown) => mocks.normalisePermissionsColumn(p),
}));

import { POST } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const TARGET_USER = { id: "target-1", email: "target@example.com", permissions: ["reports.view"] };

function makeSb(opts?: { target?: typeof TARGET_USER | null; updateError?: unknown }) {
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
  };
}

function postReq(body: unknown, userId = "target-1", opts?: { badJson?: boolean }) {
  return new Request(`http://x/api/admin/users/${userId}/permissions`, {
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
  mocks.validatePermissionBody.mockReturnValue({
    ok: true,
    value: { action: "grant", permission: "reports.export" },
  });
  mocks.normalisePermissionsColumn.mockReturnValue(["reports.view"]);
  mocks.applyPermissionMutation.mockReturnValue({
    changed: true,
    next: ["reports.view", "reports.export"],
    was_known: true,
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/admin/users/[id]/permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("not_admin"); });
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change own permissions", async () => {
    const res = await POST(
      postReq({ action: "grant", permission: "reports.export" }, "admin-1"),
      params("admin-1"),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("cannot_change_own_permissions");
  });

  it("returns 400 on bad JSON", async () => {
    const res = await POST(postReq(null, "target-1", { badJson: true }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 400 when validatePermissionBody fails", async () => {
    mocks.validatePermissionBody.mockReturnValue({
      ok: false,
      reason: "permission_invalid_slug",
    });
    const res = await POST(postReq({ action: "grant", permission: "BAD PERM" }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("permission_invalid_slug");
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(503);
  });

  it("returns 404 when user not found", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ target: null }));
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("not_found");
  });

  it("returns 200 unchanged when no mutation needed", async () => {
    mocks.applyPermissionMutation.mockReturnValue({
      changed: false,
      next: ["reports.view"],
      was_known: true,
    });
    const res = await POST(postReq({ action: "grant", permission: "reports.view" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.unchanged).toBe(true);
  });

  it("returns 500 on DB update error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ updateError: { message: "update failed" } }));
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("update_failed");
  });

  it("happy path grant: returns ok + permissions array", async () => {
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("grant");
    expect(body.permission).toBe("reports.export");
    expect(Array.isArray(body.permissions)).toBe(true);
  });

  it("writes audit log with correct action for grant", async () => {
    await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.permissions.granted" }),
    );
  });

  it("writes audit log with revoked action for revoke", async () => {
    mocks.validatePermissionBody.mockReturnValue({
      ok: true,
      value: { action: "revoke", permission: "reports.view" },
    });
    await POST(postReq({ action: "revoke", permission: "reports.view" }), params());
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.permissions.revoked" }),
    );
  });

  it("audit log failure is non-fatal", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("audit db down"));
    const res = await POST(postReq({ action: "grant", permission: "reports.export" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
