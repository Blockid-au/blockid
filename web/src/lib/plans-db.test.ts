import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the DB-backed plan-matrix reader used by every checkout
// / billing / entitlement surface. Sibling libs (accelerator-portal.test.ts,
// watchlist.test.ts) already codify the fake-supabase pattern this suite
// borrows. plans-db.ts was previously untested despite being the runtime
// source of truth for feature flags + usage limits + Stripe price ids — a
// silent regression here (e.g. dropping .eq("active", true), forgetting the
// GENERATED_PLANS fallback, or coercing a numeric-string usage_limit to NaN)
// would either 500 /billing during a Supabase blip or grandfather an
// inactive plan into a live checkout link.
//
// The suite pins:
//   * wire shape (table name, select column set, .eq("active", true),
//     .order("sort_order", { ascending: true })) so a rename catches
//   * fallback matrix (admin null / DB error / DB throw / empty data → the
//     bundled GENERATED_PLANS filtered by active + sorted by sort_order)
//   * every fromRow() normaliser branch (array | JSON string | garbage for
//     feature_flags; object | numeric-string | JSON string | garbage for
//     usage_limits; valid | invalid for interval; row-supplied vs env-var vs
//     null for stripe_price_id; column vs GENERATED_PLANS_BY_ID fallback)
//   * cache TTL: two calls within 60s reuse the same result reference; a
//     revalidatePlans() call invalidates
//   * getPlanCached: in-list hit / GENERATED_PLANS_BY_ID fallback / null

interface CapturedState {
  adminNull: boolean;
  throwOnFrom: boolean;
  result: { data: unknown; error: { code?: string; message: string } | null };
  captured: {
    from: string | null;
    selectCols: string | null;
    eqs: Array<{ col: string; val: unknown }>;
    order: { col: string; opts: { ascending: boolean } } | null;
    fromCallCount: number;
  };
}

const state: CapturedState = {
  adminNull: false,
  throwOnFrom: false,
  result: { data: [], error: null },
  captured: {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    fromCallCount: 0,
  },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from(table: string) {
        state.captured.from = table;
        state.captured.fromCallCount += 1;
        if (state.throwOnFrom) {
          throw new Error("boom from .from()");
        }
        const resolver = () => Promise.resolve(state.result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          eq(col: string, val: unknown) {
            state.captured.eqs.push({ col, val });
            return chain;
          },
          order(col: string, opts: { ascending: boolean }) {
            state.captured.order = { col, opts };
            return chain;
          },
          // Thenable so `await chain` resolves to state.result — plans-db
          // awaits the .order() terminator directly, no .maybeSingle() /
          // .single() call.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then(onFulfilled: any, onRejected: any) {
            return resolver().then(onFulfilled, onRejected);
          },
        };
        return {
          select(cols: string) {
            state.captured.selectCols = cols;
            return chain;
          },
        };
      },
    };
  },
}));

// Import after the mock is registered.
import { getPlansCached, getPlanCached, revalidatePlans } from "./plans-db";
import { GENERATED_PLANS } from "@/config/pricing/plans.generated";

const ACTIVE_GENERATED_COUNT = GENERATED_PLANS.filter((p) => p.active).length;

const originalEnv = { ...process.env };

beforeEach(() => {
  state.adminNull = false;
  state.throwOnFrom = false;
  state.result = { data: [], error: null };
  state.captured = {
    from: null,
    selectCols: null,
    eqs: [],
    order: null,
    fromCallCount: 0,
  };
  revalidatePlans();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  revalidatePlans();
});

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

describe("getPlansCached wire shape", () => {
  it("hits the plans table with the exact select column set", async () => {
    state.result = {
      data: [
        {
          id: "founder_growth",
          segment: "founder",
          name: "Growth",
          price_aud_cents: 9900,
          annual_price_aud_cents: 99000,
          interval: "monthly",
          trial_days: 7,
          stripe_price_id: "price_row_growth",
          feature_flags: ["profile.multi"],
          usage_limits: { profiles: 3 },
          active: true,
          sort_order: 30,
        },
      ],
      error: null,
    };
    await getPlansCached();
    expect(state.captured.from).toBe("plans");
    expect(state.captured.selectCols).toBe(
      "id,segment,name,price_aud_cents,annual_price_aud_cents,interval,trial_days,stripe_price_id,feature_flags,usage_limits,active,sort_order",
    );
  });

  it("filters .eq('active', true) and orders by sort_order ascending", async () => {
    state.result = {
      data: [
        {
          id: "founder_growth",
          segment: "founder",
          name: "Growth",
          interval: "monthly",
        },
      ],
      error: null,
    };
    await getPlansCached();
    expect(state.captured.eqs).toEqual([{ col: "active", val: true }]);
    expect(state.captured.order).toEqual({
      col: "sort_order",
      opts: { ascending: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Fallback matrix
// ---------------------------------------------------------------------------

describe("getPlansCached fallback matrix", () => {
  it("falls back to GENERATED_PLANS when the admin client is null — no query issued", async () => {
    state.adminNull = true;
    const plans = await getPlansCached();
    expect(plans.length).toBe(ACTIVE_GENERATED_COUNT);
    expect(state.captured.from).toBeNull();
    // Every returned plan is active + sorted ascending by sort_order.
    for (const p of plans) expect(p.active).toBe(true);
    const sorts = plans.map((p) => p.sort_order);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
  });

  it("falls back to GENERATED_PLANS when DB returns an error", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const plans = await getPlansCached();
    expect(plans.length).toBe(ACTIVE_GENERATED_COUNT);
  });

  it("falls back to GENERATED_PLANS when DB returns empty data", async () => {
    state.result = { data: [], error: null };
    const plans = await getPlansCached();
    expect(plans.length).toBe(ACTIVE_GENERATED_COUNT);
  });

  it("falls back to GENERATED_PLANS when the DB client throws — swallowed with console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.throwOnFrom = true;
    const plans = await getPlansCached();
    expect(plans.length).toBe(ACTIVE_GENERATED_COUNT);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain("[plans-db]");
    warnSpy.mockRestore();
  });

  it("populates stripe_price_id from process.env[stripe_env_var] on the generated-plan fallback", async () => {
    process.env.STRIPE_PRICE_FOUNDER_GROWTH = "price_env_growth";
    state.adminNull = true;
    const plans = await getPlansCached();
    const growth = plans.find((p) => p.id === "founder_growth")!;
    expect(growth.stripe_price_id).toBe("price_env_growth");
  });

  it("stripe_price_id is null on the generated-plan fallback when env var is unset", async () => {
    delete process.env.STRIPE_PRICE_FOUNDER_GROWTH;
    state.adminNull = true;
    const plans = await getPlansCached();
    const growth = plans.find((p) => p.id === "founder_growth")!;
    expect(growth.stripe_price_id).toBeNull();
  });

  it("stripe_price_id is null on the generated-plan fallback when stripe_env_var is the empty string (e.g. free plan)", async () => {
    state.adminNull = true;
    const plans = await getPlansCached();
    const free = plans.find((p) => p.id === "founder_free")!;
    expect(free.stripe_price_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Row normaliser branches
// ---------------------------------------------------------------------------

describe("fromRow normalisers (observed via getPlansCached happy path)", () => {
  function rowShell(overrides: Record<string, unknown>) {
    return {
      id: "founder_growth",
      segment: "founder",
      name: "Growth",
      price_aud_cents: 9900,
      annual_price_aud_cents: 99000,
      interval: "monthly",
      trial_days: 7,
      stripe_price_id: null,
      feature_flags: [],
      usage_limits: {},
      active: true,
      sort_order: 30,
      ...overrides,
    };
  }

  it("passes through a fully-populated row with array flags + object limits", async () => {
    state.result = {
      data: [
        rowShell({
          feature_flags: ["profile.multi", "cap_table.write"],
          usage_limits: { profiles: 3, svi_per_month: 50 },
        }),
      ],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.id).toBe("founder_growth");
    expect(p.feature_flags).toEqual(["profile.multi", "cap_table.write"]);
    expect(p.usage_limits).toEqual({ profiles: 3, svi_per_month: 50 });
  });

  it("parses feature_flags supplied as a JSON string", async () => {
    state.result = {
      data: [rowShell({ feature_flags: '["a","b"]' })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.feature_flags).toEqual(["a", "b"]);
  });

  it("filters non-string entries out of feature_flags arrays", async () => {
    state.result = {
      data: [rowShell({ feature_flags: ["ok", 1, null, "also_ok"] })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.feature_flags).toEqual(["ok", "also_ok"]);
  });

  it("returns [] for feature_flags when input is unparseable / garbage", async () => {
    state.result = {
      data: [rowShell({ feature_flags: "not-json" })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.feature_flags).toEqual([]);
  });

  it("returns [] for feature_flags when input is null", async () => {
    state.result = {
      data: [rowShell({ feature_flags: null })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.feature_flags).toEqual([]);
  });

  it("coerces numeric-string usage_limits into numbers", async () => {
    state.result = {
      data: [rowShell({ usage_limits: { profiles: "3", svi_per_month: "50" } })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.usage_limits).toEqual({ profiles: 3, svi_per_month: 50 });
  });

  it("drops usage_limits entries that are neither number nor numeric-string", async () => {
    state.result = {
      data: [
        rowShell({
          usage_limits: {
            profiles: 3,
            bad_bool: true,
            bad_null: null,
            bad_str: "not-a-number",
            bad_empty: "",
          },
        }),
      ],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.usage_limits).toEqual({ profiles: 3 });
  });

  it("parses usage_limits supplied as a JSON string", async () => {
    state.result = {
      data: [rowShell({ usage_limits: '{"profiles":3}' })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.usage_limits).toEqual({ profiles: 3 });
  });

  it("returns {} for usage_limits when input is unparseable / garbage", async () => {
    state.result = {
      data: [rowShell({ usage_limits: "not-json" })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.usage_limits).toEqual({});
  });

  it("returns {} for usage_limits when input is an array (not a plain object)", async () => {
    state.result = {
      data: [rowShell({ usage_limits: [1, 2, 3] })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.usage_limits).toEqual({});
  });

  it("passes all valid interval values through unchanged", async () => {
    for (const interval of ["free", "monthly", "yearly", "once", "custom"] as const) {
      state.result = { data: [rowShell({ interval })], error: null };
      revalidatePlans();
      const [p] = await getPlansCached();
      expect(p.interval).toBe(interval);
    }
  });

  it("coerces an unknown interval to 'monthly'", async () => {
    state.result = {
      data: [rowShell({ interval: "weekly" })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.interval).toBe("monthly");
  });

  it("coerces a null interval to 'monthly'", async () => {
    state.result = {
      data: [rowShell({ interval: null })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.interval).toBe("monthly");
  });

  it("uses stripe_price_id from the row when it is a non-empty string (row wins over env)", async () => {
    process.env.STRIPE_PRICE_FOUNDER_GROWTH = "price_env_growth";
    state.result = {
      data: [rowShell({ stripe_price_id: "price_row_growth" })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.stripe_price_id).toBe("price_row_growth");
  });

  it("falls back to process.env[stripe_env_var] when stripe_price_id is empty string", async () => {
    process.env.STRIPE_PRICE_FOUNDER_GROWTH = "price_env_growth";
    state.result = {
      data: [rowShell({ stripe_price_id: "" })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.stripe_price_id).toBe("price_env_growth");
  });

  it("falls back to process.env[stripe_env_var] when stripe_price_id is null", async () => {
    process.env.STRIPE_PRICE_FOUNDER_GROWTH = "price_env_growth";
    state.result = {
      data: [rowShell({ stripe_price_id: null })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.stripe_price_id).toBe("price_env_growth");
  });

  it("stripe_price_id is null when row lacks it and env var is unset", async () => {
    delete process.env.STRIPE_PRICE_FOUNDER_GROWTH;
    state.result = {
      data: [rowShell({ stripe_price_id: null })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.stripe_price_id).toBeNull();
  });

  it("stripe_price_id is null for an unknown plan id when row and env are both empty (no generated fallback)", async () => {
    state.result = {
      data: [
        rowShell({ id: "mystery_plan", stripe_price_id: null }),
      ],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.stripe_price_id).toBeNull();
    // The unknown id has no GENERATED_PLANS_BY_ID entry so the row's own
    // fields must survive without a fallback lookup crashing.
    expect(p.id).toBe("mystery_plan");
  });

  it("fills segment/name/price/sort_order from GENERATED_PLANS_BY_ID when the DB row omits them", async () => {
    // Ship only the id — every other column defaults to the generated fallback.
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly" }],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.segment).toBe("founder");
    expect(p.name).toBe("Growth");
    expect(p.price_aud_cents).toBe(9900);
    expect(p.annual_price_aud_cents).toBe(99000);
    expect(p.trial_days).toBe(7);
    expect(p.sort_order).toBe(30);
  });

  it("active defaults to true when the row omits the column", async () => {
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly" }],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.active).toBe(true);
  });

  it("active is false only when the row explicitly sets it to false", async () => {
    state.result = {
      data: [rowShell({ active: false })],
      error: null,
    };
    const [p] = await getPlansCached();
    expect(p.active).toBe(false);
  });

  it("preserves DB row order (does not re-sort by sort_order after the DB path)", async () => {
    // The DB path relies on .order('sort_order') to have already sorted, so
    // plans-db returns rows in the exact order the DB shipped them. Prove
    // that by feeding an out-of-order list and asserting it survives.
    state.result = {
      data: [
        { id: "founder_scale", sort_order: 40, interval: "monthly" },
        { id: "founder_growth", sort_order: 30, interval: "monthly" },
      ],
      error: null,
    };
    const plans = await getPlansCached();
    expect(plans.map((p) => p.id)).toEqual(["founder_scale", "founder_growth"]);
  });
});

// ---------------------------------------------------------------------------
// Cache TTL
// ---------------------------------------------------------------------------

describe("cache + revalidatePlans", () => {
  it("returns the identical cached array on the second call within TTL — no second DB round-trip", async () => {
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly" }],
      error: null,
    };
    const first = await getPlansCached();
    const second = await getPlansCached();
    expect(second).toBe(first);
    expect(state.captured.fromCallCount).toBe(1);
  });

  it("revalidatePlans() forces a fresh DB round-trip", async () => {
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly" }],
      error: null,
    };
    await getPlansCached();
    expect(state.captured.fromCallCount).toBe(1);
    revalidatePlans();
    await getPlansCached();
    expect(state.captured.fromCallCount).toBe(2);
  });

  it("cache TTL expires after 60s — after fast-forwarding, the next call re-queries", async () => {
    vi.useFakeTimers();
    try {
      state.result = {
        data: [{ id: "founder_growth", interval: "monthly" }],
        error: null,
      };
      await getPlansCached();
      expect(state.captured.fromCallCount).toBe(1);
      vi.advanceTimersByTime(59_999);
      await getPlansCached();
      expect(state.captured.fromCallCount).toBe(1);
      vi.advanceTimersByTime(2);
      await getPlansCached();
      expect(state.captured.fromCallCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// getPlanCached
// ---------------------------------------------------------------------------

describe("getPlanCached", () => {
  it("returns the plan when it is in the cached list", async () => {
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly", name: "Growth" }],
      error: null,
    };
    const p = await getPlanCached("founder_growth");
    expect(p).not.toBeNull();
    expect(p!.id).toBe("founder_growth");
    expect(p!.name).toBe("Growth");
  });

  it("falls back to GENERATED_PLANS_BY_ID when the cached list omits the id", async () => {
    // DB returns *only* founder_growth; caller asks for founder_starter.
    state.result = {
      data: [{ id: "founder_growth", interval: "monthly" }],
      error: null,
    };
    const p = await getPlanCached("founder_starter");
    expect(p).not.toBeNull();
    expect(p!.id).toBe("founder_starter");
    // Generated fallback path emits usage_limits per the CSV — non-empty.
    expect(Object.keys(p!.usage_limits).length).toBeGreaterThan(0);
  });

  it("returns null when the id is unknown to both the DB and the generated matrix", async () => {
    state.adminNull = true;
    const p = await getPlanCached("does_not_exist");
    expect(p).toBeNull();
  });
});
