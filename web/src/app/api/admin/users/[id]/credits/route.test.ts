// Colocated vitest for POST /api/admin/users/[id]/credits — P9 batch 1.
//
// Admin credit grant to a specific user by ID. Uses requireAdmin() gate
// and appendAudit(). Suite covers:
//   - 401 for unauthenticated (no_user)
//   - 403 for non-admin
//   - 400 on bad JSON
//   - 400 on invalid amount (zero, negative, NaN)
//   - 503 when DB not configured
//   - 404 when target user not found
//   - 500 when grantCredits fails
//   - happy path: ok + balance returned
//   - audit log is written on success
//   - audit log failure is non-fatal (still 200)

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  grantCredits: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/reseller/require-admin", () => ({
  requireAdmin: (user: unknown) => mocks.requireAdmin(user),
  AdminGateError: class AdminGateError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/credits", () => ({ grantCredits: (...args: unknown[]) => mocks.grantCredits(...args) }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...args: unknown[]) => mocks.appendAudit(...args) }));

import { POST } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const TARGET_USER = { id: "target-1", email: "target@example.com" };

function makeSb() {
  const userSelect = vi.fn().mockReturnValue({ data: TARGET_USER });
  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: userSelect,
        }),
      }),
    })),
    _userSelect: userSelect,
  };
}

function postReq(body: unknown, userId = "target-1", opts?: { badJson?: boolean }) {
  return new Request(`http://x/api/admin/users/${userId}/credits`, {
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
  mocks.requireAdmin.mockReturnValue(undefined); // passes
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.grantCredits.mockResolvedValue({ ok: true, balance: 200 });
  mocks.appendAudit.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/admin/users/[id]/credits", () => {
  it("returns 401 when no user (no_user AdminGateError)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await POST(postReq({ amount: 10, reason: "bonus" }), params());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("no_user");
  });

  it("returns 403 when user is not admin (not_admin AdminGateError)", async () => {
    const user = { id: "u-2", email: "user@example.com", plan: "free", role: "user" };
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("not_admin"); });
    const res = await POST(postReq({ amount: 10, reason: "bonus" }), params());
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_admin");
  });

  it("returns 400 on bad JSON", async () => {
    const res = await POST(postReq(null, "target-1", { badJson: true }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 400 when amount is zero", async () => {
    const res = await POST(postReq({ amount: 0, reason: "bonus" }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("amount_invalid");
  });

  it("returns 400 when amount is negative", async () => {
    const res = await POST(postReq({ amount: -5, reason: "bonus" }), params());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("amount_invalid");
  });

  it("returns 400 when amount is NaN string", async () => {
    const res = await POST(postReq({ amount: "abc", reason: "bonus" }), params());
    expect(res.status).toBe(400);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ amount: 10, reason: "bonus" }), params());
    expect(res.status).toBe(503);
  });

  it("returns 404 when target user not found", async () => {
    const sb = makeSb();
    sb._userSelect.mockReturnValue({ data: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(postReq({ amount: 10, reason: "bonus" }), params());
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("not_found");
  });

  it("returns 500 when grantCredits fails", async () => {
    mocks.grantCredits.mockResolvedValue({ ok: false });
    const res = await POST(postReq({ amount: 10, reason: "bonus" }), params());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("grant_failed");
  });

  it("happy path: returns ok + balance", async () => {
    const res = await POST(postReq({ amount: 50, reason: "referral bonus" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(200);
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      "target-1",
      50,
      "referral bonus",
      expect.objectContaining({ admin_action: true, granted_by_user_id: ADMIN_USER.id }),
    );
  });

  it("writes audit log on success", async () => {
    await POST(postReq({ amount: 10, reason: "test" }), params());
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.credits.granted" }),
    );
  });

  it("audit log failure does not fail the request", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("audit DB down"));
    const res = await POST(postReq({ amount: 10, reason: "test" }), params());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("merges caller metadata without overriding server fields", async () => {
    await POST(
      postReq({ amount: 10, reason: "test", metadata: { by: "affiliate_view", granted_by_user_id: "spoofed" } }),
      params(),
    );
    const call = mocks.grantCredits.mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    // Server wins over spoof attempt
    expect(meta.granted_by_user_id).toBe(ADMIN_USER.id);
    expect(meta.by).toBe("affiliate_view");
  });

  it("uses default reason when reason is omitted", async () => {
    await POST(postReq({ amount: 10 }), params());
    const call = mocks.grantCredits.mock.calls[0];
    expect(call[2]).toBe("admin_grant");
  });
});
