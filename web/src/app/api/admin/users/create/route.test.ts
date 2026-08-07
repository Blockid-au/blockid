// Colocated vitest for POST /api/admin/users/create — P9 batch 3.
//
// Admin mints a new user with optional credits + magic-link invite. Idempotency
// guarded by email uniqueness. Suite covers:
//   - 401 unauthenticated
//   - 403 non-admin
//   - 400 bad JSON
//   - 400 invalid body (validateCreateUserBody fails)
//   - 503 DB not configured
//   - 409 email already taken
//   - 500 on DB insert failure
//   - credits granted when credits > 0
//   - no credits when credits === 0
//   - magic-link issued
//   - audit log written
//   - audit log failure is non-fatal
//   - happy path: returns user + credits_granted + magic_link_issued

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  requestMagicLink: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  appendAudit: vi.fn(),
  grantCredits: vi.fn(),
  validateCreateUserBody: vi.fn(),
  buildAppUsersInsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  requestMagicLink: (args: unknown) => mocks.requestMagicLink(args),
}));
vi.mock("@/lib/reseller/require-admin", () => ({
  requireAdmin: (user: unknown) => mocks.requireAdmin(user),
  AdminGateError: class AdminGateError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => mocks.appendAudit(...a) }));
vi.mock("@/lib/credits", () => ({ grantCredits: (...a: unknown[]) => mocks.grantCredits(...a) }));
vi.mock("@/lib/admin/user-create", () => ({
  validateCreateUserBody: (raw: unknown) => mocks.validateCreateUserBody(raw),
  buildAppUsersInsert: (body: unknown) => mocks.buildAppUsersInsert(body),
}));

import { POST } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const VALID_BODY = {
  email: "newuser@example.com",
  segment: "founder",
  account_type: "founder",
  plan: "free",
  credits: 0,
};
const CREATED_USER = { id: "new-user-1", email: "newuser@example.com", role: "user", plan: "free" };

function makeSb(opts?: {
  existing?: { id: string; email: string } | null;
  created?: typeof CREATED_USER | null;
  insertError?: unknown;
}) {
  const existingResult = { data: opts?.existing !== undefined ? opts.existing : null };
  const singleResult = opts?.insertError
    ? { data: null, error: opts.insertError }
    : { data: opts?.created !== undefined ? opts.created : CREATED_USER, error: null };

  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockReturnValue(existingResult),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: vi.fn().mockReturnValue(singleResult),
        }),
      }),
    })),
  };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/admin/users/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.requireAdmin.mockReturnValue(undefined);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.appendAudit.mockResolvedValue(undefined);
  mocks.grantCredits.mockResolvedValue({ ok: true, balance: 10 });
  mocks.requestMagicLink.mockResolvedValue({ ok: true });
  mocks.validateCreateUserBody.mockReturnValue({ ok: true, value: VALID_BODY });
  mocks.buildAppUsersInsert.mockReturnValue({ email: "newuser@example.com", plan: "free", role: "user", segment: "founder" });
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/admin/users/create", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("not_admin"); });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 400 when validateCreateUserBody fails", async () => {
    mocks.validateCreateUserBody.mockReturnValue({
      ok: false,
      reason: "email_required",
    });
    const res = await POST(req({ segment: "founder" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("email_required");
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(503);
  });

  it("returns 409 when email already taken", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ existing: { id: "old-1", email: "newuser@example.com" } }));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.reason).toBe("email_taken");
    expect(body.user_id).toBe("old-1");
  });

  it("returns 500 on DB insert failure", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ insertError: { message: "insert failed" } }));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("insert_failed");
  });

  it("grants credits when credits > 0", async () => {
    mocks.validateCreateUserBody.mockReturnValue({ ok: true, value: { ...VALID_BODY, credits: 50 } });
    await POST(req({ ...VALID_BODY, credits: 50 }));
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      CREATED_USER.id,
      50,
      "admin_grant",
      expect.objectContaining({ admin_action: true }),
    );
  });

  it("does NOT grant credits when credits === 0", async () => {
    mocks.validateCreateUserBody.mockReturnValue({ ok: true, value: { ...VALID_BODY, credits: 0 } });
    await POST(req(VALID_BODY));
    expect(mocks.grantCredits).not.toHaveBeenCalled();
  });

  it("issues magic-link invite", async () => {
    await POST(req(VALID_BODY));
    expect(mocks.requestMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: VALID_BODY.email, intent: "login" }),
    );
  });

  it("writes audit log on success", async () => {
    await POST(req(VALID_BODY));
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.user.created" }),
    );
  });

  it("audit log failure is non-fatal", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("audit db down"));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("happy path: returns ok + user + credits_granted + magic_link_issued", async () => {
    mocks.validateCreateUserBody.mockReturnValue({ ok: true, value: { ...VALID_BODY, credits: 10 } });
    mocks.grantCredits.mockResolvedValue({ ok: true, balance: 10 });
    const res = await POST(req({ ...VALID_BODY, credits: 10 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.credits_granted).toBe(10);
    expect(body.magic_link_issued).toBe(true);
  });
});
