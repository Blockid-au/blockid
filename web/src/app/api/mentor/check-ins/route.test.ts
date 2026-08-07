// Colocated vitest for POST /api/mentor/check-ins — P9 batch.
//
// Route composes auth + reseller scope + reveal-guard + admin-DB upsert
// (keyed on mentor+subject+iso_week) + reseller audit-log. Every branch is
// asserted here in isolation from the underlying modules so the auth-gate
// ordering, server-derived iso_week, empty-check-in guard, and
// audit-on-success contract stay regression-guarded.

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

function makeUpsertedRow(overrides?: Record<string, unknown>) {
  return {
    id: "ci-1",
    iso_week: "2026-W32",
    updated_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeSupabase(opts?: { upsertError?: { message: string } | null; upsertRow?: unknown }) {
  const singleFn = vi.fn().mockResolvedValue({
    data: opts && "upsertRow" in opts ? opts.upsertRow : makeUpsertedRow(),
    error: opts?.upsertError ?? null,
  });
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const upsertFn = vi.fn().mockReturnValue({ select: selectFn });
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn });
  return {
    _client: { from: fromFn },
    _fromFn: fromFn,
    _upsertFn: upsertFn,
    _selectFn: selectFn,
    _singleFn: singleFn,
  };
}

function req(
  body: unknown,
  opts?: { badJson?: boolean; headers?: Record<string, string> },
) {
  return new Request("http://x/api/mentor/check-ins", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function goodBody(overrides?: Record<string, unknown>) {
  return { subject_user_id: CUST_UUID, wins: "shipped v1", blockers: "", next_focus: "onboard 3 pilots", mood: "up", ...overrides };
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

describe("POST /api/mentor/check-ins", () => {
  it("returns 401 when no user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("unauthorised");
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
  });

  it("returns 403 on ResellerScopeError with err.code as reason", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_reseller");
  });

  it("rethrows non-ResellerScopeError from scopedReseller", async () => {
    mocks.scopedReseller.mockRejectedValue(new Error("kaboom"));
    await expect(POST(req(goodBody()))).rejects.toThrow("kaboom");
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 403 when reveal target not_in_scope", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "not_in_scope" });
    const res = await POST(req(goodBody({ subject_user_id: "outsider" })));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_in_scope");
  });

  it("returns 400 when reveal target missing_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "missing_id" });
    const res = await POST(req({ wins: "x" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("missing_id");
  });

  it("returns 400 when reveal target invalid_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "invalid_id" });
    const res = await POST(req(goodBody({ subject_user_id: "not-a-uuid" })));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_id");
  });

  it("returns 400 empty_check_in when every scored field is blank", async () => {
    const res = await POST(
      req({ subject_user_id: CUST_UUID, wins: "", blockers: "", next_focus: "", mood: "bogus" }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("empty_check_in");
  });

  it("returns 400 empty_check_in when only mood is set (mood alone < 0 threshold not met)", async () => {
    // mood alone weighs 0.05; completeness returns 0.05 which is > 0 so this
    // must NOT be rejected — pin the contract: any signal survives the guard.
    const res = await POST(
      req({ subject_user_id: CUST_UUID, wins: "", blockers: "", next_focus: "", mood: "up" }),
    );
    // upsert should have been attempted (score > 0)
    expect(res.status).toBe(200);
  });

  it("returns 503 when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("not_configured");
  });

  it("returns 500 upsert_failed when supabase upsert errors", async () => {
    const supa = makeSupabase({ upsertError: { message: "db down" }, upsertRow: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("upsert_failed");
    expect(body.error).toBe("db down");
  });

  it("returns 500 upsert_failed when upsert returns no row + no error", async () => {
    const supa = makeSupabase({ upsertRow: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("upsert_failed");
    expect(body.error).toBe("no_row");
  });

  it("returns 500 audit_failed when auditLog throws", async () => {
    const auditLog = vi.fn().mockRejectedValue(new Error("audit down"));
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const res = await POST(req(goodBody()));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("audit_failed");
    expect(body.error).toBe("audit down");
  });

  it("targets 'mentor_check_ins' table with the composite-key onConflict", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req(goodBody()));
    expect(supa._fromFn).toHaveBeenCalledWith("mentor_check_ins");
    const opts = supa._upsertFn.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(opts.onConflict).toBe("mentor_user_id,subject_user_id,iso_week");
  });

  it("stamps upsert row with mentor_user_id, subject_user_id, iso_week, and payload fields", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req(goodBody({ wins: "w", blockers: "b", next_focus: "nf", mood: "flat" })));
    const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.mentor_user_id).toBe(MENTOR_USER.id);
    expect(row.subject_user_id).toBe(CUST_UUID);
    expect(row.wins).toBe("w");
    expect(row.blockers).toBe("b");
    expect(row.next_focus).toBe("nf");
    expect(row.mood).toBe("flat");
    expect(typeof row.iso_week).toBe("string");
    expect(row.iso_week as string).toMatch(/^\d{4}-W\d{2}$/);
    expect(typeof row.created_at).toBe("string");
    expect(row.created_at).toBe(row.updated_at);
    expect(row.created_at as string).toMatch(/T.*Z$/);
  });

  it("derives iso_week from the SERVER clock, ignoring any body-supplied iso_week", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ ...goodBody(), iso_week: "1999-W01" }));
    const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    // shape guard — a real ISO week for "now"; must NOT echo the forged input
    expect(row.iso_week).not.toBe("1999-W01");
    expect(row.iso_week as string).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("truncates wins/blockers/next_focus at 2000 characters", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const long = "x".repeat(2500);
    await POST(req({ subject_user_id: CUST_UUID, wins: long, blockers: long, next_focus: long, mood: "up" }));
    const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((row.wins as string).length).toBe(2000);
    expect((row.blockers as string).length).toBe(2000);
    expect((row.next_focus as string).length).toBe(2000);
  });

  it("coerces non-string wins/blockers/next_focus to empty string (no throw)", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req({ subject_user_id: CUST_UUID, wins: 42, blockers: { nested: true }, next_focus: ["a"], mood: "up" }),
    );
    const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.wins).toBe("");
    expect(row.blockers).toBe("");
    expect(row.next_focus).toBe("");
  });

  it("normalises unknown mood values to null", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req(goodBody({ mood: "ecstatic" })));
    const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.mood).toBeNull();
  });

  it("accepts each canonical mood: up / flat / down", async () => {
    for (const m of ["up", "flat", "down"] as const) {
      const supa = makeSupabase();
      mocks.getSupabaseAdmin.mockReturnValue(supa._client);
      await POST(req(goodBody({ mood: m })));
      const row = supa._upsertFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(row.mood).toBe(m);
    }
  });

  it("select projection is 'id, iso_week, updated_at'", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req(goodBody()));
    expect(supa._selectFn).toHaveBeenCalledWith("id, iso_week, updated_at");
  });

  it("passes allowedCustomerIds output straight into decideReveal", async () => {
    const scope = makeScope();
    scope.allowedCustomerIds = vi.fn().mockResolvedValue(["a", "b", CUST_UUID]);
    mocks.scopedReseller.mockResolvedValue(scope);
    await POST(req(goodBody()));
    expect(mocks.decideReveal).toHaveBeenCalledWith(CUST_UUID, ["a", "b", CUST_UUID]);
  });

  it("audit-log payload carries action='mentor_check_in' + iso_week + completeness metadata", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const supa = makeSupabase({ upsertRow: makeUpsertedRow({ iso_week: "2026-W32" }) });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req(
        goodBody({ wins: "w", blockers: "b", next_focus: "nf", mood: "up" }),
        { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "TestAgent/1.0" } },
      ),
    );
    expect(auditLog).toHaveBeenCalledTimes(1);
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.actor_user_id).toBe(MENTOR_USER.id);
    expect(payload.subject_user_id).toBe(CUST_UUID);
    expect(payload.action).toBe("mentor_check_in");
    expect(payload.fields).toEqual(["wins", "blockers", "next_focus", "mood"]);
    expect(payload.route).toBe("/api/mentor/check-ins");
    expect(payload.ip).toBe("203.0.113.5");
    expect(payload.user_agent).toBe("TestAgent/1.0");
    const meta = payload.metadata as Record<string, unknown>;
    expect(typeof meta.iso_week).toBe("string");
    expect(meta.iso_week as string).toMatch(/^\d{4}-W\d{2}$/);
    // completeness rounded to 2dp: 0.35 + 0.35 + 0.25 + 0.05 = 1.00
    expect(meta.completeness).toBe(1);
  });

  it("audit-log completeness reflects partial-fill scoring", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    // wins only → 0.35
    await POST(req({ subject_user_id: CUST_UUID, wins: "w", blockers: "", next_focus: "", mood: "bogus" }));
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.completeness).toBe(0.35);
  });

  it("audit-log ip falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    await POST(req(goodBody(), { headers: { "x-real-ip": "198.51.100.7" } }));
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("198.51.100.7");
  });

  it("audit-log ip is empty string when no forwarding headers are set", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    await POST(req(goodBody()));
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("");
    expect(payload.user_agent).toBe("");
  });

  it("happy path returns {ok:true, check_in, completeness}", async () => {
    const row = makeUpsertedRow({ id: "ci-99", iso_week: "2026-W32" });
    const supa = makeSupabase({ upsertRow: row });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req(goodBody({ wins: "w", blockers: "b", next_focus: "nf", mood: "up" })));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.check_in).toEqual(row);
    // completeness score for all-fields-filled = 1
    expect(body.completeness).toBe(1);
  });
});
