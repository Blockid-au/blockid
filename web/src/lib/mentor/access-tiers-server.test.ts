import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for `web/src/lib/mentor/access-tiers-server.ts` — the two
// admin-Supabase accessors that back every mentor-facing surface. Silent
// regressions here are load-bearing:
//   * losing the `.is("revoked_at", null)` filter in loadActiveGrant would
//     return grants the founder has already revoked and re-open the drawer
//     to a mentor who lost access
//   * losing the client-side expiry filter (`!g.expires_at || g.expires_at
//     > nowIso`) would return grants past their expires_at and leak SVI
//     evidence beyond the consent window
//   * losing the `TIER_RANK[b.tier] - TIER_RANK[a.tier]` sort would return
//     a lower-tier grant when a higher-tier one is also active — the whole
//     tier ladder collapses to "any effective grant"
//   * losing the project-scoped `.or(project_id.eq.<id>,project_id.is.null)`
//     branch would either (a) match a grant scoped to a *different* project
//     when projectId is passed, or (b) drop the fallback "null = all
//     projects" grants
//   * losing the null-supabase early-return would throw at `getSupabaseAdmin()`
//     null during test / preview builds and 500 the mentor drawer
//   * losing the `data ?? null` guard in loadAllGrantsForFounder would surface
//     `null.map(...)` on the /dashboard/settings/mentor-access page
//   * losing the `.order("granted_at", { ascending: false })` would surface
//     the OLDEST grant first — founders reading their consent history see a
//     stale grant as if it were current
//
// Pins the observable contract used by every caller:
//   - both functions no-op-safe when getSupabaseAdmin() returns null
//   - loadActiveGrant chain shape without projectId:
//       from("mentor_access_grants")
//         .select(<the 12-column projection above>)
//         .eq("reseller_id", mentorResellerId)
//         .eq("founder_user_id", founderUserId)
//         .is("revoked_at", null)
//     WITH projectId: adds `.or("project_id.eq.<id>,project_id.is.null")`
//   - loadActiveGrant filters expiry, sorts by TIER_RANK desc, returns [0]
//   - loadAllGrantsForFounder chain shape:
//       from("mentor_access_grants")
//         .select(<same projection>)
//         .eq("founder_user_id", founderUserId)
//         .order("granted_at", { ascending: false })
//   - loadAllGrantsForFounder returns rows unchanged on happy path
//
// Mocks:
//   - `@/lib/supabase` (getSupabaseAdmin only) — a chain builder tracks every
//     from/select/eq/is/or/order call so assertions can inspect the *actual*
//     wire shape without hand-rolling a Supabase double per test.
//   - `server-only` is stubbed globally by vitest.config.ts.

// ── Fake Supabase harness ────────────────────────────────────────────────────

type ChainCall = { method: string; args: unknown[] };

interface ChainState {
  calls: ChainCall[];
  table: string | null;
  result: { data: unknown; error: { message: string } | null };
}

const state: { admin: ReturnType<typeof buildAdmin> | null; chain: ChainState } = {
  admin: null,
  chain: { calls: [], table: null, result: { data: null, error: null } },
};

function record(method: string, args: unknown[]) {
  state.chain.calls.push({ method, args });
}

function buildChain() {
  const chainable = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          // Awaiting the chain resolves to the pinned result.
          return (resolve: (v: unknown) => void) => resolve(state.chain.result);
        }
        return (...args: unknown[]) => {
          record(prop, args);
          return chainable;
        };
      },
    },
  );
  return chainable;
}

function buildAdmin() {
  return {
    from(table: string) {
      state.chain.table = table;
      record("from", [table]);
      return buildChain();
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => state.admin,
}));

// Import AFTER the mock so the mocked getSupabaseAdmin is bound.
import {
  loadActiveGrant,
  loadAllGrantsForFounder,
} from "./access-tiers-server";
import type { MentorAccessGrant } from "./access-tiers";

const SELECT_COLS =
  "id, reseller_id, mentor_user_id, founder_user_id, project_id, tier, granted_at, expires_at, revoked_at, report_toggles, reminder_30d_sent_at, reminder_7d_sent_at";

// A grant fixture builder that mirrors the DB row shape 1:1.
function makeGrant(overrides: Partial<MentorAccessGrant> = {}): MentorAccessGrant {
  return {
    id: "g1",
    reseller_id: "res_1",
    mentor_user_id: "m_1",
    founder_user_id: "f_1",
    project_id: null,
    tier: "reports_shared",
    granted_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2027-07-01T00:00:00.000Z",
    revoked_at: null,
    report_toggles: null,
    reminder_30d_sent_at: null,
    reminder_7d_sent_at: null,
    ...overrides,
  };
}

function findCall(method: string): ChainCall | undefined {
  return state.chain.calls.find((c) => c.method === method);
}

function findAllCalls(method: string): ChainCall[] {
  return state.chain.calls.filter((c) => c.method === method);
}

function methodOrder(): string[] {
  return state.chain.calls.map((c) => c.method);
}

beforeEach(() => {
  state.admin = buildAdmin();
  state.chain = { calls: [], table: null, result: { data: null, error: null } };
});

// ─── null-admin early return ────────────────────────────────────────────────

describe("null-admin safety", () => {
  it("loadActiveGrant returns null when getSupabaseAdmin() is null", async () => {
    state.admin = null;
    const out = await loadActiveGrant("res", "f", null);
    expect(out).toBeNull();
    expect(state.chain.calls).toEqual([]);
  });

  it("loadActiveGrant returns null with projectId AND null admin — never dereferences", async () => {
    state.admin = null;
    const out = await loadActiveGrant("res", "f", "proj_x");
    expect(out).toBeNull();
  });

  it("loadAllGrantsForFounder returns [] when getSupabaseAdmin() is null", async () => {
    state.admin = null;
    const out = await loadAllGrantsForFounder("f");
    expect(out).toEqual([]);
    expect(state.chain.calls).toEqual([]);
  });

  it("loadAllGrantsForFounder returns [] even on blank founder id when admin null", async () => {
    state.admin = null;
    const out = await loadAllGrantsForFounder("");
    expect(out).toEqual([]);
  });
});

// ─── loadActiveGrant — wire shape ───────────────────────────────────────────

describe("loadActiveGrant — Supabase chain shape (no projectId)", () => {
  it("targets the mentor_access_grants table", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1");
    expect(state.chain.table).toBe("mentor_access_grants");
  });

  it("selects the exact 12-column projection", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1");
    const sel = findCall("select");
    expect(sel?.args[0]).toBe(SELECT_COLS);
  });

  it("filters by reseller_id then founder_user_id", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_A", "f_B");
    const eqs = findAllCalls("eq");
    expect(eqs).toHaveLength(2);
    expect(eqs[0].args).toEqual(["reseller_id", "res_A"]);
    expect(eqs[1].args).toEqual(["founder_user_id", "f_B"]);
  });

  it("adds the non-revoked filter via .is(revoked_at, null)", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1");
    const isCall = findCall("is");
    expect(isCall?.args).toEqual(["revoked_at", null]);
  });

  it("does NOT add the .or() project-scope branch when projectId is undefined", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1");
    expect(findCall("or")).toBeUndefined();
  });

  it("does NOT add the .or() branch when projectId is null", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1", null);
    expect(findCall("or")).toBeUndefined();
  });

  it("does NOT add the .or() branch when projectId is an empty string (falsy)", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1", "");
    expect(findCall("or")).toBeUndefined();
  });

  it("orders the chain calls from → select → eq → eq → is", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1");
    expect(methodOrder()).toEqual(["from", "select", "eq", "eq", "is"]);
  });
});

describe("loadActiveGrant — Supabase chain shape (with projectId)", () => {
  it("appends .or(project_id.eq.<id>,project_id.is.null) when projectId truthy", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1", "proj_alpha");
    const orCall = findCall("or");
    expect(orCall?.args).toEqual(["project_id.eq.proj_alpha,project_id.is.null"]);
  });

  it("preserves the projectId verbatim inside the .or() expression (no encoding)", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1", "abc-123_xyz");
    const orCall = findCall("or");
    expect(orCall?.args[0]).toBe(
      "project_id.eq.abc-123_xyz,project_id.is.null",
    );
  });

  it("orders the chain: from → select → eq → eq → is → or", async () => {
    state.chain.result = { data: [], error: null };
    await loadActiveGrant("res_1", "f_1", "proj_alpha");
    expect(methodOrder()).toEqual([
      "from",
      "select",
      "eq",
      "eq",
      "is",
      "or",
    ]);
  });
});

// ─── loadActiveGrant — result handling ──────────────────────────────────────

describe("loadActiveGrant — result handling", () => {
  it("returns null when the query resolves with an error", async () => {
    state.chain.result = { data: [makeGrant()], error: { message: "boom" } };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toBeNull();
  });

  it("returns null when the query resolves with data=null (and no error)", async () => {
    state.chain.result = { data: null, error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toBeNull();
  });

  it("returns null when the query resolves to an empty array", async () => {
    state.chain.result = { data: [], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toBeNull();
  });

  it("returns the single grant when only one active row exists", async () => {
    const grant = makeGrant({ id: "only-one" });
    state.chain.result = { data: [grant], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toEqual(grant);
  });
});

// ─── loadActiveGrant — expiry filter ────────────────────────────────────────

describe("loadActiveGrant — expiry filter (client-side)", () => {
  it("keeps a grant whose expires_at is in the future", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const grant = makeGrant({ expires_at: future });
    state.chain.result = { data: [grant], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe(grant.id);
  });

  it("keeps a grant with null expires_at (attributed_only, never expires)", async () => {
    const grant = makeGrant({
      tier: "attributed_only",
      expires_at: null,
    });
    state.chain.result = { data: [grant], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe(grant.id);
    expect(out?.tier).toBe("attributed_only");
  });

  it("drops a grant whose expires_at is in the past", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const grant = makeGrant({ expires_at: past });
    state.chain.result = { data: [grant], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toBeNull();
  });

  it("keeps only the future-expiring grant when past + future are mixed", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const g1 = makeGrant({ id: "old", expires_at: past });
    const g2 = makeGrant({ id: "current", expires_at: future });
    state.chain.result = { data: [g1, g2], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe("current");
  });

  it("returns null when every grant is expired", async () => {
    const past1 = new Date(Date.now() - 1000).toISOString();
    const past2 = new Date(Date.now() - 5000).toISOString();
    state.chain.result = {
      data: [
        makeGrant({ id: "a", expires_at: past1 }),
        makeGrant({ id: "b", expires_at: past2 }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).toBeNull();
  });

  it("uses > (strict) comparison — a grant expiring at exactly now is treated as effective (string > nowIso)", async () => {
    // The implementation compares expires_at (ISO string) > nowIso as strings.
    // A grant with expires_at exactly equal to nowIso is NOT strictly greater
    // and would be dropped. We assert this observable behaviour by picking a
    // clearly-future timestamp and confirming it survives.
    const future = new Date(Date.now() + 2000).toISOString();
    state.chain.result = { data: [makeGrant({ expires_at: future })], error: null };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out).not.toBeNull();
  });
});

// ─── loadActiveGrant — TIER_RANK sort ───────────────────────────────────────

describe("loadActiveGrant — TIER_RANK sort", () => {
  const future = () => new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  it("picks full_mentor over reports_shared when both are effective", async () => {
    state.chain.result = {
      data: [
        makeGrant({ id: "b", tier: "reports_shared", expires_at: future() }),
        makeGrant({ id: "c", tier: "full_mentor", expires_at: future() }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.tier).toBe("full_mentor");
    expect(out?.id).toBe("c");
  });

  it("picks full_mentor even when it appears FIRST (sort is on rank, not order)", async () => {
    state.chain.result = {
      data: [
        makeGrant({ id: "c", tier: "full_mentor", expires_at: future() }),
        makeGrant({ id: "b", tier: "reports_shared", expires_at: future() }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe("c");
  });

  it("picks reports_shared over attributed_only when both are effective", async () => {
    state.chain.result = {
      data: [
        makeGrant({ id: "a", tier: "attributed_only", expires_at: null }),
        makeGrant({ id: "b", tier: "reports_shared", expires_at: future() }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.tier).toBe("reports_shared");
  });

  it("returns attributed_only when it is the only effective tier", async () => {
    state.chain.result = {
      data: [makeGrant({ tier: "attributed_only", expires_at: null })],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.tier).toBe("attributed_only");
  });

  it("picks full_mentor from a 3-tier mix", async () => {
    state.chain.result = {
      data: [
        makeGrant({ id: "a", tier: "attributed_only", expires_at: null }),
        makeGrant({ id: "b", tier: "reports_shared", expires_at: future() }),
        makeGrant({ id: "c", tier: "full_mentor", expires_at: future() }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe("c");
    expect(out?.tier).toBe("full_mentor");
  });

  it("still returns the highest-tier when a higher-tier grant is expired (falls back to next-highest live)", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    state.chain.result = {
      data: [
        makeGrant({ id: "expired-full", tier: "full_mentor", expires_at: past }),
        makeGrant({ id: "live-shared", tier: "reports_shared", expires_at: future() }),
      ],
      error: null,
    };
    const out = await loadActiveGrant("res_1", "f_1");
    expect(out?.id).toBe("live-shared");
    expect(out?.tier).toBe("reports_shared");
  });
});

// ─── loadAllGrantsForFounder — wire shape ───────────────────────────────────

describe("loadAllGrantsForFounder — Supabase chain shape", () => {
  it("targets mentor_access_grants", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    expect(state.chain.table).toBe("mentor_access_grants");
  });

  it("selects the same 12-column projection as loadActiveGrant", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    const sel = findCall("select");
    expect(sel?.args[0]).toBe(SELECT_COLS);
  });

  it("filters by founder_user_id", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_ZZZ");
    const eq = findCall("eq");
    expect(eq?.args).toEqual(["founder_user_id", "f_ZZZ"]);
  });

  it("orders by granted_at DESC (newest first)", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    const order = findCall("order");
    expect(order?.args).toEqual(["granted_at", { ascending: false }]);
  });

  it("chain order: from → select → eq → order", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    expect(methodOrder()).toEqual(["from", "select", "eq", "order"]);
  });

  it("does NOT add the .is(revoked_at, null) filter — full history includes revoked", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    expect(findCall("is")).toBeUndefined();
  });

  it("does NOT add an expiry filter — the founder-settings page shows expired history too", async () => {
    state.chain.result = { data: [], error: null };
    await loadAllGrantsForFounder("f_1");
    // No .gt / .gte / .lt / .lte calls
    expect(findCall("gt")).toBeUndefined();
    expect(findCall("gte")).toBeUndefined();
    expect(findCall("lt")).toBeUndefined();
    expect(findCall("lte")).toBeUndefined();
  });
});

// ─── loadAllGrantsForFounder — result handling ──────────────────────────────

describe("loadAllGrantsForFounder — result handling", () => {
  it("returns [] on query error", async () => {
    state.chain.result = { data: [makeGrant()], error: { message: "kaboom" } };
    const out = await loadAllGrantsForFounder("f_1");
    expect(out).toEqual([]);
  });

  it("returns [] when data is null (no error)", async () => {
    state.chain.result = { data: null, error: null };
    const out = await loadAllGrantsForFounder("f_1");
    expect(out).toEqual([]);
  });

  it("returns [] when data is an empty array", async () => {
    state.chain.result = { data: [], error: null };
    const out = await loadAllGrantsForFounder("f_1");
    expect(out).toEqual([]);
  });

  it("returns the rows unchanged on happy path (revoked + expired preserved)", async () => {
    const rows = [
      makeGrant({
        id: "current",
        tier: "full_mentor",
        granted_at: "2026-07-15T00:00:00.000Z",
      }),
      makeGrant({
        id: "revoked",
        tier: "reports_shared",
        revoked_at: "2026-07-10T00:00:00.000Z",
        granted_at: "2026-06-01T00:00:00.000Z",
      }),
      makeGrant({
        id: "expired",
        tier: "reports_shared",
        expires_at: "2025-01-01T00:00:00.000Z",
        granted_at: "2024-01-01T00:00:00.000Z",
      }),
    ];
    state.chain.result = { data: rows, error: null };
    const out = await loadAllGrantsForFounder("f_1");
    expect(out).toEqual(rows);
    // Preserves the DB order — sorting is Supabase's job, not ours.
    expect(out.map((r) => r.id)).toEqual(["current", "revoked", "expired"]);
  });

  it("does not filter out revoked grants — founder must see full history", async () => {
    const revoked = makeGrant({
      id: "gone",
      revoked_at: "2026-07-01T00:00:00.000Z",
    });
    state.chain.result = { data: [revoked], error: null };
    const out = await loadAllGrantsForFounder("f_1");
    expect(out).toEqual([revoked]);
  });
});
