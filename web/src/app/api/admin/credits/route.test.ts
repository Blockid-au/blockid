// Colocated vitest for GET+POST /api/admin/credits — P9 batch 1.
//
// Admin-only route that grants/revokes credits. A bypass here could let
// non-admins inflate balances. Suite covers:
//   - POST 403 for non-admin user
//   - POST 403 for unauthenticated
//   - POST 400 on bad JSON
//   - POST 400 on missing fields
//   - POST 503 when DB not configured
//   - POST 404 when target user not found
//   - POST grant happy path
//   - POST revoke happy path
//   - POST 400 on unknown action
//   - GET 403 for non-admin
//   - GET 503 when DB not configured
//   - GET returns user list with credit balances

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  grantCredits: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/credits", () => ({ grantCredits: (...args: unknown[]) => mocks.grantCredits(...args) }));

import { POST, GET } from "./route";

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const REGULAR_USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };
const TARGET_USER = { id: "target-1", email: "target@example.com", display_name: "Target", plan: "free", role: "user" };

function makeSb() {
  const appUsersSelect = vi.fn().mockReturnValue({ data: TARGET_USER });
  const creditBalanceSelect = vi.fn().mockReturnValue({ data: { balance: 100 } });
  const creditBalanceUpsert = vi.fn().mockReturnValue({});
  const creditTransactionInsert = vi.fn().mockReturnValue({});
  const listUsersSelect = vi.fn().mockReturnValue({
    data: [ADMIN_USER, REGULAR_USER],
  });
  const balancesInSelect = vi.fn().mockReturnValue({
    data: [{ user_id: "admin-1", balance: 50, lifetime_earned: 100, lifetime_spent: 50 }],
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "app_users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: appUsersSelect,
            }),
            order: () => ({
              limit: () => listUsersSelect(),
            }),
          }),
        };
      }
      if (table === "credit_balances") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: creditBalanceSelect,
            }),
            in: () => balancesInSelect(),
          }),
          upsert: creditBalanceUpsert,
        };
      }
      if (table === "credit_transactions") {
        return { insert: creditTransactionInsert };
      }
      return {};
    }),
    _appUsersSelect: appUsersSelect,
    _creditBalanceSelect: creditBalanceSelect,
    _creditBalanceUpsert: creditBalanceUpsert,
    _creditTransactionInsert: creditTransactionInsert,
  };
}

function postReq(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/admin/credits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function getReq() {
  return new Request("http://x/api/admin/credits", { method: "GET" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.grantCredits.mockResolvedValue({ ok: true, balance: 150 });
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/admin/credits", () => {
  it("returns 403 when user is not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await POST(postReq({ email: "target@example.com", amount: 10, reason: "test", action: "grant" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 403 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ email: "target@example.com", amount: 10, reason: "test", action: "grant" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(postReq({ email: "target@example.com" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ email: "target@example.com", amount: 10, reason: "test", action: "grant" }));
    expect(res.status).toBe(503);
  });

  it("returns 404 when target user not found", async () => {
    const sb = makeSb();
    sb._appUsersSelect.mockReturnValue({ data: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(postReq({ email: "nobody@example.com", amount: 10, reason: "test", action: "grant" }));
    expect(res.status).toBe(404);
  });

  it("grant action: returns ok + balance", async () => {
    const res = await POST(postReq({ email: "target@example.com", amount: 10, reason: "bonus", action: "grant" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(150);
    expect(mocks.grantCredits).toHaveBeenCalledWith("target-1", 10, "bonus", expect.objectContaining({ admin_action: true }));
  });

  it("revoke action: returns ok + new balance", async () => {
    const sb = makeSb();
    sb._creditBalanceSelect.mockReturnValue({ data: { balance: 100 } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(postReq({ email: "target@example.com", amount: 30, reason: "penalty", action: "revoke" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(70); // 100 - 30
  });

  it("revoke never goes below zero", async () => {
    const sb = makeSb();
    sb._creditBalanceSelect.mockReturnValue({ data: { balance: 5 } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(postReq({ email: "target@example.com", amount: 100, reason: "penalty", action: "revoke" }));
    const body = await json(res);
    expect(body.balance).toBe(0);
  });

  it("returns 400 on unknown action", async () => {
    const res = await POST(postReq({ email: "target@example.com", amount: 10, reason: "test", action: "delete" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });
});

describe("GET /api/admin/credits", () => {
  it("returns 403 when user is not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns user list with credit info", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);
  });
});
