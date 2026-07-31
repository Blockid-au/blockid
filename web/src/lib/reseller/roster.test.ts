import { describe, expect, it } from "vitest";
import {
  isResellerOwner,
  readResellerRoster,
  RosterFiltersSchema,
  summariseRoster,
  type RosterSupabaseLike,
  type StartupRosterEntry,
} from "./roster";

const RESELLER_ID = "reseller-1";
const OWNER_USER_ID = "user-owner";
const OTHER_USER_ID = "user-other";

function makeRow(over: Partial<StartupRosterEntry> = {}): StartupRosterEntry {
  return {
    reseller_id: RESELLER_ID,
    reseller_slug: "INFOVISION",
    business_id: "biz-1",
    founder_user_id: "founder-1",
    founder_email: "a@example.com",
    business_name: "Acme",
    abn: null,
    verification_level: 1,
    trust_score: 55,
    unicorn_stage_id: "S1",
    growth_phase: "1_vision",
    evidence_count: 2,
    report_count: 0,
    credit_balance: 0,
    first_touch_at: "2026-01-01T00:00:00Z",
    last_activity_at: "2026-07-01T00:00:00Z",
    status: "active",
    ...over,
  };
}

/**
 * Hand-rolled supabase mock that satisfies the narrow RosterSupabaseLike
 * shape. Two tables are stubbed:
 *   - reseller_admins       filtered by (reseller_id, user_id, status)
 *   - reseller_startup_roster filtered by reseller_id + ordered by column.
 */
function mockSupabase(opts: {
  admins?: Array<{ reseller_id: string; user_id: string; role: string; status: string }>;
  roster?: StartupRosterEntry[];
  rosterError?: unknown;
}): RosterSupabaseLike {
  const admins = opts.admins ?? [];
  const roster = opts.roster ?? [];
  const impl = {
    from(table: string) {
      if (table === "reseller_admins") {
        return {
          select: (_cols: string) => ({
            eq: (_c1: string, resellerId: string) => ({
              eq: (_c2: string, userId: string) => ({
                eq: (_c3: string, status: string) => Promise.resolve({
                  data: admins.filter(
                    (a) =>
                      a.reseller_id === resellerId &&
                      a.user_id === userId &&
                      a.status === status,
                  ),
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "reseller_startup_roster") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, resellerId: string) => ({
              order: (col: string, { ascending }: { ascending: boolean }) =>
                Promise.resolve({
                  data: opts.rosterError
                    ? null
                    : roster
                        .filter((r) => r.reseller_id === resellerId)
                        .slice()
                        .sort((a, b) => {
                          const va = (a as unknown as Record<string, unknown>)[col];
                          const vb = (b as unknown as Record<string, unknown>)[col];
                          if (va === vb) return 0;
                          if (va == null) return 1;
                          if (vb == null) return -1;
                          const cmp = (va as number | string) < (vb as number | string) ? -1 : 1;
                          return ascending ? cmp : -cmp;
                        }),
                  error: opts.rosterError ?? null,
                }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return impl as unknown as RosterSupabaseLike;
}

describe("RosterFiltersSchema", () => {
  it("applies defaults when the input is {}", () => {
    const parsed = RosterFiltersSchema.parse({});
    expect(parsed).toEqual({
      status: "all",
      sortBy: "last_activity_at",
      sortDir: "desc",
    });
  });

  it("rejects unknown status values", () => {
    expect(() => RosterFiltersSchema.parse({ status: "bogus" })).toThrow();
  });
});

describe("isResellerOwner", () => {
  it("returns true for an active owner", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
    });
    expect(await isResellerOwner(RESELLER_ID, OWNER_USER_ID, db)).toBe(true);
  });

  it("returns false for an admin (non-owner) role", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "admin", status: "active" }],
    });
    expect(await isResellerOwner(RESELLER_ID, OWNER_USER_ID, db)).toBe(false);
  });

  it("returns false when no membership row exists", async () => {
    const db = mockSupabase({ admins: [] });
    expect(await isResellerOwner(RESELLER_ID, OTHER_USER_ID, db)).toBe(false);
  });
});

describe("readResellerRoster", () => {
  it("returns [] for a non-owner user (happy-path silent deny)", async () => {
    const db = mockSupabase({
      admins: [], // OTHER_USER_ID is not linked
      roster: [makeRow()],
    });
    const rows = await readResellerRoster(RESELLER_ID, OTHER_USER_ID, {}, db);
    expect(rows).toEqual([]);
  });

  it("returns [] for an unknown reseller id", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
      roster: [makeRow({ reseller_id: RESELLER_ID })],
    });
    // Owner of RESELLER_ID asking for a different reseller — 0 rows.
    const rows = await readResellerRoster("reseller-elsewhere", OWNER_USER_ID, {}, db);
    expect(rows).toEqual([]);
  });

  it("returns all rows for an owner when status=all", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
      roster: [
        makeRow({ business_id: "b1", status: "active", trust_score: 40 }),
        makeRow({ business_id: "b2", status: "onboarding", trust_score: 60 }),
        makeRow({ business_id: "b3", status: "churned", trust_score: 80 }),
      ],
    });
    const rows = await readResellerRoster(RESELLER_ID, OWNER_USER_ID, {}, db);
    expect(rows).toHaveLength(3);
  });

  it("filters by status pill", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
      roster: [
        makeRow({ business_id: "b1", status: "active" }),
        makeRow({ business_id: "b2", status: "onboarding" }),
        makeRow({ business_id: "b3", status: "active" }),
      ],
    });
    const rows = await readResellerRoster(
      RESELLER_ID,
      OWNER_USER_ID,
      { status: "active" },
      db,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "active")).toBe(true);
  });

  it("sorts by trust_score asc/desc", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
      roster: [
        makeRow({ business_id: "b1", trust_score: 40 }),
        makeRow({ business_id: "b2", trust_score: 90 }),
        makeRow({ business_id: "b3", trust_score: 60 }),
      ],
    });
    const desc = await readResellerRoster(
      RESELLER_ID,
      OWNER_USER_ID,
      { sortBy: "trust_score", sortDir: "desc" },
      db,
    );
    expect(desc.map((r) => r.trust_score)).toEqual([90, 60, 40]);

    const asc = await readResellerRoster(
      RESELLER_ID,
      OWNER_USER_ID,
      { sortBy: "trust_score", sortDir: "asc" },
      db,
    );
    expect(asc.map((r) => r.trust_score)).toEqual([40, 60, 90]);
  });

  it("returns [] on DB error rather than throwing", async () => {
    const db = mockSupabase({
      admins: [{ reseller_id: RESELLER_ID, user_id: OWNER_USER_ID, role: "owner", status: "active" }],
      rosterError: new Error("boom"),
    });
    const rows = await readResellerRoster(RESELLER_ID, OWNER_USER_ID, {}, db);
    expect(rows).toEqual([]);
  });
});

describe("summariseRoster", () => {
  it("aggregates totals, avg trust score, stage + status counts", () => {
    const rows = [
      makeRow({ business_id: "b1", trust_score: 40, unicorn_stage_id: "S0", status: "active" }),
      makeRow({ business_id: "b2", trust_score: 80, unicorn_stage_id: "S0", status: "paying" }),
      makeRow({ business_id: "b3", trust_score: null, unicorn_stage_id: "S1", status: "active" }),
    ];
    const s = summariseRoster(rows);
    expect(s.total).toBe(3);
    expect(s.avg_trust_score).toBe(60);
    expect(s.by_stage).toEqual({ S0: 2, S1: 1 });
    expect(s.by_status.active).toBe(2);
    expect(s.by_status.paying).toBe(1);
    expect(s.by_status.churned).toBe(0);
  });

  it("returns avg_trust_score=null when no rows have a score", () => {
    const rows = [
      makeRow({ trust_score: null, unicorn_stage_id: null }),
    ];
    const s = summariseRoster(rows);
    expect(s.avg_trust_score).toBeNull();
    expect(s.by_stage).toEqual({ unknown: 1 });
  });
});
