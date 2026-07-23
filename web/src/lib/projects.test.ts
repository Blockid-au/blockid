import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// getSupabaseAdmin is stubbed to a swappable mock so tests that need to
// exercise the actual DELETE path (purgeArchivedOlderThan) can inject a
// fake client while the plan-limit tests still see `null` (matching the
// original suite's behaviour).
const getSupabaseAdminMock = vi.fn(() => null as unknown);
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getPlanCachedMock = vi.fn();
vi.mock("./plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

import { getProjectLimit, purgeArchivedOlderThan } from "./projects";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

describe("getProjectLimit — plans.usage_limits.profiles lookup", () => {
  beforeEach(() => {
    getPlanCachedMock.mockReset();
  });

  it("reads profiles from DB row for v2 plan id", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("founder_growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("maps legacy plan id via LEGACY_PLAN_MAP before lookup", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("treats profiles=-1 as unlimited", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_enterprise", usage_limits: { profiles: -1 } });
    expect(await getProjectLimit("founder_enterprise")).toBe(UNLIMITED);
  });

  it("falls back to static map when plan row is missing", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("founder_scale")).toBe(10);
  });

  it("falls back to static map when plan row lacks usage_limits.profiles", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_starter", usage_limits: {} });
    expect(await getProjectLimit("founder_starter")).toBe(1);
  });

  it("falls back to static map when getPlanCached throws", async () => {
    getPlanCachedMock.mockRejectedValue(new Error("DB down"));
    expect(await getProjectLimit("founder_growth")).toBe(3);
  });

  it("defaults to founder_free (limit 1) for null/undefined plan", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit(null)).toBe(1);
    expect(await getProjectLimit(undefined)).toBe(1);
  });

  it("legacy 'free' and 'founding50' resolve to 1 via fallback", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("free")).toBe(1);
    expect(await getProjectLimit("founding50")).toBe(1);
  });

  it("unknown plan id defaults to 1", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("mystery_tier")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// purgeArchivedOlderThan — Iteration-18 T1 / Q4 MP #5
// ---------------------------------------------------------------------------

interface DeleteCall {
  ids: string[];
}
interface SelectCall {
  archivedIsNullFilter: "not_null" | null;
  cutoffIso: string | null;
}

function makeFakeSupabase(opts: {
  selectRows?: Array<{ id: string; user_id: string }>;
  selectError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const selectCalls: SelectCall[] = [];
  const deleteCalls: DeleteCall[] = [];

  function selectBuilder() {
    const state: SelectCall = { archivedIsNullFilter: null, cutoffIso: null };
    const builder = {
      not(col: string, op: string, val: unknown) {
        if (col === "archived_at" && op === "is" && val === null) {
          state.archivedIsNullFilter = "not_null";
        }
        return builder;
      },
      lt(col: string, val: string) {
        if (col === "archived_at") state.cutoffIso = val;
        return builder;
      },
      then(resolve: (v: unknown) => unknown) {
        selectCalls.push(state);
        return Promise.resolve({
          data: opts.selectRows ?? [],
          error: opts.selectError ?? null,
        }).then(resolve);
      },
    };
    return builder;
  }

  function deleteBuilder() {
    const builder = {
      in(col: string, ids: string[]) {
        if (col === "id") deleteCalls.push({ ids });
        return builder;
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ error: opts.deleteError ?? null }).then(resolve);
      },
    };
    return builder;
  }

  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return selectBuilder();
        },
        delete() {
          return deleteBuilder();
        },
      };
    },
  };
  return { client, selectCalls, deleteCalls };
}

describe("purgeArchivedOlderThan — retention purge helper", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
  });

  it("rejects non-positive `days` without touching the DB", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const zero = await purgeArchivedOlderThan(0);
    expect(zero.ok).toBe(false);
    const neg = await purgeArchivedOlderThan(-5);
    expect(neg.ok).toBe(false);
  });

  it("returns supabase_not_configured when the admin client is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "supabase_not_configured" });
  });

  it("filters on `archived_at IS NOT NULL` AND `archived_at < now() - Xd`", async () => {
    const fake = makeFakeSupabase({
      selectRows: [
        { id: "p1", user_id: "u1" },
        { id: "p2", user_id: "u2" },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);

    const before = Date.now();
    const result = await purgeArchivedOlderThan(90);
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.count).toBe(2);
    expect(result.purged.map((r) => r.id)).toEqual(["p1", "p2"]);

    // Age-gate assertions.
    expect(fake.selectCalls).toHaveLength(1);
    const call = fake.selectCalls[0];
    expect(call.archivedIsNullFilter).toBe("not_null");
    const cutoff = new Date(call.cutoffIso as string).getTime();
    const windowMs = 90 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeLessThanOrEqual(after - windowMs);
    expect(cutoff).toBeGreaterThanOrEqual(before - windowMs - 1000);

    // DELETE targeted exactly the ids returned by SELECT.
    expect(fake.deleteCalls).toEqual([{ ids: ["p1", "p2"] }]);
  });

  it("returns count 0 and skips DELETE when no rows match the window", async () => {
    const fake = makeFakeSupabase({ selectRows: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(30);
    expect(result).toEqual({ ok: true, count: 0, purged: [] });
    expect(fake.deleteCalls).toHaveLength(0);
  });

  it("propagates SELECT errors as ok:false without deleting", async () => {
    const fake = makeFakeSupabase({
      selectError: { message: "select_boom" },
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "select_boom" });
    expect(fake.deleteCalls).toHaveLength(0);
  });

  it("propagates DELETE errors as ok:false", async () => {
    const fake = makeFakeSupabase({
      selectRows: [{ id: "p1", user_id: "u1" }],
      deleteError: { message: "delete_boom" },
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const result = await purgeArchivedOlderThan(90);
    expect(result).toEqual({ ok: false, error: "delete_boom" });
  });
});
