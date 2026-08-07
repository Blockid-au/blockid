// Colocated vitest for GET /api/mentor/roster — P9 batch.
//
// The roster composes: auth gate → reseller scope → admin-DB (4 parallel
// selects) → mask/reveal → engagement scorer → audit-log. Every branch is
// asserted here in isolation so the audit-on-success contract, the consent
// gating that suppresses `revoked` mentees, and the parallel-select fan-out
// stay regression-guarded.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  scopedReseller: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resellerSupabase: vi.fn(),
  maskEmail: vi.fn(),
  computeEngagement: vi.fn(),
  summarize: vi.fn(),
  currentIsoWeek: vi.fn(),
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
  maskEmail: (e: string) => mocks.maskEmail(e),
}));
vi.mock("@/lib/mentor/engagement-score", () => ({
  computeEngagement: (i: unknown) => mocks.computeEngagement(i),
}));
vi.mock("@/lib/mentor/notes", () => ({
  summarize: (t: string, n: number) => mocks.summarize(t, n),
}));
vi.mock("@/lib/mentor/check-ins", () => ({
  currentIsoWeek: (d: Date) => mocks.currentIsoWeek(d),
}));

import { GET } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

const MENTOR_USER = { id: "mentor-1", email: "mentor@example.com", plan: "reseller", role: "user" };
const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

type TableRows = {
  app_users?: unknown[];
  mentor_check_ins?: unknown[];
  svi_analyses?: unknown[];
  reseller_attributions?: unknown[];
};
type TableErrors = Partial<Record<keyof TableRows, { message: string } | null>>;

function makeScope(allowed: string[] = [ID_A]) {
  return {
    reseller_id: "res-1",
    role: "owner",
    allowedCustomerIds: vi.fn().mockResolvedValue(allowed),
  };
}

// A chainable Supabase mock: every builder method returns the same builder
// which is itself thenable. `.then` resolves to whatever data/error was
// registered for the table the .from() call selected.
function makeSupabase(rows: TableRows = {}, errors: TableErrors = {}) {
  const calls: {
    from: string[];
    select: unknown[];
    eq: Array<[string, unknown]>;
    in: Array<[string, unknown[]]>;
    order: Array<[string, unknown]>;
  } = { from: [], select: [], eq: [], in: [], order: [] };

  function builder(table: keyof TableRows) {
    const chain: Record<string, unknown> = {};
    chain.select = (proj: unknown) => {
      calls.select.push({ table, proj });
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      calls.eq.push([col, val]);
      return chain;
    };
    chain.in = (col: string, vals: unknown[]) => {
      calls.in.push([col, vals]);
      return chain;
    };
    chain.order = (col: string, opts: unknown) => {
      calls.order.push([col, opts]);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows[table] ?? [], error: errors[table] ?? null }).then(resolve);
    return chain;
  }

  const from = vi.fn((table: string) => {
    calls.from.push(table);
    return builder(table as keyof TableRows);
  });

  return { _client: { from }, _calls: calls, _fromFn: from };
}

function req(headers: Record<string, string> = {}) {
  return new Request("http://x/api/mentor/roster", {
    method: "GET",
    headers,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(MENTOR_USER);
  mocks.scopedReseller.mockResolvedValue(makeScope());
  const auditLog = vi.fn().mockResolvedValue(undefined);
  mocks.resellerSupabase.mockReturnValue({ auditLog });
  mocks.maskEmail.mockImplementation((e: string) => `masked:${e}`);
  mocks.summarize.mockImplementation((t: string, n: number) =>
    typeof t === "string" ? t.slice(0, n) : "",
  );
  mocks.currentIsoWeek.mockReturnValue("2026-W32");
  mocks.computeEngagement.mockReturnValue({
    score: 75,
    tier: "hot",
    components: { freshness: 1, login: 1, svi: 1, reports: 1 },
    formula: "score = 75",
  });
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase()._client);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mentor/roster", () => {
  it("returns 401 when no current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("unauthorised");
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
  });

  it("returns 403 on ResellerScopeError with err.code as reason", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await GET(req());
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_reseller");
  });

  it("rethrows non-ResellerScopeError from scopedReseller", async () => {
    mocks.scopedReseller.mockRejectedValue(new Error("boom"));
    await expect(GET(req())).rejects.toThrow("boom");
  });

  it("returns 503 when getSupabaseAdmin returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("not_configured");
  });

  it("returns empty mentees with iso_week when allowedCustomerIds is []", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope([]));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.iso_week).toBe("2026-W32");
    expect(body.mentees).toEqual([]);
    // no admin-DB reads should have been necessary
    // (we still allow supabase to have been resolved above, but not from())
  });

  it("iso_week comes from currentIsoWeek(now)", async () => {
    mocks.currentIsoWeek.mockReturnValue("2099-W42");
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = await json(res);
    expect(body.iso_week).toBe("2099-W42");
    expect(mocks.currentIsoWeek).toHaveBeenCalledWith(expect.any(Date));
  });

  it("emits one mentee row per allowed id, filtering revoked consent", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope([ID_A, ID_B, ID_C]));
    const supa = makeSupabase({
      app_users: [
        { id: ID_A, email: "a@x.io", display_name: "Alice", last_login_at: null },
        { id: ID_B, email: "b@x.io", display_name: "Bob", last_login_at: null },
        { id: ID_C, email: "c@x.io", display_name: "Cara", last_login_at: null },
      ],
      reseller_attributions: [
        { subject_user_id: ID_A, consent_tier: "identified" },
        { subject_user_id: ID_B, consent_tier: "revoked" },
        { subject_user_id: ID_C, consent_tier: "pseudonymous" },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<{ subject_user_id: string }> };
    expect(body.mentees.map((m) => m.subject_user_id)).toEqual([ID_A, ID_C]);
  });

  it("identified consent_tier passes through raw email; other tiers mask", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope([ID_A, ID_C]));
    const supa = makeSupabase({
      app_users: [
        { id: ID_A, email: "a@x.io", display_name: "Alice", last_login_at: null },
        { id: ID_C, email: "c@x.io", display_name: "Cara", last_login_at: null },
      ],
      reseller_attributions: [
        { subject_user_id: ID_A, consent_tier: "identified" },
        { subject_user_id: ID_C, consent_tier: "pseudonymous" },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as {
      mentees: Array<{ subject_user_id: string; email: string | null; consent_tier: string }>;
    };
    const byId = new Map(body.mentees.map((m) => [m.subject_user_id, m]));
    expect(byId.get(ID_A)?.email).toBe("a@x.io");
    expect(byId.get(ID_A)?.consent_tier).toBe("identified");
    expect(byId.get(ID_C)?.email).toBe("masked:c@x.io");
    expect(byId.get(ID_C)?.consent_tier).toBe("pseudonymous");
  });

  it("email is null when app_users row is missing for the allowed id", async () => {
    // no app_users row for ID_A → email cannot be masked or exposed
    const supa = makeSupabase({
      app_users: [],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    expect(body.mentees[0]?.email).toBeNull();
    expect(body.mentees[0]?.display_name).toBe("Unknown mentee");
  });

  it("defaults consent_tier to 'pseudonymous' when no attribution row exists", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [], // no consent row → default = pseudonymous
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    expect(body.mentees[0]?.consent_tier).toBe("pseudonymous");
    expect(body.mentees[0]?.email).toBe("masked:a@x.io");
  });

  it("picks latest check-in per mentee (order desc — first row wins)", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      mentor_check_ins: [
        // route reads in insertion order; ORDER BY created_at DESC is done by Supabase
        {
          subject_user_id: ID_A,
          iso_week: "2026-W30",
          blockers: "latest blocker text",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        {
          subject_user_id: ID_A,
          iso_week: "2026-W28",
          blockers: "older blocker text",
          created_at: "2026-07-15T00:00:00.000Z",
        },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    expect(body.mentees[0]?.latest_check_in_week).toBe("2026-W30");
    expect(mocks.summarize).toHaveBeenCalledWith("latest blocker text", 80);
  });

  it("null blockers on latest check-in coerce to empty-string summary input", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      mentor_check_ins: [
        {
          subject_user_id: ID_A,
          iso_week: "2026-W30",
          blockers: null,
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    expect(mocks.summarize).toHaveBeenCalledWith("", 80);
  });

  it("no check-in → latest_check_in_week null + latest_blocker_preview ''", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      mentor_check_ins: [],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    expect(body.mentees[0]?.latest_check_in_week).toBeNull();
    expect(body.mentees[0]?.latest_blocker_preview).toBe("");
    // summarize should not have been called for this mentee
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("computes 30-day SVI delta from earliest ≥30-day-old row vs latest row", async () => {
    const nowIso = new Date().toISOString();
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      svi_analyses: [
        // ORDER BY created_at ASC → oldest first
        { user_id: ID_A, total_svi: 40, created_at: old },
        { user_id: ID_A, total_svi: 65, created_at: nowIso },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const arg = mocks.computeEngagement.mock.calls[0]?.[0] as {
      svi_delta_30d: number | null;
      last_report_at: string | null;
    };
    expect(arg.svi_delta_30d).toBe(25);
    expect(typeof arg.last_report_at).toBe("string");
  });

  it("svi_delta_30d is null when no row is ≥30 days old", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      svi_analyses: [
        { user_id: ID_A, total_svi: 50, created_at: new Date().toISOString() },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const arg = mocks.computeEngagement.mock.calls[0]?.[0] as { svi_delta_30d: number | null };
    expect(arg.svi_delta_30d).toBeNull();
  });

  it("svi rows with non-number total_svi are ignored (null → delta null, last_report_at null)", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
      svi_analyses: [
        { user_id: ID_A, total_svi: null, created_at: "2026-07-01T00:00:00.000Z" },
        { user_id: ID_A, total_svi: null, created_at: "2026-08-01T00:00:00.000Z" },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const arg = mocks.computeEngagement.mock.calls[0]?.[0] as {
      svi_delta_30d: number | null;
      last_report_at: string | null;
    };
    expect(arg.svi_delta_30d).toBeNull();
    expect(arg.last_report_at).toBeNull();
  });

  it("last_login_at flows through to computeEngagement input", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: "2026-08-01T00:00:00.000Z" }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const arg = mocks.computeEngagement.mock.calls[0]?.[0] as { last_login_at: string | null };
    expect(arg.last_login_at).toBe("2026-08-01T00:00:00.000Z");
  });

  it("mentee row carries engagement result verbatim from computeEngagement", async () => {
    mocks.computeEngagement.mockReturnValue({
      score: 42,
      tier: "cool",
      components: { freshness: 0.1, login: 0.2, svi: 0.3, reports: 0.4 },
      formula: "score = 42",
    });
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    const eng = body.mentees[0]?.engagement as { score: number; tier: string };
    expect(eng.score).toBe(42);
    expect(eng.tier).toBe("cool");
  });

  it("selects the four expected tables", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    expect(supa._calls.from).toEqual(
      expect.arrayContaining([
        "app_users",
        "mentor_check_ins",
        "svi_analyses",
        "reseller_attributions",
      ]),
    );
  });

  it("audit-log payload carries action='view_mentor_roster' + mentee_count metadata", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    mocks.scopedReseller.mockResolvedValue(makeScope([ID_A, ID_B]));
    const supa = makeSupabase({
      app_users: [
        { id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null },
        { id: ID_B, email: "b@x.io", display_name: "B", last_login_at: null },
      ],
      reseller_attributions: [
        { subject_user_id: ID_A, consent_tier: "identified" },
        { subject_user_id: ID_B, consent_tier: "identified" },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(
      req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "TestAgent/1.0" }),
    );
    expect(auditLog).toHaveBeenCalledTimes(1);
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.actor_user_id).toBe(MENTOR_USER.id);
    expect(payload.action).toBe("view_mentor_roster");
    expect(payload.fields).toEqual(["engagement", "check_in"]);
    expect(payload.route).toBe("/api/mentor/roster");
    expect(payload.ip).toBe("203.0.113.5");
    expect(payload.user_agent).toBe("TestAgent/1.0");
    expect(payload.metadata).toEqual({ mentee_count: 2 });
  });

  it("mentee_count metadata reflects post-revocation filter, not raw allowed list", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    mocks.scopedReseller.mockResolvedValue(makeScope([ID_A, ID_B]));
    const supa = makeSupabase({
      app_users: [
        { id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null },
        { id: ID_B, email: "b@x.io", display_name: "B", last_login_at: null },
      ],
      reseller_attributions: [
        { subject_user_id: ID_A, consent_tier: "identified" },
        { subject_user_id: ID_B, consent_tier: "revoked" },
      ],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const payload = auditLog.mock.calls[0]?.[0] as { metadata: { mentee_count: number } };
    expect(payload.metadata.mentee_count).toBe(1);
  });

  it("audit-log ip falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req({ "x-real-ip": "198.51.100.7" }));
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("198.51.100.7");
  });

  it("audit-log ip is empty string when no forwarding headers are set", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const payload = auditLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.ip).toBe("");
    expect(payload.user_agent).toBe("");
  });

  it("returns 500 audit_failed when auditLog throws", async () => {
    const auditLog = vi.fn().mockRejectedValue(new Error("audit down"));
    mocks.resellerSupabase.mockReturnValue({ auditLog });
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("audit_failed");
    expect(body.error).toBe("audit down");
  });

  it("degrades gracefully when app_users select returns an error (empty display fields)", async () => {
    const supa = makeSupabase(
      { reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }] },
      { app_users: { message: "db down" } },
    );
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await json(res)) as { mentees: Array<Record<string, unknown>> };
    expect(body.mentees[0]?.display_name).toBe("Unknown mentee");
    expect(body.mentees[0]?.email).toBeNull();
  });

  it("scoped-reseller error path never hits admin DB", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    expect(supa._fromFn).not.toHaveBeenCalled();
  });

  it("empty allowedCustomerIds path never hits admin DB", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope([]));
    const supa = makeSupabase();
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    expect(supa._fromFn).not.toHaveBeenCalled();
  });

  it("passes user.id into mentor_check_ins .eq('mentor_user_id', ...)", async () => {
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    expect(supa._calls.eq).toEqual(
      expect.arrayContaining([
        ["mentor_user_id", MENTOR_USER.id],
        ["reseller_id", "res-1"],
      ]),
    );
  });

  it("scopes the four table selects via .in(...) with the allowed id list", async () => {
    const allowed = [ID_A, ID_B];
    mocks.scopedReseller.mockResolvedValue(makeScope(allowed));
    const supa = makeSupabase({
      app_users: [{ id: ID_A, email: "a@x.io", display_name: "A", last_login_at: null }],
      reseller_attributions: [{ subject_user_id: ID_A, consent_tier: "identified" }],
    });
    mocks.getSupabaseAdmin.mockReturnValue(supa._client);
    await GET(req());
    const inCols = supa._calls.in.map(([col]) => col);
    // one .in() call per parallel select — id, subject_user_id, user_id, subject_user_id
    expect(inCols).toEqual(
      expect.arrayContaining(["id", "subject_user_id", "user_id"]),
    );
    for (const [, vals] of supa._calls.in) {
      expect(vals).toEqual(allowed);
    }
  });
});
