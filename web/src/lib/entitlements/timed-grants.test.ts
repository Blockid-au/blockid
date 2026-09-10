// Colocated suite for the timed-grant layer (T0247 — Startup Package's 90
// days of Founder Radar via app_users.money_radar_until, migration 0319).
//
// Same two properties as user-grants.test.ts, pinned first:
//   1. Union only — a stamp can only add `money_radar`; NULL / past / junk
//      stamps are the empty set.
//   2. Fail closed — no client, query error, thrown driver, missing column
//      (pre-0319) all resolve to [].

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import {
  TIMED_GRANT_COLUMNS,
  __timedCacheSizeForTest,
  getUserTimedGrants,
  invalidateTimedGrants,
  liveTimedGrants,
  timedGrantUntil,
} from "./timed-grants";

const NOW = Date.parse("2026-09-10T00:00:00Z");
const FUTURE = "2026-12-09T00:00:00.000Z";
const PAST = "2026-06-01T00:00:00.000Z";

interface Recorded {
  table: string;
  cols?: string;
  filters: Array<[string, unknown]>;
}

function makeSupabase(result: { data?: unknown; error?: unknown } | (() => never)) {
  const calls: Recorded[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const rec: Recorded = { table, filters: [] };
        calls.push(rec);
        const api = {
          select(cols: string) {
            rec.cols = cols;
            return api;
          },
          eq(col: string, val: unknown) {
            rec.filters.push([col, val]);
            return api;
          },
          maybeSingle() {
            if (typeof result === "function") return Promise.reject(new Error("driver exploded"));
            return Promise.resolve(result);
          },
        };
        return api;
      },
    },
  };
}

beforeEach(() => {
  invalidateTimedGrants();
  getSupabaseAdminMock.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("TIMED_GRANT_COLUMNS", () => {
  it("maps money_radar_until → money_radar and nothing else (today)", () => {
    expect(TIMED_GRANT_COLUMNS).toEqual({ money_radar_until: "money_radar" });
  });
});

describe("liveTimedGrants — pure", () => {
  it("grants money_radar while the stamp is in the future", () => {
    expect(liveTimedGrants({ money_radar_until: FUTURE }, NOW)).toEqual(["money_radar"]);
  });

  it("is empty for a past stamp, an exact-now stamp, NULL, missing, or junk", () => {
    expect(liveTimedGrants({ money_radar_until: PAST }, NOW)).toEqual([]);
    expect(liveTimedGrants({ money_radar_until: new Date(NOW).toISOString() }, NOW)).toEqual([]);
    expect(liveTimedGrants({ money_radar_until: null }, NOW)).toEqual([]);
    expect(liveTimedGrants({}, NOW)).toEqual([]);
    expect(liveTimedGrants({ money_radar_until: "not a date" }, NOW)).toEqual([]);
    expect(liveTimedGrants({ money_radar_until: 12345 }, NOW)).toEqual([]);
    expect(liveTimedGrants(null, NOW)).toEqual([]);
  });

  it("timedGrantUntil(90) is exactly 90 days out — the Package window", () => {
    expect(timedGrantUntil(90, NOW)).toBe(FUTURE);
  });
});

describe("getUserTimedGrants — read + cache", () => {
  it("returns [] for a falsy user id without touching the database", async () => {
    expect(await getUserTimedGrants(null)).toEqual([]);
    expect(await getUserTimedGrants("")).toEqual([]);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("reads app_users.money_radar_until for the user and grants while live", async () => {
    const fake = makeSupabase({ data: { money_radar_until: timedGrantUntil(30) }, error: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    expect(await getUserTimedGrants("u1")).toEqual(["money_radar"]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ table: "app_users", cols: "money_radar_until", filters: [["id", "u1"]] });
  });

  it("is empty once the window has passed", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({ data: { money_radar_until: PAST }, error: null }).client);
    expect(await getUserTimedGrants("u1")).toEqual([]);
  });

  it("caches a positive read (one query for repeat calls) and invalidates on demand", async () => {
    const fake = makeSupabase({ data: { money_radar_until: timedGrantUntil(30) }, error: null });
    getSupabaseAdminMock.mockReturnValue(fake.client);
    await getUserTimedGrants("u1");
    await getUserTimedGrants("u1");
    expect(fake.calls).toHaveLength(1);
    expect(__timedCacheSizeForTest()).toBe(1);
    invalidateTimedGrants("u1");
    await getUserTimedGrants("u1");
    expect(fake.calls).toHaveLength(2);
  });

  it("fails closed: no client", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await getUserTimedGrants("u1")).toEqual([]);
  });

  it("fails closed: query error (including the pre-0319 missing-column 42703, silently)", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase({ data: null, error: { code: "42703", message: "column does not exist" } }).client);
    expect(await getUserTimedGrants("u1")).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
    invalidateTimedGrants();
    getSupabaseAdminMock.mockReturnValue(makeSupabase({ data: null, error: { code: "XX000", message: "boom" } }).client);
    expect(await getUserTimedGrants("u2")).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("fails closed: thrown driver, and no row", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase(() => { throw new Error("x"); }).client);
    expect(await getUserTimedGrants("u1")).toEqual([]);
    invalidateTimedGrants();
    getSupabaseAdminMock.mockReturnValue(makeSupabase({ data: null, error: null }).client);
    expect(await getUserTimedGrants("u1")).toEqual([]);
  });
});
