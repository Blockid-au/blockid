// Unit tests for GET /api/badges — P9-badges-route-test.
//
// Route powers the founder's Milestone Badge wall: for the logged-in caller
// it splits the fixed BADGE_DEFS registry (15 badges — Explorer / SVI
// thresholds / evidence / integrations / streaks) into `badges` (earned,
// with achieved_at) and `available` (unearned, with description copy for
// the "how to unlock" tooltip). Four exit paths:
//   1. anonymous → 401 { ok: false, reason: "Authentication required" }
//   2. supabase unconfigured → 200 all 15 in `available`, `badges: []`
//   3. account row missing → 200 all 15 in `available`, `badges: []`
//   4. happy path — earned map joined by badge_code, split preserving order
//
// Silent regressions this pins against:
//   - dropping the 401 gate and leaking one founder's badge wall to every
//     anonymous caller (the .eq("email", user.email) SELECT is the ONLY
//     tenancy boundary between the caller and the svi_accounts row);
//   - the unconfigured branch touching supabase (would construct an admin
//     client with no service key and throw before returning the graceful
//     empty-state expected by the badge wall UI);
//   - dropping the `available` scaffold on the unconfigured / no-account
//     branches — the badge wall shows "How to unlock" prompts even before
//     the founder earns anything, so an empty available array would render
//     a blank page instead of the aspirational fixture;
//   - shipping the raw BadgeDef `condition` predicate function through the
//     JSON response (the route strips to {code,label,description|achieved_at}
//     because function serialisation would drop silently AND the closure
//     would embed our scoring logic in the client bundle);
//   - joining earned rows by `label` instead of `badge_code` (labels are
//     display copy and can drift — the join key must be the stable code);
//   - counting the milestones fetch's row order as authoritative (the split
//     preserves the fixed BADGE_DEFS order so the badge wall stays
//     deterministic across renders);
//   - dropping the account-null short-circuit and hitting svi_milestones
//     with `account_id = undefined` (leaks every milestone in the DB into
//     the caller's `badges` array — a cross-tenant read).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
const isSupabaseConfiguredMock = vi.fn<() => boolean>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

import { GET, dynamic } from "./route";
import { BADGE_DEFS } from "@/lib/badges";

// ── Fake supabase — captures each chain the route walks ────────────────────

interface AccountQueryLog {
  table: string;
  cols: string;
  eqCol: string;
  eqVal: unknown;
  terminator: "maybeSingle";
}

interface MilestonesQueryLog {
  table: string;
  cols: string;
  eqCol: string;
  eqVal: unknown;
}

interface FakeState {
  accountLogs: AccountQueryLog[];
  milestonesLogs: MilestonesQueryLog[];
  fromCalls: number;

  // Steer the two chains independently.
  accountData: { id: string } | null;
  milestonesData: Array<{ badge_code: string; achieved_at: string }> | null;
}

const state: FakeState = {
  accountLogs: [],
  milestonesLogs: [],
  fromCalls: 0,
  accountData: null,
  milestonesData: [],
};

function resetState() {
  state.accountLogs = [];
  state.milestonesLogs = [];
  state.fromCalls = 0;
  state.accountData = null;
  state.milestonesData = [];
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      if (table === "svi_accounts") {
        return {
          select(cols: string) {
            return {
              eq(col: string, val: unknown) {
                return {
                  maybeSingle() {
                    state.accountLogs.push({
                      table,
                      cols,
                      eqCol: col,
                      eqVal: val,
                      terminator: "maybeSingle",
                    });
                    return Promise.resolve({ data: state.accountData });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "svi_milestones") {
        return {
          select(cols: string) {
            return {
              eq(col: string, val: unknown) {
                state.milestonesLogs.push({
                  table,
                  cols,
                  eqCol: col,
                  eqVal: val,
                });
                return Promise.resolve({ data: state.milestonesData });
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table access: ${table}`);
    },
  };
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  isSupabaseConfiguredMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("GET /api/badges — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user results never land in the App Router static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/badges — BADGE_DEFS registry sanity", () => {
  it("BADGE_DEFS is non-empty (empty registry would ship a blank badge wall on every branch)", () => {
    expect(BADGE_DEFS.length).toBeGreaterThan(0);
  });

  it("every BADGE_DEF has a unique code (join key must be unique or earned rows collide silently)", () => {
    const codes = BADGE_DEFS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("GET /api/badges — anonymous branch", () => {
  it("returns 401 { ok: false, reason: 'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("does NOT touch supabase on the anonymous branch (short-circuits before isSupabaseConfigured / getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/badges — supabase-unconfigured branch", () => {
  it("returns 200 { ok: true, badges: [], available: [...all BADGE_DEFS] } when isSupabaseConfigured() is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.badges).toEqual([]);
    expect(body.available).toHaveLength(BADGE_DEFS.length);
  });

  it("does NOT call getSupabaseAdmin() when the env is unconfigured (avoids constructing an admin client with no service key)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("unconfigured `available` entries carry {code,label,description} only — never the raw condition() closure or icon", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const body = await (await GET()).json();
    for (const entry of body.available) {
      expect(Object.keys(entry).sort()).toEqual(
        ["code", "description", "label"].sort(),
      );
    }
  });

  it("unconfigured `available` preserves the fixed BADGE_DEFS order so the badge wall stays deterministic across renders", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const body = await (await GET()).json();
    expect(body.available.map((b: { code: string }) => b.code)).toEqual(
      BADGE_DEFS.map((b) => b.code),
    );
  });
});

describe("GET /api/badges — account-missing branch", () => {
  it("returns 200 { badges: [], available: [...all BADGE_DEFS] } when svi_accounts row is null (founder signed in but never created their SVI account)", async () => {
    state.accountData = null;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.badges).toEqual([]);
    expect(body.available).toHaveLength(BADGE_DEFS.length);
  });

  it("does NOT hit svi_milestones when the account lookup returned null (would leak every milestone in the DB via account_id = undefined)", async () => {
    state.accountData = null;
    await GET();
    expect(state.milestonesLogs).toHaveLength(0);
  });

  it("looks up svi_accounts by the caller's email, not id (svi_accounts is joined to auth by email — swapping to id silently misses every account)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "founder-42@x.com",
    });
    state.accountData = null;
    await GET();
    expect(state.accountLogs).toHaveLength(1);
    expect(state.accountLogs[0].table).toBe("svi_accounts");
    expect(state.accountLogs[0].eqCol).toBe("email");
    expect(state.accountLogs[0].eqVal).toBe("founder-42@x.com");
  });

  it("only SELECTs the `id` column from svi_accounts (widening the projection would pull PII the route never uses)", async () => {
    state.accountData = null;
    await GET();
    expect(state.accountLogs[0].cols).toBe("id");
  });

  it("uses .maybeSingle() on the svi_accounts lookup (not .single() — .single() would 500 on the no-row branch instead of degrading to the empty-state fixture)", async () => {
    state.accountData = null;
    await GET();
    expect(state.accountLogs[0].terminator).toBe("maybeSingle");
  });
});

describe("GET /api/badges — happy path (account + milestones)", () => {
  it("returns 200 { ok: true, badges, available } and splits BADGE_DEFS by earned code", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [
      { badge_code: "first_analysis", achieved_at: "2026-08-01T00:00:00Z" },
      { badge_code: "svi_50", achieved_at: "2026-08-02T00:00:00Z" },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.badges.map((b: { code: string }) => b.code).sort()).toEqual([
      "first_analysis",
      "svi_50",
    ]);
    expect(body.available).toHaveLength(BADGE_DEFS.length - 2);
    const availableCodes = body.available.map(
      (b: { code: string }) => b.code,
    );
    expect(availableCodes).not.toContain("first_analysis");
    expect(availableCodes).not.toContain("svi_50");
  });

  it("filters svi_milestones by account_id from the svi_accounts row (NOT the caller's user.id — the id spaces are distinct)", async () => {
    state.accountData = { id: "acc-xyz" };
    state.milestonesData = [];
    await GET();
    expect(state.milestonesLogs).toHaveLength(1);
    expect(state.milestonesLogs[0].table).toBe("svi_milestones");
    expect(state.milestonesLogs[0].eqCol).toBe("account_id");
    expect(state.milestonesLogs[0].eqVal).toBe("acc-xyz");
  });

  it("selects exactly `badge_code, achieved_at` from svi_milestones (widening would drop the payload budget; narrowing would break the achieved-at timestamp on earned badges)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [];
    await GET();
    expect(state.milestonesLogs[0].cols).toBe("badge_code, achieved_at");
  });

  it("earned badge entries carry {code,label,achieved_at} — NOT description (description belongs on unearned entries only, as the 'how to unlock' copy)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [
      { badge_code: "first_analysis", achieved_at: "2026-08-01T00:00:00Z" },
    ];
    const body = await (await GET()).json();
    expect(body.badges).toHaveLength(1);
    expect(Object.keys(body.badges[0]).sort()).toEqual(
      ["achieved_at", "code", "label"].sort(),
    );
    expect(body.badges[0].description).toBeUndefined();
    expect(body.badges[0].achieved_at).toBe("2026-08-01T00:00:00Z");
  });

  it("unearned badge entries carry {code,label,description} — NOT achieved_at (achieved_at only exists on earned rows)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [];
    const body = await (await GET()).json();
    for (const entry of body.available) {
      expect(Object.keys(entry).sort()).toEqual(
        ["code", "description", "label"].sort(),
      );
      expect(entry.achieved_at).toBeUndefined();
    }
  });

  it("preserves BADGE_DEFS declaration order in both `badges` and `available` (badge wall render is order-sensitive)", async () => {
    state.accountData = { id: "acc-1" };
    // Feed milestones in REVERSE order of BADGE_DEFS — the route must
    // still emit `badges` in BADGE_DEFS order (filter preserves order).
    const reversedCodes = [...BADGE_DEFS].reverse().map((b) => b.code);
    state.milestonesData = reversedCodes.map((code) => ({
      badge_code: code,
      achieved_at: "2026-08-01T00:00:00Z",
    }));
    const body = await (await GET()).json();
    expect(body.badges.map((b: { code: string }) => b.code)).toEqual(
      BADGE_DEFS.map((b) => b.code),
    );
    expect(body.available).toEqual([]);
  });

  it("earned achieved_at value flows through from the DB row verbatim (no server-side re-formatting drops the ISO tail)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [
      {
        badge_code: "first_analysis",
        achieved_at: "2026-07-14T13:37:00.123Z",
      },
    ];
    const body = await (await GET()).json();
    expect(body.badges[0].achieved_at).toBe("2026-07-14T13:37:00.123Z");
  });

  it("coerces a null milestones payload to an empty earned map (defensive against a supabase RLS-denied read returning {data:null})", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = null;
    const body = await (await GET()).json();
    expect(body.badges).toEqual([]);
    expect(body.available).toHaveLength(BADGE_DEFS.length);
  });

  it("badges ∪ available exhausts BADGE_DEFS with no overlap (every badge is either earned OR available, never both, never dropped)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [
      { badge_code: "svi_100", achieved_at: "2026-08-01T00:00:00Z" },
      { badge_code: "evidence_first", achieved_at: "2026-08-02T00:00:00Z" },
    ];
    const body = await (await GET()).json();
    const earnedCodes = new Set(
      body.badges.map((b: { code: string }) => b.code),
    );
    const availableCodes = new Set(
      body.available.map((b: { code: string }) => b.code),
    );
    for (const def of BADGE_DEFS) {
      const inEarned = earnedCodes.has(def.code);
      const inAvailable = availableCodes.has(def.code);
      expect(inEarned || inAvailable).toBe(true);
      expect(inEarned && inAvailable).toBe(false);
    }
    expect(earnedCodes.size + availableCodes.size).toBe(BADGE_DEFS.length);
  });

  it("silently ignores milestone rows whose badge_code is not in BADGE_DEFS (a deprecated code left in the DB must NOT surface as an earned badge with no label)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [
      { badge_code: "deprecated_v0_thing", achieved_at: "2026-08-01T00:00:00Z" },
    ];
    const body = await (await GET()).json();
    expect(body.badges).toEqual([]);
    expect(body.available).toHaveLength(BADGE_DEFS.length);
  });

  it("makes exactly one svi_accounts + one svi_milestones round-trip (no N+1 lookup per badge)", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [];
    await GET();
    expect(state.accountLogs).toHaveLength(1);
    expect(state.milestonesLogs).toHaveLength(1);
    expect(state.fromCalls).toBe(2);
  });
});

describe("GET /api/badges — response envelope", () => {
  it("anonymous body carries `reason` + ok:false and NO `badges`/`available` keys", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("Authentication required");
    expect(body.badges).toBeUndefined();
    expect(body.available).toBeUndefined();
  });

  it("authenticated body carries ok:true + `badges` + `available` and NO `reason` key", async () => {
    state.accountData = { id: "acc-1" };
    state.milestonesData = [];
    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    expect(body.badges).toBeDefined();
    expect(body.available).toBeDefined();
    expect(body.reason).toBeUndefined();
  });
});
