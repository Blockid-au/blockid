import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only project-scoped ESOP option-grant
// CRUD lib backed by `esop_option_grants` (migration 0089). Pins:
//   - table name (`esop_option_grants`), NOT the legacy pool-scoped
//     `esop_grants` referenced by /api/esop/pool + /api/esop/score
//   - listGrants: project-scoped vs personal (project_id IS NULL) branch,
//     ordered by grant_date desc, null-safe on error/no-admin
//   - createGrant: trims name/email/notes, coerces empty email/notes → null,
//     defaults (strike=0, vest=4y, cliff=12mo)
//   - getGrant: two-eq ownership filter, maybeSingle contract
//   - updateGrantStatus: VALID_STATUSES guard (rejects "revoked" etc),
//     stamps updated_at, ownership filter
//   - updateDiv83AStatus: stamps div83a_last_checked_at + updated_at,
//     ownership filter
//   - mapGrant string→number coercion for shares/strike (Supabase numeric
//     returns as string in the JS client)
//   - isValidStatus type guard
//
// Covers the P1_dataroom_map / Phase-5 equity surface — these grant
// records populate data-room folder 8 (HR & ESOP) alongside the AU-native
// grant letters covered by au-templates.test.ts.

// ---------------------------------------------------------------------------
// Fake Supabase — chain returns `this` for eq/is/order/select/insert/update
// and is itself thenable so the two await shapes both work:
//   1. `await supabase.from(t).update(x).eq().eq()`               → {error}
//   2. `await supabase.from(t).select().eq().eq().maybeSingle()`  → {data, error}
//   3. `await supabase.from(t).insert(x).select().single()`       → {data, error}
//   4. `await supabase.from(t).select().eq().order().is()`        → {data, error}
// ---------------------------------------------------------------------------

interface Captured {
  from: string | null;
  selectCols: string | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  isCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts?: { ascending?: boolean } }>;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  data: unknown;
  error: unknown;
  captured: Captured;
}

function freshCaptured(): Captured {
  return {
    from: null,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    eqCalls: [],
    isCalls: [],
    orderCalls: [],
    terminal: null,
  };
}

const state: FakeState = {
  adminConfigured: true,
  data: null,
  error: null,
  captured: freshCaptured(),
};

function makeChain() {
  const chain: Record<string, unknown> = {};
  const resolve = () => ({ data: state.data, error: state.error });

  chain.select = (cols?: string) => {
    state.captured.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    state.captured.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    state.captured.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    state.captured.eqCalls.push({ col, val });
    return chain;
  };
  chain.is = (col: string, val: unknown) => {
    state.captured.isCalls.push({ col, val });
    return chain;
  };
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    state.captured.orderCalls.push({ col, opts });
    return chain;
  };
  chain.single = () => {
    state.captured.terminal = "single";
    return Promise.resolve(resolve());
  };
  chain.maybeSingle = () => {
    state.captured.terminal = "maybeSingle";
    return Promise.resolve(resolve());
  };
  // Thenable — enables `await chain` for the list/update paths that never
  // call a terminal method.
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    state.captured.terminal = state.captured.terminal ?? "await";
    return Promise.resolve(resolve()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => {
        state.captured.from = table;
        return makeChain();
      },
    };
  },
}));

// Silence noisy [esop-grants] error logs during negative-path assertions.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  state.adminConfigured = true;
  state.data = null;
  state.error = null;
  state.captured = freshCaptured();
  errorSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("esop-grants — listGrants", () => {
  it("returns [] when supabase admin is not configured", async () => {
    const { listGrants } = await import("./esop-grants");
    state.adminConfigured = false;
    const rows = await listGrants("u1", "p1");
    expect(rows).toEqual([]);
    // No table access happened.
    expect(state.captured.from).toBeNull();
  });

  it("targets `esop_option_grants`, filters by user, orders by grant_date DESC", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = [];
    await listGrants("user-1", "proj-1");
    expect(state.captured.from).toBe("esop_option_grants");
    expect(state.captured.selectCols).toBe("*");
    expect(state.captured.eqCalls).toContainEqual({ col: "user_id", val: "user-1" });
    expect(state.captured.orderCalls).toContainEqual({
      col: "grant_date",
      opts: { ascending: false },
    });
  });

  it("adds a project_id equality filter when a projectId is supplied", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = [];
    await listGrants("user-1", "proj-42");
    expect(state.captured.eqCalls).toContainEqual({ col: "project_id", val: "proj-42" });
    // No IS-NULL filter — the two branches are mutually exclusive.
    expect(state.captured.isCalls).toEqual([]);
  });

  it("uses IS NULL for personal (no-project) grants when projectId is null", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = [];
    await listGrants("user-1", null);
    expect(state.captured.isCalls).toContainEqual({ col: "project_id", val: null });
    // And critically NO project_id equality filter.
    expect(state.captured.eqCalls.some((c) => c.col === "project_id")).toBe(false);
  });

  it("maps a row: string numerics → JS numbers, snake_case → camelCase", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = [
      {
        id: "g1",
        project_id: "p1",
        user_id: "u1",
        grantee_name: "Ava",
        grantee_email: "ava@example.com",
        grant_date: "2026-07-01",
        // Supabase numeric columns arrive as strings via PostgREST.
        shares_under_option: "12345",
        strike_price_aud: "0.001",
        vesting_years: 4,
        cliff_months: 12,
        status: "active",
        div83a_status: "eligible",
        div83a_last_checked_at: "2026-07-15T00:00:00Z",
        notes: "seed grant",
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
    ];
    const [row] = await listGrants("u1", "p1");
    expect(row.id).toBe("g1");
    expect(row.granteeName).toBe("Ava");
    expect(row.granteeEmail).toBe("ava@example.com");
    expect(row.sharesUnderOption).toBe(12345);
    expect(typeof row.sharesUnderOption).toBe("number");
    expect(row.strikePriceAud).toBe(0.001);
    expect(typeof row.strikePriceAud).toBe("number");
    expect(row.vestingYears).toBe(4);
    expect(row.cliffMonths).toBe(12);
    expect(row.status).toBe("active");
    expect(row.div83aStatus).toBe("eligible");
    expect(row.div83aLastCheckedAt).toBe("2026-07-15T00:00:00Z");
    expect(row.projectId).toBe("p1");
    expect(row.userId).toBe("u1");
    expect(row.notes).toBe("seed grant");
  });

  it("preserves number numerics (not just string→number coercion)", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = [
      {
        id: "g1",
        project_id: null,
        user_id: "u1",
        grantee_name: "Ben",
        grantee_email: null,
        grant_date: "2026-07-01",
        shares_under_option: 500,
        strike_price_aud: 1.25,
        vesting_years: 4,
        cliff_months: 12,
        status: "active",
        div83a_status: null,
        div83a_last_checked_at: null,
        notes: null,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
    ];
    const [row] = await listGrants("u1", null);
    expect(row.sharesUnderOption).toBe(500);
    expect(row.strikePriceAud).toBe(1.25);
    expect(row.projectId).toBeNull();
    expect(row.granteeEmail).toBeNull();
    expect(row.div83aStatus).toBeNull();
  });

  it("returns [] and logs when supabase errors", async () => {
    const { listGrants } = await import("./esop-grants");
    state.error = { message: "boom" };
    const rows = await listGrants("u1", null);
    expect(rows).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[esop-grants] listGrants failed",
      "boom",
    );
  });

  it("returns [] when supabase yields null data with no error", async () => {
    const { listGrants } = await import("./esop-grants");
    state.data = null;
    const rows = await listGrants("u1", null);
    expect(rows).toEqual([]);
  });
});

describe("esop-grants — createGrant", () => {
  it("returns null when supabase admin is not configured", async () => {
    const { createGrant } = await import("./esop-grants");
    state.adminConfigured = false;
    const g = await createGrant({
      userId: "u1",
      projectId: "p1",
      granteeName: "Ava",
      grantDate: "2026-07-01",
      sharesUnderOption: 1000,
    });
    expect(g).toBeNull();
  });

  it("trims name / email / notes and defaults strike=0, vest=4, cliff=12", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = {
      id: "g1",
      project_id: "p1",
      user_id: "u1",
      grantee_name: "Ava",
      grantee_email: "ava@example.com",
      grant_date: "2026-07-01",
      shares_under_option: 1000,
      strike_price_aud: 0,
      vesting_years: 4,
      cliff_months: 12,
      status: "active",
      div83a_status: null,
      div83a_last_checked_at: null,
      notes: "hello",
      created_at: "x",
      updated_at: "x",
    };
    await createGrant({
      userId: "u1",
      projectId: "p1",
      granteeName: "  Ava  ",
      granteeEmail: "  ava@example.com  ",
      grantDate: "2026-07-01",
      sharesUnderOption: 1000,
      notes: "  hello  ",
    });
    expect(state.captured.from).toBe("esop_option_grants");
    expect(state.captured.terminal).toBe("single");
    const payload = state.captured.insertPayload!;
    expect(payload.grantee_name).toBe("Ava");
    expect(payload.grantee_email).toBe("ava@example.com");
    expect(payload.notes).toBe("hello");
    expect(payload.strike_price_aud).toBe(0);
    expect(payload.vesting_years).toBe(4);
    expect(payload.cliff_months).toBe(12);
    expect(payload.user_id).toBe("u1");
    expect(payload.project_id).toBe("p1");
    expect(payload.grant_date).toBe("2026-07-01");
    expect(payload.shares_under_option).toBe(1000);
  });

  it("coerces empty-string email/notes into null (never inserts empty strings)", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = {
      id: "g2",
      project_id: null,
      user_id: "u1",
      grantee_name: "Ben",
      grantee_email: null,
      grant_date: "2026-07-01",
      shares_under_option: 100,
      strike_price_aud: 0,
      vesting_years: 4,
      cliff_months: 12,
      status: "active",
      div83a_status: null,
      div83a_last_checked_at: null,
      notes: null,
      created_at: "x",
      updated_at: "x",
    };
    await createGrant({
      userId: "u1",
      projectId: null,
      granteeName: "Ben",
      granteeEmail: "   ",
      grantDate: "2026-07-01",
      sharesUnderOption: 100,
      notes: "   ",
    });
    const p = state.captured.insertPayload!;
    expect(p.grantee_email).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.project_id).toBeNull();
  });

  it("passes through explicit strike/vest/cliff overrides", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = null;
    state.error = { message: "insert-failed" };
    await createGrant({
      userId: "u1",
      projectId: "p1",
      granteeName: "Cara",
      grantDate: "2026-07-01",
      sharesUnderOption: 500,
      strikePriceAud: 2.5,
      vestingYears: 3,
      cliffMonths: 6,
    });
    const p = state.captured.insertPayload!;
    expect(p.strike_price_aud).toBe(2.5);
    expect(p.vesting_years).toBe(3);
    expect(p.cliff_months).toBe(6);
  });

  it("returns null + logs when the insert errors", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = null;
    state.error = { message: "unique-violation" };
    const g = await createGrant({
      userId: "u1",
      projectId: null,
      granteeName: "Dan",
      grantDate: "2026-07-01",
      sharesUnderOption: 10,
    });
    expect(g).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[esop-grants] createGrant failed",
      "unique-violation",
    );
  });

  it("returns null when supabase yields neither data nor error (defensive)", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = null;
    state.error = null;
    const g = await createGrant({
      userId: "u1",
      projectId: null,
      granteeName: "Ed",
      grantDate: "2026-07-01",
      sharesUnderOption: 10,
    });
    expect(g).toBeNull();
  });

  it("undefined email/notes coerce to null (not the string 'undefined')", async () => {
    const { createGrant } = await import("./esop-grants");
    state.data = {
      id: "g3",
      project_id: null,
      user_id: "u1",
      grantee_name: "Fay",
      grantee_email: null,
      grant_date: "2026-07-01",
      shares_under_option: 200,
      strike_price_aud: 0,
      vesting_years: 4,
      cliff_months: 12,
      status: "active",
      div83a_status: null,
      div83a_last_checked_at: null,
      notes: null,
      created_at: "x",
      updated_at: "x",
    };
    await createGrant({
      userId: "u1",
      projectId: null,
      granteeName: "Fay",
      grantDate: "2026-07-01",
      sharesUnderOption: 200,
    });
    const p = state.captured.insertPayload!;
    expect(p.grantee_email).toBeNull();
    expect(p.notes).toBeNull();
  });
});

describe("esop-grants — getGrant", () => {
  it("returns null when supabase admin is not configured", async () => {
    const { getGrant } = await import("./esop-grants");
    state.adminConfigured = false;
    const g = await getGrant("g1", "u1");
    expect(g).toBeNull();
  });

  it("filters by id AND user_id (ownership guard) via maybeSingle", async () => {
    const { getGrant } = await import("./esop-grants");
    state.data = null;
    await getGrant("g1", "u1");
    expect(state.captured.from).toBe("esop_option_grants");
    expect(state.captured.terminal).toBe("maybeSingle");
    expect(state.captured.eqCalls).toEqual([
      { col: "id", val: "g1" },
      { col: "user_id", val: "u1" },
    ]);
  });

  it("returns null when the row is missing (no error)", async () => {
    const { getGrant } = await import("./esop-grants");
    state.data = null;
    const g = await getGrant("g1", "u1");
    expect(g).toBeNull();
  });

  it("returns null + logs when supabase errors", async () => {
    const { getGrant } = await import("./esop-grants");
    state.error = { message: "db-down" };
    const g = await getGrant("g1", "u1");
    expect(g).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[esop-grants] getGrant failed",
      "db-down",
    );
  });

  it("maps the row through mapGrant() on the happy path", async () => {
    const { getGrant } = await import("./esop-grants");
    state.data = {
      id: "g9",
      project_id: "p1",
      user_id: "u1",
      grantee_name: "Ava",
      grantee_email: "ava@example.com",
      grant_date: "2026-07-01",
      shares_under_option: "9999",
      strike_price_aud: "1.23",
      vesting_years: 4,
      cliff_months: 12,
      status: "exercised",
      div83a_status: "unsure",
      div83a_last_checked_at: null,
      notes: null,
      created_at: "x",
      updated_at: "x",
    };
    const g = await getGrant("g9", "u1");
    expect(g).not.toBeNull();
    expect(g!.id).toBe("g9");
    expect(g!.sharesUnderOption).toBe(9999);
    expect(g!.strikePriceAud).toBe(1.23);
    expect(g!.status).toBe("exercised");
    expect(g!.div83aStatus).toBe("unsure");
  });
});

describe("esop-grants — updateGrantStatus", () => {
  it("rejects unknown status values without touching supabase", async () => {
    const { updateGrantStatus } = await import("./esop-grants");
    // TS-level rejection is bypassed here to prove the runtime guard actually
    // fires — critical because callers may pass user-typed strings.
    const ok = await updateGrantStatus("g1", "u1", "revoked" as never);
    expect(ok).toBe(false);
    expect(state.captured.from).toBeNull();
    expect(state.captured.updatePayload).toBeNull();
  });

  it("returns false when supabase admin is not configured (after status guard)", async () => {
    const { updateGrantStatus } = await import("./esop-grants");
    state.adminConfigured = false;
    const ok = await updateGrantStatus("g1", "u1", "active");
    expect(ok).toBe(false);
  });

  it("writes status + updated_at, filters by (id, user_id), returns true", async () => {
    const { updateGrantStatus } = await import("./esop-grants");
    state.error = null;
    const before = Date.now();
    const ok = await updateGrantStatus("g1", "u1", "exercised");
    const after = Date.now();
    expect(ok).toBe(true);
    expect(state.captured.from).toBe("esop_option_grants");
    const payload = state.captured.updatePayload!;
    expect(payload.status).toBe("exercised");
    expect(typeof payload.updated_at).toBe("string");
    const ts = Date.parse(payload.updated_at as string);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(state.captured.eqCalls).toEqual([
      { col: "id", val: "g1" },
      { col: "user_id", val: "u1" },
    ]);
  });

  it("returns false + logs when supabase update errors", async () => {
    const { updateGrantStatus } = await import("./esop-grants");
    state.error = { message: "rls-denied" };
    const ok = await updateGrantStatus("g1", "u1", "cancelled");
    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[esop-grants] updateGrantStatus failed",
      "rls-denied",
    );
  });

  it("accepts all four canonical statuses", async () => {
    const { updateGrantStatus } = await import("./esop-grants");
    for (const s of ["active", "exercised", "lapsed", "cancelled"] as const) {
      state.captured = freshCaptured();
      state.error = null;
      const ok = await updateGrantStatus("g1", "u1", s);
      expect(ok).toBe(true);
      expect(state.captured.updatePayload!.status).toBe(s);
    }
  });
});

describe("esop-grants — updateDiv83AStatus", () => {
  it("returns false when supabase admin is not configured", async () => {
    const { updateDiv83AStatus } = await import("./esop-grants");
    state.adminConfigured = false;
    const ok = await updateDiv83AStatus("g1", "u1", "eligible");
    expect(ok).toBe(false);
  });

  it("stamps div83a_status + div83a_last_checked_at + updated_at with matching ownership filter", async () => {
    const { updateDiv83AStatus } = await import("./esop-grants");
    state.error = null;
    const before = Date.now();
    const ok = await updateDiv83AStatus("g1", "u1", "eligible");
    const after = Date.now();
    expect(ok).toBe(true);
    expect(state.captured.from).toBe("esop_option_grants");
    const payload = state.captured.updatePayload!;
    expect(payload.div83a_status).toBe("eligible");
    expect(typeof payload.div83a_last_checked_at).toBe("string");
    expect(typeof payload.updated_at).toBe("string");
    const checked = Date.parse(payload.div83a_last_checked_at as string);
    const updated = Date.parse(payload.updated_at as string);
    expect(checked).toBeGreaterThanOrEqual(before);
    expect(checked).toBeLessThanOrEqual(after);
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
    expect(state.captured.eqCalls).toEqual([
      { col: "id", val: "g1" },
      { col: "user_id", val: "u1" },
    ]);
  });

  it("accepts all three Div 83A verdicts", async () => {
    const { updateDiv83AStatus } = await import("./esop-grants");
    for (const s of ["eligible", "ineligible", "unsure"] as const) {
      state.captured = freshCaptured();
      state.error = null;
      const ok = await updateDiv83AStatus("g1", "u1", s);
      expect(ok).toBe(true);
      expect(state.captured.updatePayload!.div83a_status).toBe(s);
    }
  });

  it("returns false + logs when supabase update errors", async () => {
    const { updateDiv83AStatus } = await import("./esop-grants");
    state.error = { message: "constraint-violation" };
    const ok = await updateDiv83AStatus("g1", "u1", "ineligible");
    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[esop-grants] updateDiv83AStatus failed",
      "constraint-violation",
    );
  });
});

describe("esop-grants — isValidStatus type guard", () => {
  it("accepts the four canonical statuses", async () => {
    const { isValidStatus } = await import("./esop-grants");
    expect(isValidStatus("active")).toBe(true);
    expect(isValidStatus("exercised")).toBe(true);
    expect(isValidStatus("lapsed")).toBe(true);
    expect(isValidStatus("cancelled")).toBe(true);
  });

  it("rejects unknown strings + non-string values", async () => {
    const { isValidStatus } = await import("./esop-grants");
    expect(isValidStatus("revoked")).toBe(false);
    expect(isValidStatus("Active")).toBe(false); // case-sensitive
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(0)).toBe(false);
    expect(isValidStatus({})).toBe(false);
  });
});
