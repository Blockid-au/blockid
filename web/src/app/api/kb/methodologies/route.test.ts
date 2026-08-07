// Unit tests for GET /api/kb/methodologies — P9-kb-methodologies-route-test.
//
// The route is a public, read-only lookup that lists KB methodologies for
// the /kb browser + the CFO / CLO / CTO agent-picker dropdowns. It has
// three exit paths — supabase not configured (200, methodologies:[]),
// db error (500, error:message), happy path (200, methodologies:rows) —
// with an optional ?type= filter that is *only* honoured when the value
// is a member of the frozen VALID_TYPES allowlist (unrecognised types
// are silently ignored — never surface an "invalid type" 4xx, because
// the KB browser depends on a full list on any garbage query string).
//
// Silent regressions this pins against:
//   - dropping `isSupabaseConfigured()` and NPE'ing when env is stripped
//     in dev (the route is called on every /kb page render);
//   - swapping the soft-fail unconfigured branch for a 5xx and breaking
//     the KB browser for every founder in a stripped-env deploy;
//   - widening VALID_TYPES to accept arbitrary user input and letting a
//     `?type=<sql>` slip into `.eq("type", …)` — supabase-js still
//     parameterises but the allowlist is the layer that documents the
//     contract and stops a leak on any driver-side regression;
//   - dropping `.order("name")` and returning methodologies in insert
//     order (the dropdown lives on a shared component that expects
//     alphabetical);
//   - renaming the `kb_methodologies` table without updating the route;
//   - coalescing `null` data to something other than `[]` (the KB
//     browser + agent-picker both do `.map(...)` and would crash).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, dynamic } from "./route";

interface FakeState {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  table: string | null;
  selectCols: string | null;
  orderCol: string | null;
  eqCol: string | null;
  eqVal: unknown;
  fromCalls: number;
  selectCalls: number;
  orderCalls: number;
  eqCalls: number;
  awaitCalls: number;
}

const state: FakeState = {
  data: [],
  error: null,
  table: null,
  selectCols: null,
  orderCol: null,
  eqCol: null,
  eqVal: null,
  fromCalls: 0,
  selectCalls: 0,
  orderCalls: 0,
  eqCalls: 0,
  awaitCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      // Chain-builder shared shape — every step returns the same thenable
      // so both the pre-`.eq()` (no-type / invalid-type) and post-`.eq()`
      // (valid-type) query variants can be awaited.
      const chain: {
        select: (cols: string) => typeof chain;
        order: (col: string) => typeof chain;
        eq: (col: string, val: unknown) => typeof chain;
        then: (
          onFulfilled: (v: {
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }) => unknown,
        ) => Promise<unknown>;
      } = {
        select(cols: string) {
          state.selectCalls += 1;
          state.selectCols = cols;
          return chain;
        },
        order(col: string) {
          state.orderCalls += 1;
          state.orderCol = col;
          return chain;
        },
        eq(col: string, val: unknown) {
          state.eqCalls += 1;
          state.eqCol = col;
          state.eqVal = val;
          return chain;
        },
        then(onFulfilled) {
          state.awaitCalls += 1;
          return Promise.resolve({
            data: state.data,
            error: state.error,
          }).then(onFulfilled);
        },
      };
      return chain;
    },
  };
}

function resetState() {
  state.data = [];
  state.error = null;
  state.table = null;
  state.selectCols = null;
  state.orderCol = null;
  state.eqCol = null;
  state.eqVal = null;
  state.fromCalls = 0;
  state.selectCalls = 0;
  state.orderCalls = 0;
  state.eqCalls = 0;
  state.awaitCalls = 0;
}

function req(query = ""): NextRequest {
  return new NextRequest(`http://x/api/kb/methodologies${query}`);
}

beforeEach(() => {
  resetState();
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("GET /api/kb/methodologies — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-request filters never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/kb/methodologies — supabase-not-configured branch", () => {
  it("returns 200 with {methodologies:[]} when isSupabaseConfigured() is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ methodologies: [] });
  });

  it("does NOT touch supabase when env is unconfigured (guard short-circuits before getSupabaseAdmin)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET(req());
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("returns 200 (not a 5xx) when unconfigured — the /kb browser must still render on a stripped-env dev server", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req("?type=valuation_method"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/kb/methodologies — happy path (no type filter)", () => {
  it("returns 200 with {methodologies: rows} on a clean fetch", async () => {
    state.data = [
      { id: "m1", name: "DCF", type: "valuation_method" },
      { id: "m2", name: "Venture Capital Method", type: "valuation_method" },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ methodologies: state.data });
  });

  it("queries the kb_methodologies table (not a rename like methodologies or kb_methods)", async () => {
    await GET(req());
    expect(state.table).toBe("kb_methodologies");
  });

  it("selects all columns with '*' so a schema-added column surfaces without a route redeploy", async () => {
    await GET(req());
    expect(state.selectCols).toBe("*");
  });

  it("orders by name so the dropdown renders alphabetically (insert-order would surface duplicates + a shuffling UI on every reseed)", async () => {
    await GET(req());
    expect(state.orderCol).toBe("name");
    expect(state.orderCalls).toBe(1);
  });

  it("does NOT call .eq() when no ?type= is supplied (dropping the guard would make the empty-string fall through into a `.eq('type', '')` that returns zero rows)", async () => {
    await GET(req());
    expect(state.eqCalls).toBe(0);
    expect(state.eqCol).toBeNull();
  });

  it("makes exactly one from/select/order chain (no wasted round-trip)", async () => {
    await GET(req());
    expect(state.fromCalls).toBe(1);
    expect(state.selectCalls).toBe(1);
    expect(state.orderCalls).toBe(1);
    expect(state.awaitCalls).toBe(1);
  });

  it("coerces a null data payload to [] (KB browser + agent-picker both do `.map(...)` and crash on null)", async () => {
    state.data = null;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ methodologies: [] });
  });

  it("returns ok on zero rows (empty allowlist is a valid state for a fresh env with no seeded methodologies)", async () => {
    state.data = [];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ methodologies: [] });
  });

  it("preserves non-string leaf values in the returned rows (booleans, nulls, nested objects)", async () => {
    state.data = [
      {
        id: "m9",
        name: "Berkus",
        type: "valuation_method",
        is_active: true,
        deprecated_at: null,
        inputs: ["team", "product", "traction"],
      },
    ];
    const body = await (await GET(req())).json();
    expect(body.methodologies[0]).toEqual(state.data[0]);
  });

  it("does NOT wrap the row array — the top-level envelope is exactly {methodologies}", async () => {
    state.data = [{ id: "m1", name: "DCF" }];
    const body = await (await GET(req())).json();
    expect(Object.keys(body).sort()).toEqual(["methodologies"]);
  });
});

describe("GET /api/kb/methodologies — happy path (valid ?type= filter)", () => {
  const VALID_TYPES = [
    "valuation_method",
    "svi_dimension",
    "equity_model",
    "financial_template",
    "process",
  ] as const;

  for (const t of VALID_TYPES) {
    it(`honours ?type=${t} by chaining .eq("type", "${t}") after .order()`, async () => {
      state.data = [{ id: "m1", name: "X", type: t }];
      await GET(req(`?type=${t}`));
      expect(state.eqCalls).toBe(1);
      expect(state.eqCol).toBe("type");
      expect(state.eqVal).toBe(t);
    });
  }

  it("applies .eq after .order (route chains .order first, then conditionally .eq — this order matters so the fake mirrors production driver behaviour)", async () => {
    await GET(req("?type=valuation_method"));
    expect(state.orderCalls).toBe(1);
    expect(state.eqCalls).toBe(1);
  });

  it("returns 200 with the filtered rows when a valid type is supplied", async () => {
    state.data = [{ id: "m1", name: "DCF", type: "valuation_method" }];
    const res = await GET(req("?type=valuation_method"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.methodologies).toEqual(state.data);
  });
});

describe("GET /api/kb/methodologies — invalid ?type= filter", () => {
  it("silently ignores an unrecognised ?type= (dropdown must still render on a garbage query string — never surface a 4xx)", async () => {
    state.data = [{ id: "m1", name: "DCF" }];
    const res = await GET(req("?type=cats_and_dogs"));
    expect(res.status).toBe(200);
    expect(state.eqCalls).toBe(0);
  });

  it("silently ignores an empty ?type= (the `type &&` truthiness guard short-circuits before the allowlist check)", async () => {
    const res = await GET(req("?type="));
    expect(res.status).toBe(200);
    expect(state.eqCalls).toBe(0);
  });

  it("silently ignores a ?type= that differs from an allowlisted value only in case (allowlist is exact-match — VALID_TYPES.has('Valuation_Method') is false)", async () => {
    const res = await GET(req("?type=Valuation_Method"));
    expect(res.status).toBe(200);
    expect(state.eqCalls).toBe(0);
  });

  it("silently ignores a ?type= that contains SQL-like tokens (the allowlist is the documented layer that stops a leak on any driver regression)", async () => {
    const res = await GET(req("?type=valuation_method%27%20OR%201%3D1"));
    expect(res.status).toBe(200);
    expect(state.eqCalls).toBe(0);
  });

  it("passes through a valid ?type= even with extra unrelated query params (only the `type` key is consumed)", async () => {
    await GET(req("?type=process&limit=999&offset=1"));
    expect(state.eqCalls).toBe(1);
    expect(state.eqVal).toBe("process");
  });
});

describe("GET /api/kb/methodologies — db error branch", () => {
  it("returns 500 with {error:message} when supabase surfaces an error", async () => {
    state.error = { message: "boom" };
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "boom" });
  });

  it("surfaces the underlying error message verbatim (no wrapping / no leak-safe redaction)", async () => {
    state.error = { message: 'relation "kb_methodologies" does not exist' };
    const body = await (await GET(req())).json();
    expect(body.error).toBe('relation "kb_methodologies" does not exist');
  });

  it("prefers the error branch over the data branch when both are populated (defensive on driver behaviour)", async () => {
    state.error = { message: "explosion" };
    state.data = [{ id: "leaked", name: "would-be-returned" }];
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "explosion" });
    expect(body.methodologies).toBeUndefined();
  });

  it("still runs the DB query when an error surfaces (proves the error is DB-authoritative, not a routing short-circuit)", async () => {
    state.error = { message: "boom" };
    await GET(req());
    expect(state.fromCalls).toBe(1);
    expect(state.awaitCalls).toBe(1);
  });

  it("returns 500 on error even when a valid ?type= was supplied (error branch dominates the filter branch)", async () => {
    state.error = { message: "boom" };
    const res = await GET(req("?type=valuation_method"));
    expect(res.status).toBe(500);
    expect(state.eqCalls).toBe(1);
  });
});
