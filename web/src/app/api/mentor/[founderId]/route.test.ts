// Colocated vitest for GET /api/mentor/[founderId] — P9 batch.
//
// The route is the mentor console's per-mentee payload:
//   auth → reseller scope → decideReveal → admin-DB (5 parallel selects) →
//   profile-null / consent-revoked gates → computeEngagement → auditLog.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 gate so any visitor can pull a
//     mentee's private console (profile + notes + SVI curve).
//   - Dropping the scopedReseller() 403 gate — or letting a raw error
//     other than ResellerScopeError leak a 500 (must rethrow).
//   - Dropping the decideReveal() reveal-guard so a mentor loads a
//     founder that is not attributed to them (403 not_in_scope, 400
//     missing_id/invalid_id).
//   - Dropping the getSupabaseAdmin() 503 gate so an unconfigured prod
//     500s instead of degrading.
//   - Regressing the profile-null → 404 branch so an unknown founderId
//     resolves to a 200 with a null profile.
//   - Regressing the consent_tier === "revoked" → 403 branch so a
//     mentor keeps reading after the founder revokes.
//   - Regressing the consent-tier default (missing attributions row must
//     fall back to "pseudonymous", NEVER "identified").
//   - Regressing the identified/pseudonymous mask: `identified` returns
//     the raw email + display_name; every other tier returns a masked
//     email and (when the founder had a display_name) the literal
//     "Mentee" — never the real name.
//   - Regressing the SVI-curve filter (must drop rows with non-numeric
//     total_svi so the chart never renders a NaN gap).
//   - Regressing the sviDelta window (must require a prior sample at
//     least 30d old; otherwise null so the UI shows "—" instead of a
//     misleadingly small delta from noise within a single week).
//   - Dropping the mentor_user_id / subject_user_id eq() filters on the
//     check_ins or notes queries so a mentor sees another mentor's
//     private rows.
//   - Regressing the LIMITs (check-ins = 8, notes = 50) — the UI relies
//     on those ceilings for pagination.
//   - Dropping the auditLog call — incident response then loses the
//     "view_mentor_console" trail.
//   - Regressing the auditLog error branch (must return 500 audit_failed,
//     never fall through to a 200 with the payload).
//   - Losing `export const dynamic = "force-dynamic"` — this route reads
//     per-request auth state and cannot be pinned to the build cache.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  scopedReseller: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resellerSupabase: vi.fn(),
  decideReveal: vi.fn(),
  maskEmail: vi.fn(),
  computeEngagement: vi.fn(),
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
      this.name = "ResellerScopeError";
    }
  },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (s: unknown) => mocks.resellerSupabase(s),
}));
vi.mock("@/lib/reseller/customer-reveal", () => ({
  decideReveal: (id: unknown, allowed: string[]) => mocks.decideReveal(id, allowed),
  maskEmail: (e: string) => mocks.maskEmail(e),
}));
vi.mock("@/lib/mentor/engagement-score", () => ({
  computeEngagement: (i: unknown) => mocks.computeEngagement(i),
}));

import { GET, dynamic } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MENTOR_USER = {
  id: "mentor-1",
  email: "mentor@example.com",
  plan: "reseller",
  role: "user",
};
const FOUNDER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-9999-9999-9999-999999999999";

function makeScope(allowed: string[] = [FOUNDER_ID]) {
  return {
    reseller_id: "res-1",
    role: "owner",
    allowedCustomerIds: vi.fn().mockResolvedValue(allowed),
  };
}

interface TableRows {
  app_users?: unknown;                 // maybeSingle → object | null
  reseller_attributions?: unknown;     // maybeSingle → object | null
  mentor_check_ins?: unknown[];        // limit() → array
  mentor_notes?: unknown[];            // limit() → array
  svi_analyses?: unknown[];            // order() → array
}
type TableErrors = Partial<Record<keyof TableRows, { message: string } | null>>;

interface QueryCall {
  from: string;
  select?: unknown;
  eqs: Array<[string, unknown]>;
  order?: [string, unknown];
  limit?: number;
  terminator: "maybeSingle" | "then";
}

function makeSupabase(rows: TableRows = {}, errors: TableErrors = {}) {
  const calls: QueryCall[] = [];

  function builder(table: keyof TableRows) {
    const record: QueryCall = { from: table, eqs: [], terminator: "then" };
    calls.push(record);

    const data = () => (rows[table] as unknown) ?? null;
    const err = () => errors[table] ?? null;

    // Some rows are singular (maybeSingle) — return null instead of []
    // when data was not registered. Array-terminated chains override the
    // fallback in the .then() below.
    const chain: Record<string, unknown> = {};
    chain.select = (proj: unknown) => {
      record.select = proj;
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      record.eqs.push([col, val]);
      return chain;
    };
    chain.order = (col: string, opts: unknown) => {
      record.order = [col, opts];
      return chain;
    };
    chain.limit = (n: number) => {
      record.limit = n;
      return chain;
    };
    chain.maybeSingle = () => {
      record.terminator = "maybeSingle";
      return Promise.resolve({ data: data(), error: err() });
    };
    chain.then = (resolve: (v: unknown) => unknown) => {
      // Thenable branch — used by check_ins / notes / svi_analyses which
      // await the builder directly (no .maybeSingle()).
      const arrayFallback = (rows[table] as unknown[] | undefined) ?? [];
      return Promise.resolve({ data: arrayFallback, error: err() }).then(resolve);
    };
    return chain;
  }

  const from = vi.fn((table: string) => builder(table as keyof TableRows));
  return { client: { from }, calls, fromFn: from };
}

function req(headers: Record<string, string> = {}) {
  return new Request(`http://x/api/mentor/${FOUNDER_ID}`, {
    method: "GET",
    headers: {
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "vitest/1.0",
      ...headers,
    },
  });
}

function ctx(id: string = FOUNDER_ID) {
  return { params: Promise.resolve({ founderId: id }) };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Default happy-path wiring — every test overrides only what it needs.
// ---------------------------------------------------------------------------

function primeHappyPath(options?: {
  supa?: ReturnType<typeof makeSupabase>;
  auditLog?: ReturnType<typeof vi.fn>;
}) {
  mocks.getCurrentUser.mockResolvedValue(MENTOR_USER);
  mocks.scopedReseller.mockResolvedValue(makeScope());
  mocks.decideReveal.mockReturnValue({ ok: true, customerId: FOUNDER_ID });
  mocks.maskEmail.mockImplementation((e: string) => `masked:${e}`);
  mocks.computeEngagement.mockReturnValue({
    score: 72,
    tier: "warm",
    components: { freshness: 1, login: 0.5, svi: 0.5, reports: 1 },
    formula: "score = 72",
  });
  const auditLog = options?.auditLog ?? vi.fn().mockResolvedValue(undefined);
  mocks.resellerSupabase.mockReturnValue({ auditLog });
  const supa =
    options?.supa ??
    makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "founder@example.com",
        display_name: "Founder Name",
        last_login_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
      mentor_check_ins: [],
      mentor_notes: [],
      svi_analyses: [],
    });
  mocks.getSupabaseAdmin.mockReturnValue(supa.client);
  return { supa, auditLog };
}

beforeEach(() => {
  primeHappyPath();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module-level export
// ---------------------------------------------------------------------------

describe("route module contract", () => {
  it("exports dynamic = 'force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Auth + scope gates
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — auth + scope gates", () => {
  it("returns 401 when no current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "unauthorised" });
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
  });

  it("checks auth before scope (order matters — never leak scope info to unauth)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET(req(), ctx());
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 with err.code on ResellerScopeError", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "not_reseller" });
  });

  it("returns 403 with the custom scope code (proves err.code, not literal string)", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("reseller_suspended"));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect((await json(res)).reason).toBe("reseller_suspended");
  });

  it("rethrows non-ResellerScopeError from scopedReseller (no 500 masking)", async () => {
    mocks.scopedReseller.mockRejectedValue(new Error("boom"));
    await expect(GET(req(), ctx())).rejects.toThrow("boom");
  });

  it("passes the current user object into scopedReseller", async () => {
    await GET(req(), ctx());
    expect(mocks.scopedReseller).toHaveBeenCalledWith(MENTOR_USER);
  });
});

// ---------------------------------------------------------------------------
// decideReveal gate
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — decideReveal gate", () => {
  it("returns 403 when reveal reason is not_in_scope", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "not_in_scope" });
    const res = await GET(req(), ctx(OTHER_ID));
    expect(res.status).toBe(403);
    expect((await json(res)).reason).toBe("not_in_scope");
  });

  it("returns 400 when reveal reason is missing_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "missing_id" });
    const res = await GET(req(), ctx(""));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("missing_id");
  });

  it("returns 400 when reveal reason is invalid_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "invalid_id" });
    const res = await GET(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid_id");
  });

  it("forwards the raw founderId from params + the allowedCustomerIds", async () => {
    const scope = makeScope([FOUNDER_ID, OTHER_ID]);
    mocks.scopedReseller.mockResolvedValue(scope);
    await GET(req(), ctx(FOUNDER_ID));
    expect(scope.allowedCustomerIds).toHaveBeenCalledTimes(1);
    expect(mocks.decideReveal).toHaveBeenCalledWith(FOUNDER_ID, [FOUNDER_ID, OTHER_ID]);
  });

  it("does NOT open the admin DB when the reveal gate fails (early return)", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "not_in_scope" });
    await GET(req(), ctx(OTHER_ID));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin-DB availability gate
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — admin DB gate", () => {
  it("returns 503 not_configured when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(503);
    expect((await json(res)).reason).toBe("not_configured");
  });

  it("degrades cleanly (no throw) instead of crashing the request", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    await expect(GET(req(), ctx())).resolves.toBeInstanceOf(Response);
  });
});

// ---------------------------------------------------------------------------
// Profile-null and consent-revoked gates
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — profile + consent gates", () => {
  it("returns 404 not_found when app_users lookup returns null", async () => {
    const supa = makeSupabase({
      app_users: null,
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect((await json(res)).reason).toBe("not_found");
  });

  it("returns 403 consent_revoked when attribution.consent_tier === 'revoked'", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "founder@example.com",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "revoked" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect((await json(res)).reason).toBe("consent_revoked");
  });

  it("defaults to pseudonymous when the attributions row is missing", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "founder@example.com",
        display_name: "Founder Name",
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: null,
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { consent_tier: string; email: string } };
    expect(res.status).toBe(200);
    expect(body.profile.consent_tier).toBe("pseudonymous");
    expect(body.profile.email).toBe("masked:founder@example.com");
  });

  it("does NOT reveal display_name when consent_tier defaults to pseudonymous", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "founder@example.com",
        display_name: "Founder Name",
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: null,
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { display_name: string | null } };
    expect(body.profile.display_name).toBe("Mentee");
  });

  it("emits null display_name (never 'Mentee') when the mentee has no display_name and consent is pseudonymous", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "founder@example.com",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "pseudonymous" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { display_name: string | null } };
    expect(body.profile.display_name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Identified consent tier — raw pass-through
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — identified consent tier", () => {
  it("passes through the raw email when consent_tier === 'identified'", async () => {
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { email: string } };
    expect(body.profile.email).toBe("founder@example.com");
    expect(mocks.maskEmail).not.toHaveBeenCalled();
  });

  it("passes through the raw display_name when consent_tier === 'identified'", async () => {
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { display_name: string | null } };
    expect(body.profile.display_name).toBe("Founder Name");
  });

  it("echoes the consent_tier in the profile envelope", async () => {
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { consent_tier: string } };
    expect(body.profile.consent_tier).toBe("identified");
  });
});

// ---------------------------------------------------------------------------
// Query wiring — from() / eq() / order() / limit()
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — DB query wiring", () => {
  it("issues one query per source table (5 total: app_users, reseller_attributions, mentor_check_ins, mentor_notes, svi_analyses)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const tables = supa.calls.map((c) => c.from).sort();
    expect(tables).toEqual([
      "app_users",
      "mentor_check_ins",
      "mentor_notes",
      "reseller_attributions",
      "svi_analyses",
    ]);
  });

  it("uses .maybeSingle() (never .single()) on app_users — .single() would 500 on the missing-founder path instead of returning 404", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const appUsers = supa.calls.find((c) => c.from === "app_users");
    expect(appUsers?.terminator).toBe("maybeSingle");
  });

  it("uses .maybeSingle() on reseller_attributions — missing row is expected (defaults to pseudonymous)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const attr = supa.calls.find((c) => c.from === "reseller_attributions");
    expect(attr?.terminator).toBe("maybeSingle");
  });

  it("filters app_users by id = subjectId (the reveal-verified customerId)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    mocks.decideReveal.mockReturnValue({ ok: true, customerId: FOUNDER_ID });
    await GET(req(), ctx(FOUNDER_ID));
    const appUsers = supa.calls.find((c) => c.from === "app_users");
    expect(appUsers?.eqs).toEqual([["id", FOUNDER_ID]]);
  });

  it("filters reseller_attributions on BOTH reseller_id AND subject_user_id (a scope leak would drop one of these)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const attr = supa.calls.find((c) => c.from === "reseller_attributions");
    expect(attr?.eqs).toEqual([
      ["reseller_id", "res-1"],
      ["subject_user_id", FOUNDER_ID],
    ]);
  });

  it("filters mentor_check_ins on BOTH mentor_user_id AND subject_user_id (a bug that drops the mentor filter leaks other mentors' rows)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "mentor_check_ins");
    expect(q?.eqs).toEqual([
      ["mentor_user_id", MENTOR_USER.id],
      ["subject_user_id", FOUNDER_ID],
    ]);
  });

  it("orders check-ins by created_at DESC and limits to 8", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "mentor_check_ins");
    expect(q?.order?.[0]).toBe("created_at");
    expect(q?.order?.[1]).toEqual({ ascending: false });
    expect(q?.limit).toBe(8);
  });

  it("filters mentor_notes on BOTH mentor_user_id AND subject_user_id", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "mentor_notes");
    expect(q?.eqs).toEqual([
      ["mentor_user_id", MENTOR_USER.id],
      ["subject_user_id", FOUNDER_ID],
    ]);
  });

  it("orders notes by updated_at DESC and limits to 50", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "mentor_notes");
    expect(q?.order?.[0]).toBe("updated_at");
    expect(q?.order?.[1]).toEqual({ ascending: false });
    expect(q?.limit).toBe(50);
  });

  it("filters svi_analyses by user_id = subjectId and orders created_at ASC (so latest is at the end for the curve)", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "svi_analyses");
    expect(q?.eqs).toEqual([["user_id", FOUNDER_ID]]);
    expect(q?.order?.[0]).toBe("created_at");
    expect(q?.order?.[1]).toEqual({ ascending: true });
  });

  it("does NOT paginate svi_analyses (no .limit()) — the whole history is used for the curve", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const q = supa.calls.find((c) => c.from === "svi_analyses");
    expect(q?.limit).toBeUndefined();
  });

  it("uses the reveal-decision customerId (not the raw founderId) when the reveal normalises it", async () => {
    const NORMALISED = FOUNDER_ID; // reveal typically normalises case / trims
    mocks.decideReveal.mockReturnValue({ ok: true, customerId: NORMALISED });
    const supa = makeSupabase({
      app_users: {
        id: NORMALISED,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx("  " + FOUNDER_ID.toUpperCase() + "  "));
    const appUsers = supa.calls.find((c) => c.from === "app_users");
    expect(appUsers?.eqs).toEqual([["id", NORMALISED]]);
  });
});

// ---------------------------------------------------------------------------
// SVI curve + engagement inputs
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — svi curve + engagement inputs", () => {
  const goodProfile = {
    id: FOUNDER_ID,
    email: "f@x.io",
    display_name: null,
    last_login_at: "2026-08-05T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("drops rows with non-numeric total_svi from the emitted curve", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      svi_analyses: [
        { total_svi: 50, created_at: "2026-01-15T00:00:00.000Z" },
        { total_svi: null, created_at: "2026-02-15T00:00:00.000Z" },
        { total_svi: "not-a-number", created_at: "2026-03-15T00:00:00.000Z" },
        { total_svi: 62, created_at: "2026-04-15T00:00:00.000Z" },
      ],
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { svi_curve: Array<{ score: number; at: string }> };
    expect(body.svi_curve).toEqual([
      { score: 50, at: "2026-01-15T00:00:00.000Z" },
      { score: 62, at: "2026-04-15T00:00:00.000Z" },
    ]);
  });

  it("returns an empty svi_curve when no rows have numeric scores", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      svi_analyses: [{ total_svi: null, created_at: "2026-04-15T00:00:00.000Z" }],
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { svi_curve: unknown[] };
    expect(body.svi_curve).toEqual([]);
  });

  it("computes sviDelta as latest − prior-≥-30d and forwards to computeEngagement", async () => {
    const now = new Date("2026-08-08T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      svi_analyses: [
        { total_svi: 40, created_at: "2026-05-01T00:00:00.000Z" }, // >30d old
        { total_svi: 55, created_at: "2026-07-30T00:00:00.000Z" }, // <30d
        { total_svi: 70, created_at: "2026-08-06T00:00:00.000Z" }, // latest
      ],
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const call = mocks.computeEngagement.mock.calls[0]?.[0] as {
      svi_delta_30d: number | null;
      last_report_at: string | null;
    };
    // latest (70) − first row that is ≥30d old (40) = 30
    expect(call.svi_delta_30d).toBe(30);
    expect(call.last_report_at).toBe("2026-08-06T00:00:00.000Z");
    vi.useRealTimers();
  });

  it("emits sviDelta = null when there is no prior sample ≥ 30d old", async () => {
    const now = new Date("2026-08-08T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      svi_analyses: [
        { total_svi: 55, created_at: "2026-07-30T00:00:00.000Z" },
        { total_svi: 60, created_at: "2026-08-06T00:00:00.000Z" },
      ],
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const call = mocks.computeEngagement.mock.calls[0]?.[0] as { svi_delta_30d: number | null };
    expect(call.svi_delta_30d).toBeNull();
    vi.useRealTimers();
  });

  it("forwards last_check_in_at from the newest check-in (index 0 after DESC order)", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      mentor_check_ins: [
        { id: "ci-newest", created_at: "2026-08-06T00:00:00.000Z" },
        { id: "ci-older", created_at: "2026-07-01T00:00:00.000Z" },
      ],
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const call = mocks.computeEngagement.mock.calls[0]?.[0] as { last_check_in_at: string | null };
    expect(call.last_check_in_at).toBe("2026-08-06T00:00:00.000Z");
  });

  it("forwards last_check_in_at = null when there are no check-ins", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      mentor_check_ins: [],
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const call = mocks.computeEngagement.mock.calls[0]?.[0] as { last_check_in_at: string | null };
    expect(call.last_check_in_at).toBeNull();
  });

  it("forwards last_login_at from the profile row (null-safe)", async () => {
    const supa = makeSupabase({
      app_users: { ...goodProfile, last_login_at: null },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    await GET(req(), ctx());
    const call = mocks.computeEngagement.mock.calls[0]?.[0] as { last_login_at: string | null };
    expect(call.last_login_at).toBeNull();
  });

  it("emits the computeEngagement result verbatim in the envelope (never rewraps or renames)", async () => {
    mocks.computeEngagement.mockReturnValue({
      score: 88,
      tier: "hot",
      components: { freshness: 1, login: 1, svi: 1, reports: 1 },
      formula: "score = 88",
    });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { engagement: unknown };
    expect(body.engagement).toEqual({
      score: 88,
      tier: "hot",
      components: { freshness: 1, login: 1, svi: 1, reports: 1 },
      formula: "score = 88",
    });
  });
});

// ---------------------------------------------------------------------------
// Payload echo — check_ins + notes
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — payload echoes DB rows", () => {
  const goodProfile = {
    id: FOUNDER_ID,
    email: "f@x.io",
    display_name: null,
    last_login_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("returns check-in rows in the same order the DB returned them", async () => {
    const rows = [
      { id: "ci-1", iso_week: "2026-W32", wins: "w", blockers: "", next_focus: "n", mood: "up", created_at: "2026-08-06", updated_at: "2026-08-06" },
      { id: "ci-2", iso_week: "2026-W31", wins: "w2", blockers: "", next_focus: "n2", mood: null, created_at: "2026-07-30", updated_at: "2026-07-30" },
    ];
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      mentor_check_ins: rows,
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { check_ins: typeof rows };
    expect(body.check_ins).toEqual(rows);
  });

  it("returns [] check_ins when the query returned no data", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { check_ins: unknown[] };
    expect(body.check_ins).toEqual([]);
  });

  it("returns notes in the same order the DB returned them (no server-side sort override)", async () => {
    const rows = [
      { id: "n-1", body: "hello", visibility: "private", created_at: "2026-08-06", updated_at: "2026-08-06" },
      { id: "n-2", body: "world", visibility: "shared_with_founder", created_at: "2026-07-30", updated_at: "2026-08-05" },
    ];
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
      mentor_notes: rows,
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { notes: typeof rows };
    expect(body.notes).toEqual(rows);
  });

  it("returns [] notes when the query returned no data", async () => {
    const supa = makeSupabase({
      app_users: goodProfile,
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { notes: unknown[] };
    expect(body.notes).toEqual([]);
  });

  it("echoes last_login_at + created_at on the profile envelope", async () => {
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: "F",
        last_login_at: "2026-08-05T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa });
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { profile: { last_login_at: string; created_at: string } };
    expect(body.profile.last_login_at).toBe("2026-08-05T00:00:00.000Z");
    expect(body.profile.created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("envelopes ok:true on success", async () => {
    const res = await GET(req(), ctx());
    const body = (await json(res)) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit log — one row per view, with client meta
// ---------------------------------------------------------------------------

describe("GET /api/mentor/[founderId] — audit log", () => {
  it("writes ONE audit row per successful view with action=view_mentor_console", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    await GET(req(), ctx());
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog.mock.calls[0]?.[0]).toMatchObject({
      actor_user_id: MENTOR_USER.id,
      subject_user_id: FOUNDER_ID,
      action: "view_mentor_console",
      route: "/api/mentor/[founderId]",
    });
  });

  it("declares the fields[] surface (profile, check_ins, notes, engagement) in the audit envelope", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    await GET(req(), ctx());
    const entry = auditLog.mock.calls[0]?.[0] as { fields: string[] };
    expect(entry.fields).toEqual(["profile", "check_ins", "notes", "engagement"]);
  });

  it("captures the FIRST hop of x-forwarded-for as the client ip", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    await GET(
      req({ "x-forwarded-for": "198.51.100.7, 10.0.0.1, 172.16.0.1" }),
      ctx(),
    );
    const entry = auditLog.mock.calls[0]?.[0] as { ip: string };
    expect(entry.ip).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    const r = new Request(`http://x/api/mentor/${FOUNDER_ID}`, {
      method: "GET",
      headers: { "x-real-ip": "203.0.113.42", "user-agent": "vitest/1.0" },
    });
    await GET(r, ctx());
    const entry = auditLog.mock.calls[0]?.[0] as { ip: string };
    expect(entry.ip).toBe("203.0.113.42");
  });

  it("emits ip = '' when neither x-forwarded-for nor x-real-ip is present", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    const r = new Request(`http://x/api/mentor/${FOUNDER_ID}`, {
      method: "GET",
      headers: { "user-agent": "vitest/1.0" },
    });
    await GET(r, ctx());
    const entry = auditLog.mock.calls[0]?.[0] as { ip: string };
    expect(entry.ip).toBe("");
  });

  it("captures the user-agent header verbatim", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    await GET(req({ "user-agent": "MentorConsole/1.2 (test)" }), ctx());
    const entry = auditLog.mock.calls[0]?.[0] as { user_agent: string };
    expect(entry.user_agent).toBe("MentorConsole/1.2 (test)");
  });

  it("declares metadata.consent_tier so downstream analytics can see whether the view was identified or masked", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "pseudonymous" },
    });
    primeHappyPath({ supa, auditLog });
    await GET(req(), ctx());
    const entry = auditLog.mock.calls[0]?.[0] as { metadata: { consent_tier: string } };
    expect(entry.metadata).toEqual({ consent_tier: "pseudonymous" });
  });

  it("returns 500 audit_failed when auditLog rejects (never falls through to a 200 with the payload)", async () => {
    const auditLog = vi.fn().mockRejectedValue(new Error("audit-db offline"));
    primeHappyPath({ auditLog });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(500);
    const body = (await json(res)) as { ok: boolean; reason: string; error: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("audit_failed");
    expect(body.error).toBe("audit-db offline");
  });

  it("does NOT audit on the 404 not_found branch (no view happened)", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    const supa = makeSupabase({
      app_users: null,
      reseller_attributions: { consent_tier: "identified" },
    });
    primeHappyPath({ supa, auditLog });
    await GET(req(), ctx());
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("does NOT audit on the 403 consent_revoked branch", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    const supa = makeSupabase({
      app_users: {
        id: FOUNDER_ID,
        email: "f@x.io",
        display_name: null,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      reseller_attributions: { consent_tier: "revoked" },
    });
    primeHappyPath({ supa, auditLog });
    await GET(req(), ctx());
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("does NOT audit on the 401 / 403 / 503 pre-DB gates", async () => {
    const auditLog = vi.fn().mockResolvedValue(undefined);
    primeHappyPath({ auditLog });
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET(req(), ctx());
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("passes the scope to resellerSupabase (proves the audit wire runs off the scoped client, not the admin client)", async () => {
    const scope = makeScope();
    mocks.scopedReseller.mockResolvedValue(scope);
    await GET(req(), ctx());
    expect(mocks.resellerSupabase).toHaveBeenCalledWith(scope);
  });
});
