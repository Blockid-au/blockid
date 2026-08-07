// Colocated vitest for POST /api/mentor/access-request — P9 batch.
//
// Mentor requests founder consent to reveal identified profile fields. The
// route composes auth + reseller scope + reveal-guard + admin-DB insert +
// reseller audit-log; every branch is asserted here in isolation from the
// underlying modules so the auth-gate ordering + audit-on-success contract
// stays regression-guarded.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  scopedReseller: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resellerSupabase: vi.fn(),
  decideReveal: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/reseller/scope", () => ({
  scopedReseller: (u: unknown) => mocks.scopedReseller(u),
  ResellerScopeError: class ResellerScopeError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (s: unknown) => mocks.resellerSupabase(s),
}));
vi.mock("@/lib/reseller/customer-reveal", () => ({
  decideReveal: (id: unknown, allowed: string[]) => mocks.decideReveal(id, allowed),
}));

import { POST } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

const MENTOR_USER = { id: "mentor-1", email: "mentor@example.com", plan: "reseller", role: "user" };
const CUST_UUID = "11111111-2222-3333-4444-555555555555";

function makeScope() {
  return {
    reseller_id: "res-1",
    role: "owner",
    allowedCustomerIds: vi.fn().mockResolvedValue([CUST_UUID]),
  };
}

function makeInsertedRow(overrides?: Record<string, unknown>) {
  return {
    id: "grant-1",
    status: "pending",
    requested_tier: "identified",
    requested_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeSupabase(opts?: { insertError?: { message: string } | null; insertRow?: unknown }) {
  const singleFn = vi.fn().mockResolvedValue({
    data: opts && "insertRow" in opts ? opts.insertRow : makeInsertedRow(),
    error: opts?.insertError ?? null,
  });
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const insertFn = vi.fn().mockReturnValue({ select: selectFn });
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn });
  return {
    _client: { from: fromFn },
    _fromFn: fromFn,
    _insertFn: insertFn,
    _selectFn: selectFn,
    _singleFn: singleFn,
  };
}

function req(
  body: unknown,
  opts?: { badJson?: boolean; headers?: Record<string, string> },
) {
  return new Request("http://x/api/mentor/access-request", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(MENTOR_USER);
  mocks.scopedReseller.mockResolvedValue(makeScope());
  mocks.decideReveal.mockReturnValue({ ok: true, customerId: CUST_UUID });
  const auditLog = vi.fn().mockResolvedValue(undefined);
  mocks.resellerSupabase.mockReturnValue({ auditLog });
  const supa = makeSupabase();
  mocks.getSupabaseAdmin.mockReturnValue(supa._client);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/mentor/access-request", () => {
  it("returns 401 when no user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("unauthorised");
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
  });

  it("returns 403 on ResellerScopeError with err.code as reason", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_reseller");
  });

  it("rethrows non-ResellerScopeError from scopedReseller", async () => {
    const boom = new Error("kaboom");
    mocks.scopedReseller.mockRejectedValue(boom);
    await expect(POST(req({ subject_user_id: CUST_UUID }))).rejects.toThrow("kaboom");
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 403 when reveal target not_in_scope", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "not_in_scope" });
    const res = await POST(req({ subject_user_id: "outsider" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_in_scope");
  });

  it("returns 400 when reveal target missing_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "missing_id" });
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("missing_id");
  });

  it("returns 400 when reveal target invalid_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "invalid_id" });
    const res = await POST(req({ subject_user_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_id");
  });

  it("returns 400 invalid_tier when requested_tier is unknown string", async () => {
    const res = await POST(
      req({ subject_user_id: CUST_UUID, requested_tier: "root" }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_tier");
  });

  it("accepts requested_tier=pseudonymous", async () => {
    const supa = makeSupabase({ insertRow: makeInsertedRow({ requested_tier: "pseudonymous" }) });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(
      req({ subject_user_id: CUST_UUID, requested_tier: "pseudonymous" }),
    );
    expect(res.status).toBe(200);
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.requested_tier).toBe("pseudonymous");
  });

  it("defaults requested_tier to 'identified' when body omits it", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ subject_user_id: CUST_UUID }));
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.requested_tier).toBe("identified");
  });

  it("defaults requested_tier to 'identified' when body sends non-string", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ subject_user_id: CUST_UUID, requested_tier: 42 }));
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.requested_tier).toBe("identified");
  });

  it("returns 503 when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("not_configured");
  });

  it("returns 500 insert_failed when supabase insert errors", async () => {
    const supa = makeSupabase({ insertError: { message: "db down" }, insertRow: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("insert_failed");
    expect(body.error).toBe("db down");
  });

  it("returns 500 insert_failed when insert returns no row + no error", async () => {
    const supa = makeSupabase({ insertRow: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("insert_failed");
    expect(body.error).toBe("no_row");
  });

  it("returns 500 audit_failed when auditLog throws", async () => {
    const auditLog = vi.fn().mockRejectedValue(new Error("audit down"));
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("audit_failed");
    expect(body.error).toBe("audit down");
  });

  it("stamps mentor_access_grants row with mentor + subject + reseller ids and status=pending", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ subject_user_id: CUST_UUID, requested_tier: "identified", reason: "review" }));
    expect(supa._fromFn).toHaveBeenCalledWith("mentor_access_grants");
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.mentor_user_id).toBe(MENTOR_USER.id);
    expect(insertArg.subject_user_id).toBe(CUST_UUID);
    expect(insertArg.reseller_id).toBe("res-1");
    expect(insertArg.status).toBe("pending");
    expect(insertArg.reason).toBe("review");
    expect(typeof insertArg.requested_at).toBe("string");
    // ISO8601 shape guard
    expect(insertArg.requested_at as string).toMatch(/T.*Z$/);
  });

  it("truncates reason to 500 characters", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const long = "x".repeat(1200);
    await POST(req({ subject_user_id: CUST_UUID, reason: long }));
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((insertArg.reason as string).length).toBe(500);
  });

  it("stores reason=null when body reason is not a string", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ subject_user_id: CUST_UUID, reason: { note: "structured" } }));
    const insertArg = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg.reason).toBeNull();
  });

  it("passes allowedCustomerIds output straight into decideReveal", async () => {
    const scope = makeScope();
    scope.allowedCustomerIds = vi.fn().mockResolvedValue(["a", "b", CUST_UUID]);
    mocks.scopedReseller.mockResolvedValue(scope);
    await POST(req({ subject_user_id: CUST_UUID }));
    expect(mocks.decideReveal).toHaveBeenCalledWith(CUST_UUID, ["a", "b", CUST_UUID]);
  });

  it("select projection is 'id, status, requested_tier, requested_at'", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ subject_user_id: CUST_UUID }));
    expect(supa._selectFn).toHaveBeenCalledWith("id, status, requested_tier, requested_at");
  });

  it("audit-log payload carries action='mentor_access_request' + grant_id + requested_tier metadata", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const supa = makeSupabase({ insertRow: makeInsertedRow({ id: "grant-42" }) });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req(
        { subject_user_id: CUST_UUID, requested_tier: "pseudonymous", reason: "review" },
        { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "TestAgent/1.0" } },
      ),
    );
    expect(auditLog).toHaveBeenCalledTimes(1);
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.actor_user_id).toBe(MENTOR_USER.id);
    expect(payload.subject_user_id).toBe(CUST_UUID);
    expect(payload.action).toBe("mentor_access_request");
    expect(payload.fields).toEqual(["requested_tier"]);
    expect(payload.route).toBe("/api/mentor/access-request");
    expect(payload.ip).toBe("203.0.113.5");
    expect(payload.user_agent).toBe("TestAgent/1.0");
    expect(payload.metadata).toEqual({ grant_id: "grant-42", requested_tier: "pseudonymous" });
  });

  it("audit-log ip falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    await POST(
      req({ subject_user_id: CUST_UUID }, { headers: { "x-real-ip": "198.51.100.7" } }),
    );
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("198.51.100.7");
  });

  it("audit-log ip is empty string when no forwarding headers are set", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    await POST(req({ subject_user_id: CUST_UUID }));
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("");
    expect(payload.user_agent).toBe("");
  });

  it("happy path returns {ok:true, grant: inserted row}", async () => {
    const row = makeInsertedRow({ id: "grant-99", requested_tier: "identified" });
    const supa = makeSupabase({ insertRow: row });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ subject_user_id: CUST_UUID }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.grant).toEqual(row);
  });
});
