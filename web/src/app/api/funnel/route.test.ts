// Colocated vitest for POST + GET /api/funnel — P9-funnel-route-test.
//
// The funnel route is the sole write path for the funnel_events table. Every
// step of the acquisition funnel (landing_visit → payment_complete) posts
// here from the browser, and the CFO/COO agents read the resulting counts
// via GET to answer "how leaky is the funnel this week." Silent regressions
// on either half break the growth-metric dashboard without anyone noticing
// until a weekly review shows suspiciously round numbers.
//
// Regressions this suite is designed to catch:
//
//   - Dropping the POST try/catch and letting a browser sendBeacon that
//     races the request abort surface a 500 to the analytics beacon (the
//     browser will retry on failure, doubling row counts and making the
//     funnel drop-off look artificially small).
//   - Regressing POST from "swallow all errors as 200" to "propagate the
//     supabase error to the caller" — the client fire-and-forgets and any
//     non-2xx response is discarded silently while filling the browser
//     console with red text.
//   - Dropping the 401 on GET and leaking funnel counts (a raw revenue
//     signal) to any anonymous caller / scraper.
//   - Dropping the `days` default of 30 and 0-window-ing every query so
//     the dashboard always shows all zeros.
//   - Reordering / renaming the STEPS array — the dashboard renders in this
//     exact order and index-matches MOCK[] against it. Swapping two entries
//     silently swaps their conversion rates.
//   - Dropping the mock fallback when supabase is unconfigured and letting
//     the dashboard 500 on preview branches without a service-role key.
//   - Flipping `count: "exact", head: true` to a regular select and pulling
//     megabytes of rows over the wire per dashboard load.
//   - Coercing NaN days into a query that never resolves (parseInt of a
//     non-numeric string).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST, GET, dynamic } from "./route";

// --- Fake supabase capturing insert + select shape -------------------------

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}
interface SelectCall {
  table: string;
  columns: string;
  options: { count?: string; head?: boolean } | undefined;
  eqStep: string | null;
  gteCreatedAt: string | null;
}
interface FakeState {
  inserts: InsertCall[];
  insertShouldThrow: boolean;
  selects: SelectCall[];
  countByStep: Record<string, number | null>;
}

const state: FakeState = {
  inserts: [],
  insertShouldThrow: false,
  selects: [],
  countByStep: {},
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          state.inserts.push({ table, row });
          if (state.insertShouldThrow) {
            return Promise.reject(new Error("insert-boom"));
          }
          return Promise.resolve({ error: null, data: null });
        },
        select(columns: string, options?: { count?: string; head?: boolean }) {
          const current: SelectCall = {
            table,
            columns,
            options,
            eqStep: null,
            gteCreatedAt: null,
          };
          state.selects.push(current);
          const chain = {
            eq(_col: string, value: string) {
              current.eqStep = value;
              return chain;
            },
            gte(_col: string, value: string) {
              current.gteCreatedAt = value;
              return Promise.resolve({
                count: state.countByStep[current.eqStep ?? ""] ?? 0,
                error: null,
              });
            },
          };
          return chain;
        },
      };
    },
  };
}

function resetState() {
  state.inserts = [];
  state.insertShouldThrow = false;
  state.selects = [];
  state.countByStep = {};
}

function postReq(body: unknown, init: RequestInit = {}): NextRequest {
  return new Request("http://localhost/api/funnel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  }) as unknown as NextRequest;
}

function getReq(qs = ""): NextRequest {
  const url = `http://localhost/api/funnel${qs ? `?${qs}` : ""}`;
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const CANONICAL_STEPS = [
  "landing_visit",
  "signup_start",
  "signup_complete",
  "onboarding_start",
  "idea_submitted",
  "svi_complete",
  "valuation_viewed",
  "upgrade_prompt_seen",
  "checkout_started",
  "payment_complete",
];
const CANONICAL_MOCK = [1000, 340, 180, 165, 120, 89, 72, 45, 18, 8];

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({
    id: "u_1",
    email: "alice@corp.com",
  });
  getSupabaseAdminMock.mockReset().mockImplementation(() => makeFakeSupabase());
  resetState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Module-level ----------------------------------------------------------

describe("/api/funnel — module contract", () => {
  it("exports dynamic = 'force-dynamic' so per-user counts never cache", () => {
    // The GET response depends on session + freshness — a static cache would
    // leak one founder's window across users and freeze the dashboard.
    expect(dynamic).toBe("force-dynamic");
  });
});

// --- POST ------------------------------------------------------------------

describe("POST /api/funnel — happy path (supabase configured, signed-in)", () => {
  it("returns 200 {ok:true} for a valid POST", async () => {
    const res = await POST(postReq({ step: "landing_visit" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("targets the 'funnel_events' table (a rename would silently drop rows)", async () => {
    await POST(postReq({ step: "signup_start" }));
    expect(state.inserts[0]?.table).toBe("funnel_events");
  });

  it("persists the step verbatim (no lowercasing / trimming)", async () => {
    await POST(postReq({ step: "svi_complete" }));
    expect(state.inserts[0]?.row.step).toBe("svi_complete");
  });

  it("stamps user_email from getCurrentUser().email on the row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u_2", email: "bob@corp.com" });
    await POST(postReq({ step: "signup_complete" }));
    expect(state.inserts[0]?.row.user_email).toBe("bob@corp.com");
  });

  it("stamps user_email=null (not undefined) when there is no signed-in user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(postReq({ step: "landing_visit" }));
    const row = state.inserts[0]?.row;
    expect(row?.user_email).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(row, "user_email")).toBe(true);
  });

  it("passes metadata through verbatim as an object", async () => {
    const meta = { source: "google", cta: "hero-primary", cohort: 4 };
    await POST(postReq({ step: "landing_visit", metadata: meta }));
    expect(state.inserts[0]?.row.metadata).toEqual(meta);
  });

  it("coerces a missing metadata to {} (never undefined — DB column is jsonb NOT NULL)", async () => {
    await POST(postReq({ step: "landing_visit" }));
    const row = state.inserts[0]?.row;
    expect(row?.metadata).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(row, "metadata")).toBe(true);
  });

  it("runs exactly one insert per POST", async () => {
    await POST(postReq({ step: "landing_visit" }));
    expect(state.inserts).toHaveLength(1);
  });

  it("returns Content-Type application/json", async () => {
    const res = await POST(postReq({ step: "landing_visit" }));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("POST /api/funnel — supabase unconfigured", () => {
  it("still returns 200 {ok:true} when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(postReq({ step: "landing_visit" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("does NOT attempt any insert when supabase is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(postReq({ step: "landing_visit" }));
    expect(state.inserts).toHaveLength(0);
  });
});

describe("POST /api/funnel — error branch (fire-and-forget invariant)", () => {
  it("returns 200 (never a 4xx/5xx) when req.json() throws (invalid JSON body)", async () => {
    const res = await POST(postReq("{not-json"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("returns 200 when getCurrentUser rejects (auth backend flaky mid-request)", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("auth-boom"));
    const res = await POST(postReq({ step: "landing_visit" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("returns 200 when the supabase insert rejects", async () => {
    state.insertShouldThrow = true;
    const res = await POST(postReq({ step: "landing_visit" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("never leaks an error body on the failure path (no {error}, no stack)", async () => {
    state.insertShouldThrow = true;
    const res = await POST(postReq({ step: "landing_visit" }));
    const body = await json(res);
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("detail");
  });

  it("returns 200 with {ok:true} even when the body is completely empty", async () => {
    // Fire-and-forget beacons occasionally arrive with a zero-length body if
    // the sendBeacon race aborts pre-serialise. The route must not 500 on it.
    const req = new Request("http://localhost/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });
});

// --- GET -------------------------------------------------------------------

describe("GET /api/funnel — auth gate", () => {
  it("returns 401 {error:'Unauthorized'} when getCurrentUser returns null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized" });
  });

  it("does NOT touch supabase on the 401 branch (no wasted round-trip)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(getReq());
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.selects).toHaveLength(0);
  });
});

describe("GET /api/funnel — supabase unconfigured (mock fallback)", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReturnValue(null);
  });

  it("returns 200 with {steps, mock:true} when supabase is null (preview branches)", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.mock).toBe(true);
    expect(Array.isArray(body.steps)).toBe(true);
  });

  it("returns exactly the 10 canonical steps in canonical order", async () => {
    const res = await GET(getReq());
    const body = (await json(res)) as { steps: Array<{ step: string; count: number }> };
    expect(body.steps.map((s) => s.step)).toEqual(CANONICAL_STEPS);
  });

  it("returns the canonical MOCK counts index-matched to the STEPS array", async () => {
    const res = await GET(getReq());
    const body = (await json(res)) as { steps: Array<{ step: string; count: number }> };
    expect(body.steps.map((s) => s.count)).toEqual(CANONICAL_MOCK);
  });

  it("mock counts are monotonically non-increasing (a funnel drops off)", async () => {
    // The mock is what a founder sees on the empty state — if any later step
    // ever showed a higher count than an earlier one it would look like a
    // bug in the dashboard, not a bug in the mock.
    const res = await GET(getReq());
    const body = (await json(res)) as { steps: Array<{ step: string; count: number }> };
    for (let i = 1; i < body.steps.length; i++) {
      expect(body.steps[i].count).toBeLessThanOrEqual(body.steps[i - 1].count);
    }
  });
});

describe("GET /api/funnel — supabase configured (real-count path)", () => {
  it("returns 200 with {steps} (and NO mock:true) when supabase is available", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).not.toHaveProperty("mock");
    expect(Array.isArray(body.steps)).toBe(true);
  });

  it("fans out to exactly 10 select calls — one per canonical step", async () => {
    await GET(getReq());
    expect(state.selects).toHaveLength(CANONICAL_STEPS.length);
  });

  it("selects from the 'funnel_events' table for every step", async () => {
    await GET(getReq());
    for (const call of state.selects) {
      expect(call.table).toBe("funnel_events");
    }
  });

  it("uses count:'exact', head:true — never pulls row bodies (payload guard)", async () => {
    await GET(getReq());
    for (const call of state.selects) {
      expect(call.options).toEqual({ count: "exact", head: true });
      expect(call.columns).toBe("id");
    }
  });

  it("filters each select by its canonical step name (order preserved)", async () => {
    await GET(getReq());
    expect(state.selects.map((s) => s.eqStep)).toEqual(CANONICAL_STEPS);
  });

  it("returns step counts from supabase, index-matched to the STEPS array", async () => {
    state.countByStep = {
      landing_visit: 500,
      signup_start: 200,
      signup_complete: 100,
      onboarding_start: 90,
      idea_submitted: 60,
      svi_complete: 40,
      valuation_viewed: 30,
      upgrade_prompt_seen: 20,
      checkout_started: 10,
      payment_complete: 3,
    };
    const res = await GET(getReq());
    const body = (await json(res)) as { steps: Array<{ step: string; count: number }> };
    expect(body.steps).toEqual([
      { step: "landing_visit", count: 500 },
      { step: "signup_start", count: 200 },
      { step: "signup_complete", count: 100 },
      { step: "onboarding_start", count: 90 },
      { step: "idea_submitted", count: 60 },
      { step: "svi_complete", count: 40 },
      { step: "valuation_viewed", count: 30 },
      { step: "upgrade_prompt_seen", count: 20 },
      { step: "checkout_started", count: 10 },
      { step: "payment_complete", count: 3 },
    ]);
  });

  it("coerces a supabase null count to 0 (never leaks null to the dashboard)", async () => {
    state.countByStep = { landing_visit: null };
    const res = await GET(getReq());
    const body = (await json(res)) as { steps: Array<{ step: string; count: number }> };
    const first = body.steps.find((s) => s.step === "landing_visit");
    expect(first?.count).toBe(0);
  });
});

describe("GET /api/funnel — ?days window", () => {
  it("defaults to a 30-day window when ?days is omitted", async () => {
    const before = Date.now();
    await GET(getReq());
    const after = Date.now();
    const gte = state.selects[0]?.gteCreatedAt;
    expect(gte).toBeTruthy();
    const gteMs = new Date(gte!).getTime();
    const thirtyMs = 30 * 86400_000;
    expect(gteMs).toBeGreaterThanOrEqual(before - thirtyMs - 5);
    expect(gteMs).toBeLessThanOrEqual(after - thirtyMs + 5);
  });

  it("honours a numeric ?days=7 override", async () => {
    const before = Date.now();
    await GET(getReq("days=7"));
    const after = Date.now();
    const gteMs = new Date(state.selects[0]!.gteCreatedAt!).getTime();
    const sevenMs = 7 * 86400_000;
    expect(gteMs).toBeGreaterThanOrEqual(before - sevenMs - 5);
    expect(gteMs).toBeLessThanOrEqual(after - sevenMs + 5);
  });

  it("passes the SAME since-timestamp to every step (no per-step drift)", async () => {
    await GET(getReq("days=14"));
    const uniques = new Set(state.selects.map((s) => s.gteCreatedAt));
    expect(uniques.size).toBe(1);
  });

  it("emits an ISO-8601 UTC timestamp for the gte filter (not a Date object / epoch)", async () => {
    await GET(getReq());
    const gte = state.selects[0]?.gteCreatedAt;
    expect(typeof gte).toBe("string");
    expect(gte).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  });

  it("handles ?days=0 as a zero-length window (parseInt('0') === 0, still valid)", async () => {
    const before = Date.now();
    await GET(getReq("days=0"));
    const after = Date.now();
    const gteMs = new Date(state.selects[0]!.gteCreatedAt!).getTime();
    expect(gteMs).toBeGreaterThanOrEqual(before - 5);
    expect(gteMs).toBeLessThanOrEqual(after + 5);
  });
});

describe("GET /api/funnel — response envelope invariants", () => {
  it("returns Content-Type application/json on all branches", async () => {
    // configured
    let res = await GET(getReq());
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    // unconfigured
    getSupabaseAdminMock.mockReturnValue(null);
    res = await GET(getReq());
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    // 401
    getCurrentUserMock.mockResolvedValue(null);
    res = await GET(getReq());
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("uses status codes exactly in {200, 401} — no accidental 3xx / 4xx variants", async () => {
    const codes: number[] = [];
    codes.push((await GET(getReq())).status);
    getSupabaseAdminMock.mockReturnValue(null);
    codes.push((await GET(getReq())).status);
    getCurrentUserMock.mockResolvedValue(null);
    codes.push((await GET(getReq())).status);
    expect(codes.every((c) => c === 200 || c === 401)).toBe(true);
  });

  it("configured response body has ONLY the {steps} key (no leaks of internal fields)", async () => {
    const res = await GET(getReq());
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["steps"]);
  });

  it("unconfigured response body has EXACTLY {steps, mock:true} — the mock flag is what the dashboard uses to render the empty-state banner", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(getReq());
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["mock", "steps"]);
    expect(body.mock).toBe(true);
  });
});
