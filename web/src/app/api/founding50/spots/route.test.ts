// Colocated vitest for GET /api/founding50/spots — P9-founding50-spots-route-test.
//
// This route is the public counter that powers the "N of 100 spots left" copy
// on /founding50, the pricing hero, and the Startup Package upsell drawer. It
// runs on every page hit (dynamic="force-dynamic", revalidate=0), so a silent
// regression here is user-visible on the marquee marketing surface within one
// request. Five silent regressions this pins against:
//
//   - dropping the isSupabaseConfigured() short-circuit and letting an
//     unconfigured environment (e.g. a preview branch with no service-role
//     key) throw before the fallback fires — turning the marketing hero into
//     an error page;
//   - flipping the "supabase returns null" branch from graceful-fallback to
//     500 and blocking new founder signups when the users table read errors;
//   - dropping the .eq("plan_id", "founding50") filter and counting EVERY
//     user in the DB as a founding50 seat holder — the counter would go to
//     zero almost immediately after launch;
//   - swapping .select("id", {count:"exact", head:true}) to a full SELECT
//     and streaming every user row to the CDN each page hit;
//   - dropping the Math.max(0, ...) guard and returning a negative "remaining"
//     when we oversell (which we should never do — but the UI parses this as
//     an int and would render "-3 spots left" which breaks the CTA copy);
//   - dropping the try/catch and turning a transient supabase 500 into a
//     failed page render across every visitor for the duration of the
//     outage instead of falling back to "100 spots".
//
// The route contract is intentionally always-200 with an "ok:true" envelope —
// even the failure paths return a valid counter — because the caller renders
// this into a marketing hero and cannot show an error state. These tests pin
// that envelope on every branch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Fake supabase capturing query shape -----------------------------------

interface SelectCall {
  columns: string;
  options: unknown;
}
interface FakeState {
  lastTable: string | null;
  lastSelect: SelectCall | null;
  lastEq: { column: string; value: unknown } | null;
  countResult: number | null;
  countShouldThrow: boolean;
  callCount: number;
}

const state: FakeState = {
  lastTable: null,
  lastSelect: null,
  lastEq: null,
  countResult: 0,
  countShouldThrow: false,
  callCount: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.lastTable = table;
      return {
        select(columns: string, options: unknown) {
          state.lastSelect = { columns, options };
          return {
            eq(column: string, value: unknown) {
              state.lastEq = { column, value };
              state.callCount += 1;
              if (state.countShouldThrow) {
                return Promise.reject(new Error("supabase-boom"));
              }
              return Promise.resolve({ count: state.countResult, data: null, error: null });
            },
          };
        },
      };
    },
  };
}

function resetState() {
  state.lastTable = null;
  state.lastSelect = null;
  state.lastEq = null;
  state.countResult = 0;
  state.countShouldThrow = false;
  state.callCount = 0;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  getSupabaseAdminMock.mockReset().mockImplementation(() => makeFakeSupabase());
  resetState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("route module exports", () => {
  it("exports dynamic=force-dynamic so per-request counts are never CDN-cached", () => {
    // The counter changes as founders sign up; a stale CDN copy would show
    // "42 spots left" for hours after the last spot was actually taken.
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports revalidate=0 so Next.js does not ISR-cache this route", () => {
    expect(revalidate).toBe(0);
  });
});

describe("GET /api/founding50/spots — isSupabaseConfigured=false short-circuit", () => {
  it("returns the 100-spot fallback with 200 when supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("does NOT call getSupabaseAdmin when isSupabaseConfigured is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET();
    // The short-circuit must fire BEFORE the admin lookup so a preview branch
    // with no service-role key never even tries to build a client.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("does NOT touch the supabase query builder when unconfigured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET();
    expect(state.callCount).toBe(0);
    expect(state.lastTable).toBeNull();
    expect(state.lastSelect).toBeNull();
    expect(state.lastEq).toBeNull();
  });

  it("returns Content-Type application/json on the unconfigured fallback", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("GET /api/founding50/spots — getSupabaseAdmin returns null", () => {
  it("returns the 100-spot fallback when getSupabaseAdmin resolves to null", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("does NOT run the users query when the admin client is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(state.callCount).toBe(0);
    expect(state.lastTable).toBeNull();
  });
});

describe("GET /api/founding50/spots — happy path (users count)", () => {
  it("returns taken=0/remaining=100 for a fresh install with zero founding50 users", async () => {
    state.countResult = 0;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("subtracts count from TOTAL_SPOTS to compute remaining", async () => {
    state.countResult = 42;
    const res = await GET();
    const body = await json(res);
    expect(body.taken).toBe(42);
    expect(body.remaining).toBe(58);
    expect(body.total).toBe(100);
    expect(body.ok).toBe(true);
  });

  it("returns taken=100/remaining=0 when all spots are sold", async () => {
    state.countResult = 100;
    const res = await GET();
    expect(await json(res)).toEqual({
      ok: true,
      taken: 100,
      remaining: 0,
      total: 100,
    });
  });

  it("clamps remaining to 0 when we've oversold (count > TOTAL_SPOTS)", async () => {
    // The Math.max(0, TOTAL_SPOTS - taken) guard — a negative "remaining"
    // would render as "-3 spots left" in the marketing hero, which parses
    // as truthy and would break the CTA copy branch that hides the button
    // at "0 left". Pin the guard so a refactor cannot silently drop it.
    state.countResult = 103;
    const res = await GET();
    const body = await json(res);
    expect(body.taken).toBe(103);
    expect(body.remaining).toBe(0);
    expect(body.total).toBe(100);
  });

  it("coalesces a null count to taken=0 (?? 0 fallback)", async () => {
    // Supabase count is nullable when the head:true probe returns no rows
    // and the driver doesn't populate the header. The `count ?? 0` fallback
    // means null => 100 remaining, not NaN in the response.
    state.countResult = null;
    const res = await GET();
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });
});

describe("GET /api/founding50/spots — supabase query shape", () => {
  it("targets the users table (renaming would break the counter silently)", async () => {
    await GET();
    expect(state.lastTable).toBe("users");
  });

  it("uses select('id', {count:'exact', head:true}) — count-only, no row transfer", async () => {
    // A full SELECT would stream every row of the users table to the CDN on
    // every page hit — the head:true option is the only reason this route
    // is safe to call from the marketing hero.
    await GET();
    expect(state.lastSelect).toEqual({
      columns: "id",
      options: { count: "exact", head: true },
    });
  });

  it("filters by plan_id='founding50' (the tenancy boundary of the count)", async () => {
    // Dropping this .eq would count EVERY user in the DB as a founding50
    // seat holder and the counter would hit zero almost immediately.
    await GET();
    expect(state.lastEq).toEqual({ column: "plan_id", value: "founding50" });
  });

  it("runs the query exactly once per GET (no wasted round-trip)", async () => {
    await GET();
    expect(state.callCount).toBe(1);
  });
});

describe("GET /api/founding50/spots — thrown errors fall through to 100-spot fallback", () => {
  it("returns the fallback envelope with 200 when supabase.eq rejects", async () => {
    state.countShouldThrow = true;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("returns the fallback envelope when getSupabaseAdmin itself throws", async () => {
    // Client-construction can throw when env vars are half-set; the outer
    // try/catch should catch that too (getSupabaseAdmin() sits inside the try).
    getSupabaseAdminMock.mockImplementation(() => {
      throw new Error("client-boom");
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("returns the fallback envelope when supabase.from() throws synchronously", async () => {
    getSupabaseAdminMock.mockReturnValue({
      from() {
        throw new Error("from-boom");
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      taken: 0,
      remaining: 100,
      total: 100,
    });
  });

  it("does NOT leak the underlying error message to the client", async () => {
    // The catch block returns the fixed fallback shape — no error field, no
    // hint, no stack. Marketing surface must never render an error.
    state.countShouldThrow = true;
    const res = await GET();
    const body = await json(res);
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("detail");
    expect(body).not.toHaveProperty("stack");
    expect(JSON.stringify(body)).not.toMatch(/supabase-boom/);
  });
});

describe("GET /api/founding50/spots — response envelope invariants", () => {
  it("always includes {ok, taken, remaining, total} keys on the happy path", async () => {
    state.countResult = 7;
    const res = await GET();
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "remaining", "taken", "total"]);
  });

  it("always includes the same 4 keys on the unconfigured fallback", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "remaining", "taken", "total"]);
  });

  it("always includes the same 4 keys on the null-admin fallback", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "remaining", "taken", "total"]);
  });

  it("always includes the same 4 keys on the thrown-error fallback", async () => {
    state.countShouldThrow = true;
    const res = await GET();
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "remaining", "taken", "total"]);
  });

  it("total is always 100 (the pinned TOTAL_SPOTS constant)", async () => {
    // The founding cohort size is baked into the constant TOTAL_SPOTS=100.
    // A silent change to 50 or 200 would break the marketing copy across
    // every surface that reads this value.
    const cases = [
      async () => {
        isSupabaseConfiguredMock.mockReturnValue(false);
        return GET();
      },
      async () => {
        getSupabaseAdminMock.mockReturnValue(null);
        return GET();
      },
      async () => {
        state.countResult = 30;
        return GET();
      },
      async () => {
        state.countShouldThrow = true;
        return GET();
      },
    ];
    for (const run of cases) {
      resetState();
      isSupabaseConfiguredMock.mockReturnValue(true);
      getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
      const res = await run();
      const body = await json(res);
      expect(body.total).toBe(100);
    }
  });

  it("taken + remaining <= total for every non-oversold case (arithmetic invariant)", async () => {
    for (const n of [0, 1, 25, 50, 99, 100]) {
      resetState();
      isSupabaseConfiguredMock.mockReturnValue(true);
      getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
      state.countResult = n;
      const res = await GET();
      const body = await json(res);
      const taken = body.taken as number;
      const remaining = body.remaining as number;
      const total = body.total as number;
      expect(taken + remaining).toBe(total);
    }
  });

  it("ok is always the literal true (never truthy-but-non-bool)", async () => {
    // The caller checks `body.ok === true` before rendering — a `1` or a
    // string here would fail the strict-equality guard on the marketing
    // component.
    state.countResult = 15;
    const res = await GET();
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(typeof body.ok).toBe("boolean");
  });
});
