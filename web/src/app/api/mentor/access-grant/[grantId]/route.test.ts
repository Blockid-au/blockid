// Colocated vitest for POST /api/mentor/access-grant/[grantId] — P9 batch.
//
// A founder approves or denies a pending mentor access-grant. The route is
// founder-authenticated (NOT reseller-scoped), so it composes:
//   1. auth (getCurrentUser)
//   2. grantId param + body validation
//   3. admin-DB read of mentor_access_grants
//   4. subject-owner + status guards
//   5. optimistic update guarded on status='pending'
//   6. approve-only mirror onto reseller_attributions.consent_tier (non-fatal)
//   7. reseller_audit_log insert (fatal on error)
//
// Every branch is asserted here in isolation from the underlying modules so
// the auth-gate ordering, subject-ownership guard, and audit-on-success
// contract stay regression-guarded even as the schema evolves.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { POST } from "./route";

const FOUNDER = { id: "founder-1", email: "founder@example.com", plan: "startup", role: "user" };
const OTHER_FOUNDER = { id: "founder-2", email: "other@example.com", plan: "startup", role: "user" };
const GRANT_ID = "grant-abc-123";

type GrantRow = {
  id: string;
  mentor_user_id: string;
  subject_user_id: string;
  reseller_id: string;
  requested_tier: "identified" | "pseudonymous";
  status: "pending" | "granted" | "denied";
};

function makeGrant(overrides?: Partial<GrantRow>): GrantRow {
  return {
    id: GRANT_ID,
    mentor_user_id: "mentor-1",
    subject_user_id: FOUNDER.id,
    reseller_id: "res-1",
    requested_tier: "identified",
    status: "pending",
    ...overrides,
  };
}

function makeUpdatedRow(overrides?: Record<string, unknown>) {
  return {
    id: GRANT_ID,
    status: "granted",
    granted_at: "2026-08-08T00:00:00.000Z",
    granted_tier: "identified",
    ...overrides,
  };
}

type SupabaseHarnessOpts = {
  readErr?: { message: string } | null;
  grant?: GrantRow | null;
  updateErr?: { message: string } | null;
  updated?: unknown; // returned row from update().select().single()
  mirrorErr?: { message: string } | null;
  auditErr?: { message: string } | null;
};

// Builds a fake SupabaseClient that supports the three chains this route uses:
//   from('mentor_access_grants').select(...).eq('id', id).maybeSingle()
//   from('mentor_access_grants').update(...).eq().eq().eq().select(...).single()
//   from('reseller_attributions').update(...).eq().eq()
//   from('reseller_audit_log').insert(...)
function makeSupabase(opts: SupabaseHarnessOpts = {}) {
  const grantRow = opts.grant === undefined ? makeGrant() : opts.grant;
  const updatedRow =
    opts.updated === undefined ? makeUpdatedRow() : opts.updated;

  // --- mentor_access_grants SELECT chain
  const maybeSingle = vi.fn().mockResolvedValue({
    data: grantRow,
    error: opts.readErr ?? null,
  });
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const selectFn = vi.fn().mockReturnValue({ eq: selectEq });

  // --- mentor_access_grants UPDATE chain
  const updateSingle = vi.fn().mockResolvedValue({
    data: updatedRow,
    error: opts.updateErr ?? null,
  });
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEq3 = vi.fn().mockReturnValue({ select: updateSelect });
  const updateEq2 = vi.fn().mockReturnValue({ eq: updateEq3 });
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 });

  // --- reseller_attributions UPDATE chain
  const mirrorEq2 = vi.fn().mockResolvedValue({ error: opts.mirrorErr ?? null });
  const mirrorEq1 = vi.fn().mockReturnValue({ eq: mirrorEq2 });
  const mirrorUpdate = vi.fn().mockReturnValue({ eq: mirrorEq1 });

  // --- reseller_audit_log INSERT chain
  const insertFn = vi.fn().mockResolvedValue({ error: opts.auditErr ?? null });

  const fromFn = vi.fn((table: string) => {
    if (table === "mentor_access_grants") {
      return { select: selectFn, update: updateFn };
    }
    if (table === "reseller_attributions") {
      return { update: mirrorUpdate };
    }
    if (table === "reseller_audit_log") {
      return { insert: insertFn };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    _client: { from: fromFn },
    _fromFn: fromFn,
    _selectFn: selectFn,
    _selectEq: selectEq,
    _maybeSingle: maybeSingle,
    _updateFn: updateFn,
    _updateEq1: updateEq1,
    _updateEq2: updateEq2,
    _updateEq3: updateEq3,
    _updateSelect: updateSelect,
    _updateSingle: updateSingle,
    _mirrorUpdate: mirrorUpdate,
    _mirrorEq1: mirrorEq1,
    _mirrorEq2: mirrorEq2,
    _insertFn: insertFn,
  };
}

function req(
  body: unknown,
  opts?: { badJson?: boolean; headers?: Record<string, string> },
) {
  return new Request("http://x/api/mentor/access-grant/" + GRANT_ID, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function ctx(grantId: string = GRANT_ID) {
  return { params: Promise.resolve({ grantId }) };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(FOUNDER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase()._client);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("POST /api/mentor/access-grant/[grantId] — auth + input validation", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "unauthorised" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_grant_id when grantId is empty string", async () => {
    const res = await POST(req({ decision: "approve" }), ctx(""));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "invalid_grant_id" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_grant_id when grantId is not a string", async () => {
    // The route's runtime guard checks `typeof grantId !== 'string'`; feed a
    // non-string via the resolved params to prove the guard fires.
    const res = await POST(
      req({ decision: "approve" }),
      { params: Promise.resolve({ grantId: 42 as unknown as string }) },
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "invalid_grant_id" });
  });

  it("returns 400 invalid_decision on malformed JSON body", async () => {
    const res = await POST(req(null, { badJson: true }), ctx());
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "invalid_decision" });
  });

  it("returns 400 invalid_decision when body is null", async () => {
    const res = await POST(req(null), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid_decision");
  });

  it("returns 400 invalid_decision when decision is missing", async () => {
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid_decision");
  });

  it("returns 400 invalid_decision when decision is an unknown string", async () => {
    const res = await POST(req({ decision: "maybe" }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid_decision");
  });

  it("returns 400 invalid_decision when decision is a non-string type", async () => {
    const res = await POST(req({ decision: 1 }), ctx());
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid_decision");
  });

  it("input guards run before supabase is consulted", async () => {
    // getSupabaseAdmin should not be invoked when body validation fails.
    mocks.getSupabaseAdmin.mockClear();
    await POST(req({ decision: "nope" }), ctx());
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});

describe("POST /api/mentor/access-grant/[grantId] — configuration + lookup", () => {
  it("returns 503 not_configured when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns 500 lookup_failed when the initial select errors", async () => {
    const supa = makeSupabase({ readErr: { message: "db down" }, grant: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("lookup_failed");
    expect(body.error).toBe("db down");
    // no update or audit fired
    expect(supa._updateFn).not.toHaveBeenCalled();
    expect(supa._insertFn).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when the grant does not exist", async () => {
    const supa = makeSupabase({ grant: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(404);
    expect((await json(res)).reason).toBe("not_found");
    expect(supa._updateFn).not.toHaveBeenCalled();
  });

  it("returns 403 not_subject when the caller does not own the grant", async () => {
    const supa = makeSupabase({
      grant: makeGrant({ subject_user_id: OTHER_FOUNDER.id }),
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(403);
    expect((await json(res)).reason).toBe("not_subject");
    expect(supa._updateFn).not.toHaveBeenCalled();
    expect(supa._insertFn).not.toHaveBeenCalled();
  });

  it("returns 409 not_pending with current_status when grant is already granted", async () => {
    const supa = makeSupabase({ grant: makeGrant({ status: "granted" }) });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.reason).toBe("not_pending");
    expect(body.current_status).toBe("granted");
  });

  it("returns 409 not_pending with current_status when grant is already denied", async () => {
    const supa = makeSupabase({ grant: makeGrant({ status: "denied" }) });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "deny" }), ctx());
    expect(res.status).toBe(409);
    expect((await json(res)).current_status).toBe("denied");
  });

  it("select projection is 'id, mentor_user_id, subject_user_id, reseller_id, requested_tier, status'", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "approve" }), ctx());
    expect(supa._selectFn).toHaveBeenCalledWith(
      "id, mentor_user_id, subject_user_id, reseller_id, requested_tier, status",
    );
    expect(supa._selectEq).toHaveBeenCalledWith("id", GRANT_ID);
  });
});

describe("POST /api/mentor/access-grant/[grantId] — approve path", () => {
  it("stamps status=granted + granted_at + granted_tier=requested_tier on update", async () => {
    const supa = makeSupabase({
      grant: makeGrant({ requested_tier: "pseudonymous" }),
      updated: makeUpdatedRow({ granted_tier: "pseudonymous" }),
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    const updateArg = supa._updateFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.status).toBe("granted");
    expect(typeof updateArg.granted_at).toBe("string");
    expect(updateArg.granted_tier).toBe("pseudonymous");
    // granted_at is ISO8601
    expect(updateArg.granted_at as string).toMatch(/T.*Z$/);
  });

  it("optimistic update filters on id + subject + status=pending", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "approve" }), ctx());
    expect(supa._updateEq1).toHaveBeenCalledWith("id", GRANT_ID);
    expect(supa._updateEq2).toHaveBeenCalledWith("subject_user_id", FOUNDER.id);
    expect(supa._updateEq3).toHaveBeenCalledWith("status", "pending");
    expect(supa._updateSelect).toHaveBeenCalledWith(
      "id, status, granted_at, granted_tier",
    );
  });

  it("mirrors requested_tier onto reseller_attributions.consent_tier when approved", async () => {
    const supa = makeSupabase({
      grant: makeGrant({ requested_tier: "identified", reseller_id: "res-77" }),
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "approve" }), ctx());
    expect(supa._fromFn).toHaveBeenCalledWith("reseller_attributions");
    const arg = supa._mirrorUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.consent_tier).toBe("identified");
    expect(supa._mirrorEq1).toHaveBeenCalledWith("reseller_id", "res-77");
    expect(supa._mirrorEq2).toHaveBeenCalledWith("subject_user_id", FOUNDER.id);
  });

  it("mirror failure is non-fatal — approve still returns 200", async () => {
    const supa = makeSupabase({
      mirrorErr: { message: "mirror boom" },
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
    const first = warn.mock.calls[0]?.join(" ") ?? "";
    expect(first).toContain("mirror boom");
    warn.mockRestore();
  });

  it("returns 200 { ok: true, grant: updated } on happy path", async () => {
    const row = makeUpdatedRow({ id: "grant-999", granted_tier: "identified" });
    const supa = makeSupabase({ updated: row });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.grant).toEqual(row);
  });

  it("returns 500 update_failed when update errors", async () => {
    const supa = makeSupabase({
      updateErr: { message: "conflict" },
      updated: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("update_failed");
    expect(body.error).toBe("conflict");
    // never falls through to audit
    expect(supa._insertFn).not.toHaveBeenCalled();
  });

  it("returns 500 update_failed with 'no_row' when update returns null row + no error", async () => {
    const supa = makeSupabase({ updated: null });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("update_failed");
    expect(body.error).toBe("no_row");
  });
});

describe("POST /api/mentor/access-grant/[grantId] — deny path", () => {
  it("stamps status=denied + denied_at and does NOT set granted_tier", async () => {
    const supa = makeSupabase({
      updated: makeUpdatedRow({ status: "denied", granted_at: null, granted_tier: null }),
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "deny" }), ctx());
    expect(res.status).toBe(200);
    const updateArg = supa._updateFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg.status).toBe("denied");
    expect(typeof updateArg.denied_at).toBe("string");
    expect(updateArg).not.toHaveProperty("granted_tier");
    expect(updateArg).not.toHaveProperty("granted_at");
  });

  it("does NOT mirror onto reseller_attributions when denied", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "deny" }), ctx());
    expect(supa._mirrorUpdate).not.toHaveBeenCalled();
    // reseller_attributions should not be touched at all
    const touchedTables = supa._fromFn.mock.calls.map((c) => c[0]);
    expect(touchedTables).not.toContain("reseller_attributions");
  });
});

describe("POST /api/mentor/access-grant/[grantId] — audit trail", () => {
  it("returns 500 audit_failed when the audit insert errors", async () => {
    const supa = makeSupabase({ auditErr: { message: "audit down" } });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("audit_failed");
    expect(body.error).toBe("audit down");
  });

  it("audit action=mentor_access_grant on approve", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "approve" }), ctx());
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.action).toBe("mentor_access_grant");
  });

  it("audit action=mentor_access_deny on deny", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "deny" }), ctx());
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.action).toBe("mentor_access_deny");
  });

  it("audit payload carries reseller_id + actor + subject + fields + route + metadata", async () => {
    const supa = makeSupabase({
      grant: makeGrant({
        mentor_user_id: "mentor-77",
        reseller_id: "res-77",
        requested_tier: "pseudonymous",
      }),
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req(
        { decision: "approve" },
        { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA/2" } },
      ),
      ctx(),
    );
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.reseller_id).toBe("res-77");
    expect(payload.actor_user_id).toBe(FOUNDER.id);
    expect(payload.subject_user_id).toBe(FOUNDER.id);
    expect(payload.fields).toEqual(["status"]);
    expect(payload.route).toBe("/api/mentor/access-grant/[grantId]");
    expect(payload.ip).toBe("203.0.113.9");
    expect(payload.user_agent).toBe("UA/2");
    expect(payload.metadata).toEqual({
      grant_id: GRANT_ID,
      mentor_user_id: "mentor-77",
      requested_tier: "pseudonymous",
    });
  });

  it("audit ip falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req({ decision: "approve" }, { headers: { "x-real-ip": "198.51.100.7" } }),
      ctx(),
    );
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("198.51.100.7");
  });

  it("audit ip is null when no forwarding headers are present", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(req({ decision: "approve" }), ctx());
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    // route coerces empty-string ip/ua to null before insert
    expect(payload.ip).toBeNull();
    expect(payload.user_agent).toBeNull();
  });

  it("audit ip uses only the first token from x-forwarded-for", async () => {
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await POST(
      req(
        { decision: "approve" },
        { headers: { "x-forwarded-for": "  9.9.9.9  , 10.0.0.1, 172.16.0.1" } },
      ),
      ctx(),
    );
    const payload = supa._insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("9.9.9.9");
  });
});
