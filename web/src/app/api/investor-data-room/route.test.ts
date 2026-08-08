// Colocated vitest for /api/investor-data-room — P9-investor-data-room-route-test.
//
// The one-click shareable data-room surface. POST assembles the founder's SVI
// score, valuation, cap table, evidence, and metrics into a `sections` blob,
// mints a token, and inserts a `data_rooms` row. GET resolves that token into
// a public read (no auth), rejects expired links, and increments the view
// counter while recording an IP-hash for attribution.
//
// Silent regressions this pins against:
//   - dropping the auth gate on POST so an anonymous caller can mint a token
//     against another founder's account (`user.id` is the ONLY tenancy key
//     for share_classes/shareholders/esop_pool);
//   - dropping the `.eq("is_active", true)` filter on GET so a revoked
//     (soft-deleted) room stays reachable via its old token;
//   - dropping the expiry gate so a link past `expires_at` still resolves;
//   - forgetting the newSlug() call so two POSTs collide on token/PK;
//   - hashing the raw IP into the audit log (leaks source IP) — the
//     `hashIp` helper must produce a 16-hex sha256 prefix;
//   - trailing slash from NEXT_PUBLIC_SITE_URL doubling the join and
//     returning `https://x.au//api/...` which every share-link resolver 404s.
//
// The fake supabase dispatches by (table, mode). Each terminator
// (`.maybeSingle()`, thenable await after `.limit()` / `.order()`) resolves
// to whatever `state.responses[table]` (or `state.errors[table]`) is
// configured for that tick. Insert / update land in `state.inserts[table]` /
// `state.updates[table]` for shape assertions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: "user" | "admin";
  plan: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  discountPct: number | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  onboardingCompleted: boolean;
  startupGoals: string[] | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  computeValuationMock: vi.fn<(input: unknown) => unknown>(),
  newSlugMock: vi.fn<() => string>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/valuation", () => ({
  computeValuation: (input: unknown) => mocks.computeValuationMock(input),
}));

vi.mock("@/lib/slug", () => ({
  newSlug: () => mocks.newSlugMock(),
}));

import { GET, POST, dynamic } from "./route";

// ---------------------------------------------------------------------------
// Fake supabase
// ---------------------------------------------------------------------------

interface FakeState {
  responses: Record<string, unknown>; // per-table select data
  errors: Record<string, unknown>; // per-table error (insert only currently)
  inserts: Record<string, Array<Record<string, unknown>>>;
  updates: Record<string, Array<Record<string, unknown>>>;
  eqFilters: Record<string, Array<{ col: string; val: unknown }>>;
  orderCalls: Record<
    string,
    Array<{ col: string; opts: { ascending?: boolean } | undefined }>
  >;
  selectCols: Record<string, string>;
}

let state: FakeState;

function makeSupabase() {
  return {
    from(table: string) {
      state.eqFilters[table] ??= [];
      state.orderCalls[table] ??= [];
      state.inserts[table] ??= [];
      state.updates[table] ??= [];

      function makeChain() {
        const chain: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            state.eqFilters[table]!.push({ col, val });
            return chain;
          },
          order(col: string, opts?: { ascending?: boolean }) {
            state.orderCalls[table]!.push({ col, opts });
            return chain;
          },
          limit(_n: number) {
            return chain;
          },
          maybeSingle() {
            return Promise.resolve({ data: state.responses[table] ?? null });
          },
          then(
            resolve: (v: { data: unknown }) => void,
          ) {
            resolve({ data: state.responses[table] ?? null });
          },
        };
        return chain;
      }

      return {
        select(cols: string) {
          state.selectCols[table] = cols;
          return makeChain();
        },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          const rows = Array.isArray(payload) ? payload : [payload];
          state.inserts[table]!.push(...rows);
          const err = state.errors[table] ?? null;
          return Promise.resolve({ error: err });
        },
        update(payload: Record<string, unknown>) {
          state.updates[table]!.push(payload);
          const upChain: Record<string, unknown> = {
            eq(_col: string, _val: unknown) {
              return Promise.resolve({ error: null });
            },
          };
          return upChain;
        },
      };
    },
  };
}

function freshState(): FakeState {
  return {
    responses: {},
    errors: {},
    inserts: {},
    updates: {},
    eqFilters: {},
    orderCalls: {},
    selectCols: {},
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER: AppUser = {
  id: "user-1",
  email: "founder@example.com",
  displayName: "Founder",
  createdAt: "2026-01-01T00:00:00Z",
  lastLoginAt: null,
  role: "user",
  plan: "free",
  googleId: null,
  avatarUrl: null,
  discountPct: null,
  startupName: "Acme",
  startupStage: null,
  industry: null,
  onboardingCompleted: true,
  startupGoals: null,
};

const SVI_ACCOUNT = {
  id: "svi-1",
  current_svi: 140,
  current_stage: 3,
  startup_name: "Acme",
};

const VALUATION_STUB = {
  lowAud: 1,
  midAud: 2,
  highAud: 3,
  method: "test",
  breakdown: { berkus: { value: 0, factors: {} }, scorecard: { value: 0, adjustments: {} } },
  confidence: 50,
};

function postReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/investor-data-room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

function getReq(token: string | null, opts?: { xff?: string }): Request {
  const url =
    token === null
      ? "http://x/api/investor-data-room"
      : `http://x/api/investor-data-room?token=${encodeURIComponent(token)}`;
  const headers: Record<string, string> = {};
  if (opts?.xff !== undefined) headers["x-forwarded-for"] = opts.xff;
  return new Request(url, { method: "GET", headers });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  state = freshState();
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(makeSupabase());
  mocks.computeValuationMock.mockReset().mockReturnValue(VALUATION_STUB);
  mocks.newSlugMock.mockReset().mockReturnValue("tok_test_abc");
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  }
});

// ---------------------------------------------------------------------------
// Module contract
// ---------------------------------------------------------------------------
describe("route module exports", () => {
  it("marks route dynamic so Next never prerenders the founder data-room mint", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// POST — auth + config gates
// ---------------------------------------------------------------------------
describe("POST /api/investor-data-room — gates", () => {
  it("401 when getCurrentUser resolves null — supabase never touched", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required",
    });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(mocks.newSlugMock).not.toHaveBeenCalled();
  });

  it("503 when getSupabaseAdmin returns null — no token minted", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Database not configured",
    });
    expect(mocks.newSlugMock).not.toHaveBeenCalled();
    expect(mocks.computeValuationMock).not.toHaveBeenCalled();
  });

  it("swallows invalid JSON body — POST still succeeds with defaults", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT };
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    // Default title falls back to `${startup_name} Data Room`
    const inserted = state.inserts.data_rooms![0]!;
    expect(inserted.title).toBe("Acme Data Room");
    // No expiresInDays → expires_at is null
    expect(inserted.expires_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST — data assembly
// ---------------------------------------------------------------------------
describe("POST /api/investor-data-room — data assembly", () => {
  it("no svi account: sections.svi/valuation/metrics all null, capTable empty", async () => {
    // Nothing configured — every select returns { data: null }.
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    const inserted = state.inserts.data_rooms![0]!;
    const sections = inserted.sections as Record<string, unknown>;
    expect(sections.svi).toBeNull();
    expect(sections.valuation).toBeNull();
    expect(sections.metrics).toBeNull();
    expect(mocks.computeValuationMock).not.toHaveBeenCalled();
    // capTable still built from the always-issued cap-table queries
    const capTable = sections.capTable as {
      shareClasses: unknown[];
      shareholders: unknown[];
      esopPool: unknown;
      summary: { totalIssued: number; fullyDilutedTotal: number; esopShares: number };
    };
    expect(capTable.shareClasses).toEqual([]);
    expect(capTable.shareholders).toEqual([]);
    expect(capTable.esopPool).toBeNull();
    expect(capTable.summary).toEqual({
      totalIssued: 0,
      fullyDilutedTotal: 0,
      esopShares: 0,
    });
  });

  it("with svi account: filters by email, sections.svi mirrors row + dimensions from snapshot", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT };
    state.responses.svi_snapshots = {
      dimension_scores: {
        ftv: 80,
        mpc: 70,
        ptd: 60,
        tre: 50,
        cgh: 40,
        iri: 30,
        lco: 20,
        svm: 10,
      },
    };
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);

    // svi_accounts filter: keyed on the session user's email (not body-supplied)
    expect(state.eqFilters.svi_accounts).toEqual([
      { col: "email", val: "founder@example.com" },
    ]);

    const inserted = state.inserts.data_rooms![0]!;
    const sections = inserted.sections as Record<string, unknown>;
    const svi = sections.svi as {
      score: number;
      stage: number;
      startupName: string;
      dimensions: Record<string, number>;
    };
    expect(svi.score).toBe(140);
    expect(svi.stage).toBe(3);
    expect(svi.startupName).toBe("Acme");
    expect(svi.dimensions?.ftv).toBe(80);
  });

  it("computeValuation receives dimensions when snapshot present + maps numeric stage → stage bucket", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT, current_stage: 4 };
    state.responses.svi_snapshots = {
      dimension_scores: { ftv: 90, mpc: 80, ptd: 70, tre: 60, cgh: 50, iri: 40, lco: 30, svm: 20 },
    };
    state.responses.startup_metrics = {
      mrr_aud: 5000,
      arr_aud: 60000,
      revenue_growth_pct: 12,
      monthly_churn_pct: 3,
      burn_rate_aud: 20000,
      runway_months: 18,
    };
    await POST(postReq({}));
    expect(mocks.computeValuationMock).toHaveBeenCalledTimes(1);
    const input = mocks.computeValuationMock.mock.calls[0]![0] as {
      sviScore: number;
      stage: string;
      mrrAud: number;
      dimensions: Record<string, number>;
    };
    expect(input.sviScore).toBe(140);
    // mapStage: numericStage <= 4 → "mvp"
    expect(input.stage).toBe("mvp");
    expect(input.mrrAud).toBe(5000);
    expect(input.dimensions?.ftv).toBe(90);
  });

  it("mapStage covers all four bands (idea/validation/mvp/growth)", async () => {
    const cases: Array<{ stage: number; expected: string }> = [
      { stage: 0, expected: "idea" },
      { stage: 1, expected: "idea" },
      { stage: 2, expected: "validation" },
      { stage: 3, expected: "mvp" },
      { stage: 4, expected: "mvp" },
      { stage: 5, expected: "growth" },
      { stage: 99, expected: "growth" },
    ];
    for (const { stage, expected } of cases) {
      state = freshState();
      mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
      state.responses.svi_accounts = { ...SVI_ACCOUNT, current_stage: stage };
      await POST(postReq({}));
      const input = mocks.computeValuationMock.mock.calls.at(-1)![0] as {
        stage: string;
      };
      expect(input.stage).toBe(expected);
    }
  });

  it("valuation defaults current_svi to 100 and current_stage to 0 when both null", async () => {
    state.responses.svi_accounts = {
      id: "svi-1",
      current_svi: null,
      current_stage: null,
      startup_name: "Nully Co",
    };
    await POST(postReq({}));
    const input = mocks.computeValuationMock.mock.calls[0]![0] as {
      sviScore: number;
      stage: string;
    };
    expect(input.sviScore).toBe(100);
    expect(input.stage).toBe("idea");
  });

  it("computeValuation.dimensions is undefined when snapshot missing", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT };
    // No svi_snapshots response
    await POST(postReq({}));
    const input = mocks.computeValuationMock.mock.calls[0]![0] as {
      dimensions?: unknown;
    };
    expect(input.dimensions).toBeUndefined();
  });

  it("cap table: ownership_pct computed against fully-diluted total (issued + esop pool)", async () => {
    state.responses.share_classes = [
      { id: "c1", account_id: USER.id, name: "Ordinary", created_at: "2026-01-01" },
    ];
    state.responses.shareholders = [
      { id: "sh1", account_id: USER.id, shares_held: 6000, created_at: "2026-01-01" },
      { id: "sh2", account_id: USER.id, shares_held: 2000, created_at: "2026-01-02" },
    ];
    state.responses.esop_pool = { id: "esop1", account_id: USER.id, total_pool_shares: 2000 };

    await POST(postReq({}));
    const inserted = state.inserts.data_rooms![0]!;
    const capTable = (inserted.sections as Record<string, unknown>).capTable as {
      shareholders: Array<{ ownership_pct: number; shares_held: number }>;
      summary: { totalIssued: number; fullyDilutedTotal: number; esopShares: number };
    };
    // fully-diluted total = 6000 + 2000 + 2000 = 10000
    expect(capTable.summary.totalIssued).toBe(8000);
    expect(capTable.summary.esopShares).toBe(2000);
    expect(capTable.summary.fullyDilutedTotal).toBe(10000);
    expect(capTable.shareholders[0]!.ownership_pct).toBe(60); // 6000/10000
    expect(capTable.shareholders[1]!.ownership_pct).toBe(20); // 2000/10000
  });

  it("cap table: ownership_pct is 0 when fully-diluted total is 0 (avoids divide-by-zero)", async () => {
    state.responses.shareholders = [
      { id: "sh1", account_id: USER.id, shares_held: 0, created_at: "2026-01-01" },
    ];
    await POST(postReq({}));
    const capTable = (state.inserts.data_rooms![0]!.sections as Record<string, unknown>).capTable as {
      shareholders: Array<{ ownership_pct: number }>;
    };
    expect(capTable.shareholders[0]!.ownership_pct).toBe(0);
  });

  it("cap table: esopShares defaults to 0 when esop_pool row is missing", async () => {
    state.responses.shareholders = [
      { id: "sh1", account_id: USER.id, shares_held: 1000, created_at: "2026-01-01" },
    ];
    await POST(postReq({}));
    const capTable = (state.inserts.data_rooms![0]!.sections as Record<string, unknown>).capTable as {
      summary: { esopShares: number; fullyDilutedTotal: number };
    };
    expect(capTable.summary.esopShares).toBe(0);
    expect(capTable.summary.fullyDilutedTotal).toBe(1000);
  });

  it("cap table queries filter by account_id (session user's id — never body-supplied)", async () => {
    await POST(postReq({}));
    expect(state.eqFilters.share_classes).toEqual([{ col: "account_id", val: USER.id }]);
    expect(state.eqFilters.shareholders).toEqual([{ col: "account_id", val: USER.id }]);
    expect(state.eqFilters.esop_pool).toEqual([{ col: "account_id", val: USER.id }]);
  });

  it("evidence: bounded to 100 rows, ordered by created_at desc, empty when svi account missing", async () => {
    // No svi account → evidence stays []
    await POST(postReq({}));
    const sections = state.inserts.data_rooms![0]!.sections as Record<string, unknown>;
    expect(sections.evidence).toEqual([]);
    expect(state.orderCalls.svi_evidence).toBeUndefined();
  });

  it("evidence: reads only when svi account exists", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT };
    state.responses.svi_evidence = [
      { id: "e1", label: "Pilot", dimension: "mpc", evidence_type: "doc", confidence_level: "high", created_at: "2026-06-01" },
    ];
    await POST(postReq({}));
    const sections = state.inserts.data_rooms![0]!.sections as Record<string, unknown>;
    expect(sections.evidence).toEqual([
      { id: "e1", label: "Pilot", dimension: "mpc", evidence_type: "doc", confidence_level: "high", created_at: "2026-06-01" },
    ]);
    expect(state.orderCalls.svi_evidence?.[0]).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
  });
});

// ---------------------------------------------------------------------------
// POST — token + persistence
// ---------------------------------------------------------------------------
describe("POST /api/investor-data-room — token + persistence", () => {
  it("happy path: inserts data_rooms row with account_id, email, token, sections, is_active=true, view_count=0", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT };
    mocks.newSlugMock.mockReturnValueOnce("tok_happy_xyz");
    const res = await POST(postReq({ title: "My Room" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.token).toBe("tok_happy_xyz");
    expect(body.url).toBe(
      "https://blockid.au/api/investor-data-room?token=tok_happy_xyz",
    );
    // Section keys are stable — the founder-facing UI keys off these
    expect(body.sections).toEqual(["svi", "valuation", "capTable", "evidence", "metrics"]);

    expect(state.inserts.data_rooms).toHaveLength(1);
    const row = state.inserts.data_rooms![0]!;
    expect(row.account_id).toBe(USER.id);
    expect(row.email).toBe(USER.email);
    expect(row.token).toBe("tok_happy_xyz");
    expect(row.title).toBe("My Room");
    expect(row.is_active).toBe(true);
    expect(row.view_count).toBe(0);
    expect(row.expires_at).toBeNull();
    expect(row.sections).toBeDefined();
  });

  it("title default: falls back to `<startup_name> Data Room` when body.title is absent", async () => {
    state.responses.svi_accounts = { ...SVI_ACCOUNT, startup_name: "Widgetco" };
    await POST(postReq({}));
    expect(state.inserts.data_rooms![0]!.title).toBe("Widgetco Data Room");
  });

  it("title default: falls back to 'BlockID Data Room' when no svi account", async () => {
    await POST(postReq({}));
    expect(state.inserts.data_rooms![0]!.title).toBe("BlockID Data Room");
  });

  it("expiresInDays: converted to ISO string relative to now (±5s window)", async () => {
    const before = Date.now();
    await POST(postReq({ expiresInDays: 7 }));
    const after = Date.now();
    const iso = state.inserts.data_rooms![0]!.expires_at as string;
    const t = Date.parse(iso);
    expect(t).toBeGreaterThanOrEqual(before + 7 * 86_400_000 - 5000);
    expect(t).toBeLessThanOrEqual(after + 7 * 86_400_000 + 5000);
  });

  it("expiresInDays: falsy (0) yields null — the founder gets a never-expiring link", async () => {
    // Business rule: `body.expiresInDays ? ... : null` — 0 falls into the null branch.
    await POST(postReq({ expiresInDays: 0 }));
    expect(state.inserts.data_rooms![0]!.expires_at).toBeNull();
  });

  it("500 when the data_rooms insert fails — token never surfaced to founder", async () => {
    state.errors.data_rooms = { message: "duplicate token" };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postReq({}));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Failed to create data room",
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("siteUrl: strips trailing slash from NEXT_PUBLIC_SITE_URL so the shared URL never doubles up", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    mocks.newSlugMock.mockReturnValueOnce("tok_slash");
    const res = await POST(postReq({}));
    const body = await json(res);
    expect(body.url).toBe("https://blockid.au/api/investor-data-room?token=tok_slash");
  });

  it("siteUrl: defaults to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is absent", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mocks.newSlugMock.mockReturnValueOnce("tok_local");
    const res = await POST(postReq({}));
    const body = await json(res);
    expect(body.url).toBe(
      "http://localhost:3000/api/investor-data-room?token=tok_local",
    );
  });

  it("newSlug is called exactly once per POST — two POSTs mint two distinct tokens", async () => {
    mocks.newSlugMock.mockReturnValueOnce("tok_a").mockReturnValueOnce("tok_b");
    await POST(postReq({}));
    // Fresh supabase so inserts do not collide
    state = freshState();
    mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
    await POST(postReq({}));
    expect(mocks.newSlugMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// GET — public read
// ---------------------------------------------------------------------------
describe("GET /api/investor-data-room", () => {
  it("400 when the token query parameter is absent — supabase never touched", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "token query parameter is required",
    });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("503 when supabase not configured", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET(getReq("tok_x"));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Database not configured",
    });
  });

  it("404 when data_rooms row missing — inactive rows are indistinguishable from missing (both filter to null)", async () => {
    // No response configured → maybeSingle resolves to { data: null }
    const res = await GET(getReq("tok_missing"));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Data room not found or inactive",
    });
    // Filter set matches: eq(token, ...) + eq(is_active, true)
    expect(state.eqFilters.data_rooms).toEqual([
      { col: "token", val: "tok_missing" },
      { col: "is_active", val: true },
    ]);
  });

  it("410 when expires_at is in the past", async () => {
    state.responses.data_rooms = {
      id: "r1",
      title: "T",
      sections: {},
      created_at: "2026-06-01",
      view_count: 5,
      expires_at: "2020-01-01T00:00:00Z",
    };
    const res = await GET(getReq("tok_expired"));
    expect(res.status).toBe(410);
    expect(await json(res)).toEqual({
      ok: false,
      error: "This data room link has expired",
    });
    // The write-side must NOT fire on an expired read (no view leaks, no bumped counter)
    expect(state.inserts.data_room_views ?? []).toHaveLength(0);
    expect(state.updates.data_rooms ?? []).toHaveLength(0);
  });

  it("null expires_at is treated as never-expiring — happy 200", async () => {
    state.responses.data_rooms = {
      id: "r1",
      title: "Acme Room",
      sections: { svi: { score: 140 } },
      created_at: "2026-06-01",
      view_count: 5,
      expires_at: null,
    };
    const res = await GET(getReq("tok_perm"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.title).toBe("Acme Room");
    expect(body.sections).toEqual({ svi: { score: 140 } });
    // viewCount is returned as (stored + 1) — the response reflects the row
    // after the bump so the founder-facing dashboard's count stays consistent
    // with what the investor UI shows in the same round-trip.
    expect(body.viewCount).toBe(6);
  });

  it("happy path bumps view_count by 1 in the DB and records a hashed IP view", async () => {
    state.responses.data_rooms = {
      id: "r-happy",
      title: "T",
      sections: {},
      created_at: "2026-01-01",
      view_count: 9,
      expires_at: null,
    };
    await GET(getReq("tok_go", { xff: "203.0.113.42" }));
    expect(state.updates.data_rooms).toHaveLength(1);
    expect(state.updates.data_rooms![0]).toEqual({ view_count: 10 });
    expect(state.inserts.data_room_views).toHaveLength(1);
    const viewRow = state.inserts.data_room_views![0]!;
    expect(viewRow.data_room_id).toBe("r-happy");
    // hashIp: sha256(ip) sliced to 16 hex chars — pins the format so the
    // audit column never accidentally logs the raw IP.
    expect(viewRow.viewer_ip_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(viewRow.viewer_ip_hash).not.toBe("203.0.113.42");
  });

  it("x-forwarded-for: takes only the first hop (client, not proxy chain)", async () => {
    state.responses.data_rooms = {
      id: "r1",
      title: "T",
      sections: {},
      created_at: "2026-01-01",
      view_count: 0,
      expires_at: null,
    };
    await GET(getReq("tok_chain", { xff: "1.1.1.1, 2.2.2.2, 3.3.3.3" }));
    // Compute the expected hash for the first hop and confirm it landed
    const { createHash } = await import("crypto");
    const expected = createHash("sha256").update("1.1.1.1").digest("hex").slice(0, 16);
    expect(state.inserts.data_room_views![0]!.viewer_ip_hash).toBe(expected);
  });

  it("missing x-forwarded-for: falls back to hash('unknown') — attribution row is still recorded", async () => {
    state.responses.data_rooms = {
      id: "r1",
      title: "T",
      sections: {},
      created_at: "2026-01-01",
      view_count: 0,
      expires_at: null,
    };
    await GET(getReq("tok_noxff"));
    const { createHash } = await import("crypto");
    const expected = createHash("sha256").update("unknown").digest("hex").slice(0, 16);
    expect(state.inserts.data_room_views![0]!.viewer_ip_hash).toBe(expected);
  });

  it("hashIp is deterministic — the same IP maps to the same 16-hex prefix across calls", async () => {
    state.responses.data_rooms = {
      id: "r1",
      title: "T",
      sections: {},
      created_at: "2026-01-01",
      view_count: 0,
      expires_at: null,
    };
    await GET(getReq("t1", { xff: "9.9.9.9" }));
    await GET(getReq("t2", { xff: "9.9.9.9" }));
    const [a, b] = state.inserts.data_room_views!;
    expect(a!.viewer_ip_hash).toBe(b!.viewer_ip_hash);
  });
});
