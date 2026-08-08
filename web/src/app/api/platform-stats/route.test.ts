// Unit tests for GET /api/platform-stats — P9-platform-stats-route.
//
// Route lives at src/app/api/platform-stats/route.ts. It is a PUBLIC
// (unauthenticated) read-only endpoint that powers directory listing
// widgets (F6S / LinkedIn embed / /team page hero stats) with live
// counts sourced from six parallel Supabase queries plus a filesystem
// walk of web/content/insights/. Directory listings are the top-of-
// funnel that seed the P9_ship "regression tests for legal + walkthrough
// + ship surfaces" mandate — a silent regression here (e.g. dropping
// the `head: true` on the count queries and paying a full-table scan
// per hit; dropping the graceful-degrade path when `getSupabaseAdmin()`
// returns null and 500ing every directory listing when the service role
// env is misconfigured; dropping the try/catch envelope on the happy
// path so a single query timeout takes down the whole /team hero; or
// letting the caching header regress from `s-maxage=3600` to `no-store`
// and hammering the origin on every crawler hit) is a top-of-funnel
// leak the platform can't afford.
//
// Route was previously untested — pins the auth-free contract, the
// graceful-degrade paths, the six parallel query wiring (correct tables,
// filters, count-only projections), the `formatValuation` helper's
// M/K boundaries, the `averageSVI` divide-by-zero guard, the static
// `companyInfo()` block (Auschain ACN/ABN — see [[business_entity]]),
// and the cache-control headers on every response branch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SelectCapture {
  projection: unknown;
  opts?: { count?: string; head?: boolean };
}

interface Query {
  table: string;
  select: SelectCapture;
  filter?: { col: string; val: unknown; op: "eq" | "neq" };
}

interface FakeState {
  queries: Query[];
  responses: Map<string, unknown>;
}

const state: FakeState = {
  queries: [],
  responses: new Map(),
};

function keyFor(
  table: string,
  head: boolean,
  filter: Query["filter"],
): string {
  const f = filter ? `${filter.op}:${filter.col}=${filter.val}` : "none";
  return `${table}|head=${head}|${f}`;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        select(projection: unknown, opts?: { count?: string; head?: boolean }) {
          const select: SelectCapture = { projection, opts };
          let filter: Query["filter"] | undefined;
          const thenable = {
            eq(col: string, val: unknown) {
              filter = { col, val, op: "eq" as const };
              return thenable;
            },
            neq(col: string, val: unknown) {
              filter = { col, val, op: "neq" as const };
              return thenable;
            },
            then(
              resolve: (r: unknown) => void,
              reject?: (r: unknown) => void,
            ) {
              const query: Query = { table, select, filter };
              state.queries.push(query);
              const head = opts?.head === true;
              const response = state.responses.get(keyFor(table, head, filter));
              if (response instanceof Error) {
                if (reject) reject(response);
                else throw response;
                return;
              }
              resolve(response ?? { data: null, count: null, error: null });
            },
          };
          return thenable;
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET } from "./route";

function resetState() {
  state.queries = [];
  state.responses = new Map();
}

function stubCount(
  table: string,
  filter: Query["filter"] | undefined,
  response: { data?: unknown; count?: number | null; error?: unknown },
) {
  state.responses.set(keyFor(table, true, filter), response);
}

function stubData(
  table: string,
  filter: Query["filter"] | undefined,
  response: { data?: unknown; count?: number | null; error?: unknown },
) {
  state.responses.set(keyFor(table, false, filter), response);
}

beforeEach(() => {
  resetState();
  getSupabaseAdminMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/platform-stats — defaults and envelope", () => {
  it("returns defaults with a real article count when Supabase is null (env-degraded mode)", async () => {
    // `getSupabaseAdmin()` returns null in local dev without SUPABASE_SERVICE_ROLE_KEY.
    // Directory listings must still render — every counter goes to 0 except the
    // filesystem-derived `articles` count and the hard-coded `tools` / `monthlyVisitors`.
    getSupabaseAdminMock.mockReturnValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.metrics.founders).toBe(0);
    expect(body.metrics.analyses).toBe(0);
    expect(body.metrics.valuationsTracked).toBe("$0+");
    expect(body.metrics.tools).toBe(10);
    expect(body.metrics.monthlyVisitors).toBe(500);
    expect(body.metrics.evidenceItems).toBe(0);
    expect(body.metrics.connectedSources).toBe(0);
    expect(body.metrics.averageSVI).toBe(0);
    expect(body.metrics.paidCustomers).toBe(0);
    // articles is read from disk — must be a positive integer (repo ships ≥1 .md).
    expect(body.metrics.articles).toBeGreaterThan(0);
    expect(Number.isInteger(body.metrics.articles)).toBe(true);
  });

  it("skips supabase entirely when the admin client is null (no wasted round-trips)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    // No queries should have been captured — proves the guard short-circuits.
    expect(state.queries).toHaveLength(0);
  });

  it("sets the 1h edge cache header on the null-supabase branch", async () => {
    // The cache header is what makes public directory listings cheap under
    // crawler load — a regression here would double origin cost on every
    // /team hero render.
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=7200",
    );
  });

  it("returns ISO-8601 `updatedAt` on every response branch", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    const body = await res.json();
    // Pins the shape the widget consumers `Date.parse` in their client-side render.
    expect(() => new Date(body.updatedAt).toISOString()).not.toThrow();
    expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns the static Auschain company block on every response (see [[business_entity]])", async () => {
    // The public directory profile block must carry the Auschain legal identity
    // (ACN 659 615 111, ABN 79 659 615 111, Sydney NSW) verbatim — a copy-paste
    // typo here would break every F6S / LinkedIn / directory embed that reads
    // the `company` field for the ABN registration mirror.
    getSupabaseAdminMock.mockReturnValue(null);
    const body = await (await GET()).json();
    expect(body.company).toEqual({
      name: "BlockID.au",
      legal: "Auschain PTY LTD",
      acn: "659 615 111",
      abn: "79 659 615 111",
      founded: 2023,
      location: "Sydney, NSW, Australia",
      industry: ["SaaS", "AI/ML", "FinTech", "Startup Tools"],
      stage: "Pre-seed",
      website: "https://blockid.au",
      tagline:
        "The agentic AI valuation platform for business growth from day one",
    });
  });

  it("does NOT set _fallback: true on the null-supabase branch (only on the caught-error path)", async () => {
    // Directory listings distinguish a "degraded but complete" default response
    // (env not configured) from a "we tried Supabase and it threw" fallback.
    // Only the latter carries the `_fallback: true` marker.
    getSupabaseAdminMock.mockReturnValue(null);
    const body = await (await GET()).json();
    expect(body._fallback).toBeUndefined();
  });
});

describe("GET /api/platform-stats — supabase happy path", () => {
  function stubHappyPath(opts: {
    founders?: number;
    analyses?: number;
    sviRows?: { current_svi: number }[];
    evidence?: number;
    connected?: number;
    paid?: number;
  }) {
    // Two svi_accounts calls: (1) count-only head:true, (2) data-only .select("current_svi").
    stubCount("svi_accounts", undefined, {
      count: opts.founders ?? 0,
      error: null,
    });
    stubData("svi_accounts", undefined, {
      data: opts.sviRows ?? [],
      error: null,
    });
    stubCount("svi_analyses", undefined, {
      count: opts.analyses ?? 0,
      error: null,
    });
    stubCount("svi_evidence", undefined, {
      count: opts.evidence ?? 0,
      error: null,
    });
    stubCount(
      "svi_evidence",
      { col: "confidence_level", val: "connected_source", op: "eq" },
      { count: opts.connected ?? 0, error: null },
    );
    stubCount(
      "app_users",
      { col: "plan", val: "free", op: "neq" },
      { count: opts.paid ?? 0, error: null },
    );
  }

  it("issues all six queries in parallel against the expected tables", async () => {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({});
    await GET();

    const tables = state.queries.map((q) => q.table).sort();
    // svi_accounts twice (count-only, then data), svi_analyses once,
    // svi_evidence twice (count-only, then filtered), app_users once.
    expect(tables).toEqual([
      "app_users",
      "svi_accounts",
      "svi_accounts",
      "svi_analyses",
      "svi_evidence",
      "svi_evidence",
    ]);
  });

  it("uses head:true count-only on the four counter queries (no full-table scan)", async () => {
    // `select(..., { count: 'exact', head: true })` is the cheap PostgREST
    // count-only projection. Regressing to a full data fetch would multiply
    // origin work by rowcount on every crawler hit — silent perf disaster.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({});
    await GET();

    const headOnly = state.queries.filter((q) => {
      const sel = q.select as { opts?: { head?: boolean; count?: string } };
      return sel?.opts?.head === true && sel?.opts?.count === "exact";
    });
    // 4 head:true queries: founders count, analyses count, evidence count, connected count, paid count = 5.
    expect(headOnly.length).toBe(5);
  });

  it("applies the `plan != 'free'` filter on the paid customers count", async () => {
    // Regression: switching to `.eq('plan', 'paid')` would miss `growth` / `enterprise`
    // rows and under-count the paying founder base on every directory listing.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({});
    await GET();

    const paidQuery = state.queries.find((q) => q.table === "app_users");
    expect(paidQuery?.filter).toEqual({ col: "plan", val: "free", op: "neq" });
  });

  it("applies the `confidence_level = 'connected_source'` filter on connected sources", async () => {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({});
    await GET();

    const connectedQuery = state.queries.find(
      (q) => q.table === "svi_evidence" && q.filter,
    );
    expect(connectedQuery?.filter).toEqual({
      col: "confidence_level",
      val: "connected_source",
      op: "eq",
    });
  });

  it("returns live counters when supabase resolves successfully", async () => {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({
      founders: 42,
      analyses: 108,
      sviRows: [{ current_svi: 50 }, { current_svi: 70 }, { current_svi: 90 }],
      evidence: 500,
      connected: 120,
      paid: 12,
    });

    const body = await (await GET()).json();
    expect(body.metrics.founders).toBe(42);
    expect(body.metrics.analyses).toBe(108);
    expect(body.metrics.evidenceItems).toBe(500);
    expect(body.metrics.connectedSources).toBe(120);
    expect(body.metrics.paidCustomers).toBe(12);
  });

  it("computes averageSVI as the integer mean across current_svi rows", async () => {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({
      sviRows: [{ current_svi: 50 }, { current_svi: 70 }, { current_svi: 90 }],
    });
    const body = await (await GET()).json();
    // (50+70+90)/3 = 70 exact — Math.round to integer.
    expect(body.metrics.averageSVI).toBe(70);
  });

  it("rounds averageSVI to the nearest integer (banker's rounding NOT used)", async () => {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({
      // (10+11)/2 = 10.5 → Math.round → 11 (Math.round rounds half-up, NOT banker's)
      sviRows: [{ current_svi: 10 }, { current_svi: 11 }],
    });
    const body = await (await GET()).json();
    expect(body.metrics.averageSVI).toBe(11);
  });

  it("returns averageSVI = 0 when the svi_accounts data array is empty (divide-by-zero guard)", async () => {
    // A brand-new Supabase project has no rows — the divide would produce NaN
    // without the `length > 0` guard, which would then serialise as `null` and
    // break every widget's numeric formatter.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({ sviRows: [] });
    const body = await (await GET()).json();
    expect(body.metrics.averageSVI).toBe(0);
  });

  it("returns averageSVI = 0 when the svi_accounts data payload is null (defensive)", async () => {
    // PostgREST can return `data: null` on RLS-denied or read-permission mismatch.
    // Route's `sviRows ?? []` coerces null → empty array so downstream `.reduce`
    // never throws. Pin this so a future refactor to `sviRows?.length` doesn't
    // reintroduce the crash.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubCount("svi_accounts", undefined, { count: 0, error: null });
    stubData("svi_accounts", undefined, { data: null, error: null });
    stubCount("svi_analyses", undefined, { count: 0, error: null });
    stubCount("svi_evidence", undefined, { count: 0, error: null });
    stubCount(
      "svi_evidence",
      { col: "confidence_level", val: "connected_source", op: "eq" },
      { count: 0, error: null },
    );
    stubCount(
      "app_users",
      { col: "plan", val: "free", op: "neq" },
      { count: 0, error: null },
    );

    const body = await (await GET()).json();
    expect(body.metrics.averageSVI).toBe(0);
  });

  it("skips null-valued current_svi rows without throwing (row.current_svi ?? 0)", async () => {
    // A pre-migration row could have current_svi = null. The route coerces
    // to 0 in the reduce — a regression to raw `row.current_svi` would
    // NaN-poison the sum and break `valuationsTracked` formatting.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubHappyPath({
      sviRows: [
        { current_svi: 100 },
        { current_svi: null as unknown as number },
        { current_svi: 200 },
      ],
    });
    const body = await (await GET()).json();
    // sum = 300 (null coerces to 0) → avg = 100
    expect(body.metrics.averageSVI).toBe(100);
    // valuation = 300 * 10_000 = 3,000,000 → "$3.0M+"
    expect(body.metrics.valuationsTracked).toBe("$3.0M+");
  });
});

describe("GET /api/platform-stats — formatValuation observed via valuationsTracked", () => {
  // formatValuation is not exported — observe via `sum * 10_000` scaling.
  function withSum(sum: number) {
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubCount("svi_accounts", undefined, { count: 0, error: null });
    stubData("svi_accounts", undefined, {
      data: [{ current_svi: sum }],
      error: null,
    });
    stubCount("svi_analyses", undefined, { count: 0, error: null });
    stubCount("svi_evidence", undefined, { count: 0, error: null });
    stubCount(
      "svi_evidence",
      { col: "confidence_level", val: "connected_source", op: "eq" },
      { count: 0, error: null },
    );
    stubCount(
      "app_users",
      { col: "plan", val: "free", op: "neq" },
      { count: 0, error: null },
    );
  }

  it("formats a sum ≥ 1M as `$X.XM+` with 1dp", async () => {
    // sum=250 → 250 * 10_000 = 2_500_000 → "$2.5M+"
    withSum(250);
    const body = await (await GET()).json();
    expect(body.metrics.valuationsTracked).toBe("$2.5M+");
  });

  it("formats a sum ≥ 1K but < 1M as `$X.XK+` with 1dp", async () => {
    // sum=10 → 100_000 → "$100.0K+"
    withSum(10);
    const body = await (await GET()).json();
    expect(body.metrics.valuationsTracked).toBe("$100.0K+");
  });

  it("formats a sum > 0 but < 1K as `$N+` with Math.round", async () => {
    // sum=0.05 → 500 → still ≥1K path? 500 < 1000 so fallback.
    withSum(0.05);
    const body = await (await GET()).json();
    expect(body.metrics.valuationsTracked).toBe("$500+");
  });

  it("formats a zero sum as `$0+` (Math.round(0) = 0)", async () => {
    withSum(0);
    const body = await (await GET()).json();
    expect(body.metrics.valuationsTracked).toBe("$0+");
  });

  it("respects the 1_000_000 boundary exactly (100 * 10_000 = 1_000_000 → M path)", async () => {
    // sum=100 → 1_000_000 → matches `amount >= 1_000_000` → M path → "$1.0M+"
    withSum(100);
    const body = await (await GET()).json();
    expect(body.metrics.valuationsTracked).toBe("$1.0M+");
  });
});

describe("GET /api/platform-stats — error paths", () => {
  it("returns defaults with _fallback: true when the parallel Promise.all throws", async () => {
    // Wire a supabase that throws on any select — the outer try/catch must
    // return defaults + `_fallback: true` (NOT a 500) so directory listings
    // never crash on a single query timeout.
    const throwingSupabase = {
      from() {
        return {
          select() {
            throw new Error("simulated timeout");
          },
        };
      },
    };
    getSupabaseAdminMock.mockReturnValue(throwingSupabase);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body._fallback).toBe(true);
    expect(body.metrics.founders).toBe(0);
    expect(body.metrics.averageSVI).toBe(0);
  });

  it("still ships the cache-control header on the caught-error branch", async () => {
    // Regression protection: the fallback path was easy to write without the
    // headers block, but then a bad query would blow cache TTL and pin the
    // origin under crawler load. Header must be identical on every branch.
    const throwingSupabase = {
      from() {
        return {
          select() {
            throw new Error("simulated");
          },
        };
      },
    };
    getSupabaseAdminMock.mockReturnValue(throwingSupabase);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=7200",
    );
  });

  it("still ships the Auschain company block on the caught-error branch", async () => {
    // Widgets keying on `body.company.acn` must never see a partial payload —
    // the fallback must include the full block, not defer it.
    const throwingSupabase = {
      from() {
        return {
          select() {
            throw new Error("simulated");
          },
        };
      },
    };
    getSupabaseAdminMock.mockReturnValue(throwingSupabase);
    const body = await (await GET()).json();
    expect(body.company.acn).toBe("659 615 111");
    expect(body.company.abn).toBe("79 659 615 111");
    expect(body.company.legal).toBe("Auschain PTY LTD");
  });

  it("logs the underlying error to console.error with the [blockid:platform-stats] tag", async () => {
    // Ops runbooks grep on the exact `[blockid:platform-stats] GET error` prefix —
    // pin the tag so a future refactor doesn't silently break log alerting.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingSupabase = {
      from() {
        return {
          select() {
            throw new Error("simulated");
          },
        };
      },
    };
    getSupabaseAdminMock.mockReturnValue(throwingSupabase);
    await GET();
    expect(spy).toHaveBeenCalled();
    const firstArg = spy.mock.calls[0]?.[0];
    expect(String(firstArg)).toContain("[blockid:platform-stats] GET error");
  });

  it("coerces missing PostgREST counts to 0 (`count ?? 0` guard on every counter)", async () => {
    // Any of the six count queries can return `count: null` on RLS-denied /
    // read-permission failure. The `?? 0` guard prevents null-in-numeric-field
    // that would break the widget's Intl.NumberFormat call.
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    stubCount("svi_accounts", undefined, { count: null, error: null });
    stubData("svi_accounts", undefined, { data: [], error: null });
    stubCount("svi_analyses", undefined, { count: null, error: null });
    stubCount("svi_evidence", undefined, { count: null, error: null });
    stubCount(
      "svi_evidence",
      { col: "confidence_level", val: "connected_source", op: "eq" },
      { count: null, error: null },
    );
    stubCount(
      "app_users",
      { col: "plan", val: "free", op: "neq" },
      { count: null, error: null },
    );

    const body = await (await GET()).json();
    expect(body.metrics.founders).toBe(0);
    expect(body.metrics.analyses).toBe(0);
    expect(body.metrics.evidenceItems).toBe(0);
    expect(body.metrics.connectedSources).toBe(0);
    expect(body.metrics.paidCustomers).toBe(0);
    // `_fallback` should NOT be set — this path is treated as success, just with zeroes.
    expect(body._fallback).toBeUndefined();
  });
});
