// Colocated suite for the per-user grant layer.
//
// This module is the only thing standing between "a founder paid A$59/month"
// and "the founder can open /workspace/esop", so the two properties that must
// never regress are pinned first and hardest:
//
//   1. It only ever WIDENS. No input to this module can remove a feature the
//      user's plan already granted.
//   2. Every failure is CLOSED. No service-role client, a query error, a
//      thrown driver, a malformed row, an expired row — all resolve to the
//      empty set, which is indistinguishable from "no add-on".

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import {
  ADDON_FEATURES,
  SHARE_MANAGEMENT_ADDON,
  addonFeatures,
  getUserGrantedFeatures,
  grantAddon,
  invalidateUserGrants,
  loadUserGrantedFeatures,
  revokeAddon,
} from "./user-grants";

// ---------------------------------------------------------------------------
// Supabase fake — a thenable query builder that records what it was asked for.
// ---------------------------------------------------------------------------

interface Recorded {
  table: string;
  op: "select" | "upsert" | "delete";
  filters: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
  payload?: unknown;
  options?: unknown;
}

interface FakeResult {
  data?: unknown;
  error?: unknown;
}

function makeSupabase(result: FakeResult | (() => never)) {
  const calls: Recorded[] = [];

  function builder(rec: Recorded) {
    const api = {
      select(_cols?: string) {
        rec.op = "select";
        return api;
      },
      eq(col: string, val: unknown) {
        rec.filters.push([col, val]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        rec.ins.push([col, vals]);
        return api;
      },
      upsert(payload: unknown, options?: unknown) {
        rec.op = "upsert";
        rec.payload = payload;
        rec.options = options;
        return api;
      },
      delete() {
        rec.op = "delete";
        return api;
      },
      then(resolve: (v: FakeResult) => unknown, reject: (e: unknown) => unknown) {
        try {
          const r = typeof result === "function" ? result() : result;
          return Promise.resolve(r).then(resolve, reject);
        } catch (err) {
          return Promise.resolve().then(() => reject(err));
        }
      },
    };
    return api;
  }

  return {
    calls,
    client: {
      from(table: string) {
        const rec: Recorded = { table, op: "select", filters: [], ins: [] };
        calls.push(rec);
        return builder(rec);
      },
    },
  };
}

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  getSupabaseAdminMock.mockReset();
  invalidateUserGrants();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("ADDON_FEATURES", () => {
  it("the Equity add-on grants exactly the ESOP / vesting / on-chain gates", () => {
    expect([...addonFeatures(SHARE_MANAGEMENT_ADDON)].sort()).toEqual([
      "blockchain.sync",
      "esop.manage",
      "vesting.read",
      "vesting.write",
    ]);
  });

  // The founder's own statutory records are not the add-on's to sell. If a
  // future edit adds any of these, a Growth subscriber loses the cap table
  // they already pay for — so pin the exclusion, not just the inclusion.
  it.each([
    "share_management",
    "cap_table.read",
    "cap_table.write",
    "data_room.access",
    "data_room.read",
    "data_room.write",
  ])("never sells the founder's own records: %s stays out", (feature) => {
    expect(addonFeatures(SHARE_MANAGEMENT_ADDON)).not.toContain(feature);
  });

  it("returns an empty list for an unknown add-on key", () => {
    expect(addonFeatures("no_such_addon")).toEqual([]);
  });

  it("the catalog is frozen — grants cannot be widened at runtime", () => {
    expect(Object.isFrozen(ADDON_FEATURES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Read — fail-closed
// ---------------------------------------------------------------------------

describe("getUserGrantedFeatures — fail-closed", () => {
  it("returns [] and never queries when there is no user id", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({ data: [] }).client);
    expect(await getUserGrantedFeatures(null)).toEqual([]);
    expect(await getUserGrantedFeatures(undefined)).toEqual([]);
    expect(await getUserGrantedFeatures("")).toEqual([]);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns [] when the service-role client is unavailable", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await getUserGrantedFeatures(USER)).toEqual([]);
  });

  it("returns [] when the query errors — a broken lookup denies, never grants", async () => {
    const fake = makeSupabase({ data: null, error: { message: "relation missing" } });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual([]);
  });

  it("returns [] when the driver throws (database unreachable)", async () => {
    const fake = makeSupabase(() => {
      throw new Error("ECONNREFUSED");
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await expect(getUserGrantedFeatures(USER)).resolves.toEqual([]);
  });

  it("does not throw out of the gate path on any failure", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await expect(getUserGrantedFeatures(USER)).resolves.toBeDefined();
  });
});

describe("getUserGrantedFeatures — row filtering", () => {
  it("asks only for this user's allowed rows", async () => {
    const fake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    expect(fake.calls[0]!.table).toBe("entitlements");
    expect(fake.calls[0]!.filters).toEqual([
      ["user_id", USER],
      ["allowed", true],
    ]);
  });

  it("returns the feature strings of live rows", async () => {
    const fake = makeSupabase({
      data: [
        { feature: "esop.manage", expires_at: null },
        { feature: "vesting.write", expires_at: null },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect((await getUserGrantedFeatures(USER)).slice().sort()).toEqual([
      "esop.manage",
      "vesting.write",
    ]);
  });

  it("drops rows whose expires_at has passed", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 600_000).toISOString();
    const fake = makeSupabase({
      data: [
        { feature: "esop.manage", expires_at: past },
        { feature: "vesting.write", expires_at: future },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual(["vesting.write"]);
  });

  it("treats an unparseable expiry as expired", async () => {
    const fake = makeSupabase({
      data: [{ feature: "esop.manage", expires_at: "not-a-date" }],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual([]);
  });

  it("ignores malformed rows rather than surfacing junk as a feature", async () => {
    const fake = makeSupabase({
      data: [
        { feature: null },
        { feature: "" },
        { feature: 42 },
        {},
        { feature: "esop.manage", expires_at: null },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual(["esop.manage"]);
  });

  it("de-duplicates", async () => {
    const fake = makeSupabase({
      data: [
        { feature: "esop.manage", expires_at: null },
        { feature: "esop.manage", expires_at: null },
      ],
    });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual(["esop.manage"]);
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe("caching", () => {
  it("memoises a successful lookup instead of querying on every gate check", async () => {
    const fake = makeSupabase({ data: [{ feature: "esop.manage", expires_at: null }] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    await getUserGrantedFeatures(USER);
    await getUserGrantedFeatures(USER);
    expect(fake.calls).toHaveLength(1);
  });

  it("keys the cache per user — one founder's add-on never leaks to another", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    const fake = makeSupabase({ data: [{ feature: "esop.manage", expires_at: null }] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    await getUserGrantedFeatures(other);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.filters).toContainEqual(["user_id", other]);
  });

  it("invalidateUserGrants(userId) forces the next read to hit the database", async () => {
    const fake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    invalidateUserGrants(USER);
    await getUserGrantedFeatures(USER);
    expect(fake.calls).toHaveLength(2);
  });

  it("invalidateUserGrants() with no argument clears everyone", async () => {
    const fake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    invalidateUserGrants();
    await getUserGrantedFeatures(USER);
    expect(fake.calls).toHaveLength(2);
  });

  it("caches the failure too, so an outage cannot become a retry storm", async () => {
    const fake = makeSupabase({ data: null, error: { message: "down" } });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserGrantedFeatures(USER);
    await getUserGrantedFeatures(USER);
    expect(fake.calls).toHaveLength(1);
  });
});

describe("loadUserGrantedFeatures (uncached)", () => {
  it("bypasses the cache", async () => {
    const fake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await loadUserGrantedFeatures(USER);
    await loadUserGrantedFeatures(USER);
    expect(fake.calls).toHaveLength(2);
  });

  it("fails closed the same way", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await loadUserGrantedFeatures(USER)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

describe("grantAddon", () => {
  it("upserts one allowed row per feature, tagged source=addon", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const ok = await grantAddon({
      userId: USER,
      addon: SHARE_MANAGEMENT_ADDON,
      detail: { subscription_id: "sub_123" },
    });
    expect(ok).toBe(true);

    const rows = fake.calls[0]!.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.user_id).toBe(USER);
      expect(row.allowed).toBe(true);
      expect(row.source).toBe("addon");
      expect(row.expires_at).toBeNull();
      expect(row.detail).toMatchObject({
        addon: SHARE_MANAGEMENT_ADDON,
        subscription_id: "sub_123",
      });
    }
    expect(rows.map((r) => r.feature).sort()).toEqual([
      "blockchain.sync",
      "esop.manage",
      "vesting.read",
      "vesting.write",
    ]);
  });

  it("upserts on the (user_id, feature) key so a redelivered webhook is a no-op", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await grantAddon({ userId: USER, addon: SHARE_MANAGEMENT_ADDON });
    expect(fake.calls[0]!.op).toBe("upsert");
    expect(fake.calls[0]!.options).toEqual({ onConflict: "user_id,feature" });
  });

  it("invalidates the cache so the grant is visible immediately", async () => {
    const readFake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(readFake.client);
    await getUserGrantedFeatures(USER);
    expect(await getUserGrantedFeatures(USER)).toEqual([]);

    const writeFake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(writeFake.client);
    await grantAddon({ userId: USER, addon: SHARE_MANAGEMENT_ADDON });

    const afterFake = makeSupabase({
      data: [{ feature: "esop.manage", expires_at: null }],
    });
    getSupabaseAdminMock.mockReturnValue(afterFake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual(["esop.manage"]);
  });

  it("refuses an unknown add-on key and writes nothing", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await grantAddon({ userId: USER, addon: "no_such_addon" })).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a missing user id", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await grantAddon({ userId: "", addon: SHARE_MANAGEMENT_ADDON })).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it("reports failure instead of throwing when the write errors", async () => {
    const fake = makeSupabase({ data: null, error: { message: "denied" } });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await expect(
      grantAddon({ userId: USER, addon: SHARE_MANAGEMENT_ADDON }),
    ).resolves.toBe(false);
  });
});

describe("revokeAddon", () => {
  it("deletes only this user's addon-sourced rows for this add-on's features", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    const ok = await revokeAddon({
      userId: USER,
      addon: SHARE_MANAGEMENT_ADDON,
      reason: "subscription_deleted",
    });
    expect(ok).toBe(true);

    const call = fake.calls[0]!;
    expect(call.op).toBe("delete");
    expect(call.filters).toEqual([
      ["user_id", USER],
      // Scoped to source=addon so a manual support override or a
      // grandfathered grant is never collateral damage of a cancellation.
      ["source", "addon"],
    ]);
    expect(call.ins).toEqual([
      [
        "feature",
        ["esop.manage", "vesting.read", "vesting.write", "blockchain.sync"],
      ],
    ]);
  });

  it("invalidates the cache so the revoke takes effect immediately", async () => {
    const readFake = makeSupabase({
      data: [{ feature: "esop.manage", expires_at: null }],
    });
    getSupabaseAdminMock.mockReturnValue(readFake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual(["esop.manage"]);

    const writeFake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(writeFake.client);
    await revokeAddon({ userId: USER, addon: SHARE_MANAGEMENT_ADDON, reason: "cancelled" });

    const afterFake = makeSupabase({ data: [] });
    getSupabaseAdminMock.mockReturnValue(afterFake.client);
    expect(await getUserGrantedFeatures(USER)).toEqual([]);
  });

  it("reports failure instead of throwing when the delete errors", async () => {
    const fake = makeSupabase({ data: null, error: { message: "denied" } });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await expect(
      revokeAddon({ userId: USER, addon: SHARE_MANAGEMENT_ADDON, reason: "x" }),
    ).resolves.toBe(false);
  });

  it("refuses an unknown add-on key rather than deleting broadly", async () => {
    const fake = makeSupabase({ data: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(
      await revokeAddon({ userId: USER, addon: "no_such_addon", reason: "x" }),
    ).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });
});
