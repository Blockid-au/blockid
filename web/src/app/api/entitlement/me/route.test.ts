// Unit tests for GET /api/entitlement/me — P9-entitlement-me-route-test.
//
// The client hook (useEntitlement) polls this every 60 s and on window focus;
// it is the ONLY server → browser projection of session entitlements. Silent
// regressions this pins against:
//   - dropping the anonymous fast path and forcing every visitor through
//     resolveSegment / resolveJurisdiction / loadTrialState (would hit the DB
//     on every page load for logged-out traffic and trip rate limits);
//   - dropping `jurisdiction ?? undefined` before building UserWithPlan
//     (trialSummary and downstream `can()` compare on undefined, not null —
//     passing null flips future jurisdiction gates the wrong way);
//   - hardcoding legal_review_passed=true (placeholder-false is a deliberate
//     safety default; flipping it to true would auto-unlock legal-gated UI);
//   - narrowing / widening the loadTrialState SELECT list (the trial columns
//     are wired to the trialSummary contract in @/lib/trial and drift silently);
//   - dropping the Cache-Control: private, max-age=60 header (would cause the
//     browser hook to hammer the route on every render);
//   - the fall-through catches in resolveSegment / resolveJurisdiction /
//     loadTrialState — a bare throw on a pre-migration DB must not 500 the
//     whole entitlement projection.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{
    id: string;
    email: string;
    plan: string | null;
  } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getEntitlementsMock = vi.fn<(plan: string | null | undefined) => Promise<string[]>>();
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (p: string | null | undefined) => getEntitlementsMock(p),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const trialSummaryMock = vi.fn<
  (user: unknown, state: unknown) => unknown
>();
vi.mock("@/lib/trial", () => ({
  trialSummary: (user: unknown, state: unknown) => trialSummaryMock(user, state),
}));

// hasActiveResellerMembership() runs a `.select().eq().eq().limit()` chain
// that the local fake-supabase harness below (single-eq → maybeSingle) does
// not model. Mocking the helper at the module boundary keeps this test file
// focused on the response-envelope + trial-summary contracts it was written
// to pin, and delegates membership-probe semantics to
// src/lib/reseller/has-active-reseller-membership.test.ts.
const hasActiveResellerMembershipMock = vi.fn<(userId: string) => Promise<boolean>>();
vi.mock("@/lib/reseller/scope", () => ({
  hasActiveResellerMembership: (userId: string) =>
    hasActiveResellerMembershipMock(userId),
}));

import { GET, dynamic } from "./route";

// ---------------------------------------------------------------------------
// Fake supabase — a per-table script keyed by (table, column) so we can pin
// the exact select column list the route uses and stub failures per branch.
// ---------------------------------------------------------------------------

interface FakeTableState {
  selectCols: string | null;
  eqCol: string | null;
  eqVal: unknown;
  maybeSingleCalls: number;
  data: unknown;
  throwOnAwait: boolean;
}

interface FakeState {
  fromCalls: Array<string>;
  tables: Record<string, FakeTableState>;
}

const state: FakeState = {
  fromCalls: [],
  tables: {},
};

function tableState(name: string): FakeTableState {
  if (!state.tables[name]) {
    state.tables[name] = {
      selectCols: null,
      eqCol: null,
      eqVal: null,
      maybeSingleCalls: 0,
      data: null,
      throwOnAwait: false,
    };
  }
  return state.tables[name];
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      const ts = tableState(table);
      return {
        select(cols: string) {
          ts.selectCols = cols;
          return {
            eq(col: string, val: unknown) {
              ts.eqCol = col;
              ts.eqVal = val;
              return {
                maybeSingle() {
                  ts.maybeSingleCalls += 1;
                  if (ts.throwOnAwait) {
                    return Promise.reject(new Error("boom-" + table));
                  }
                  return Promise.resolve({ data: ts.data });
                },
              };
            },
          };
        },
      };
    },
  };
}

function resetState() {
  state.fromCalls = [];
  state.tables = {};
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getEntitlementsMock.mockReset();
  getSupabaseAdminMock.mockReset();
  trialSummaryMock.mockReset();
  hasActiveResellerMembershipMock.mockReset();

  // Defaults: authenticated user, supabase configured, benign trial summary,
  // NOT a reseller admin (the common case — additional reseller-membership
  // merge behaviour is covered in has-active-reseller-membership.test.ts).
  getCurrentUserMock.mockResolvedValue({
    id: "user-1",
    email: "u@x.com",
    plan: "growth",
  });
  getEntitlementsMock.mockResolvedValue(["feature.a", "feature.b"]);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  trialSummaryMock.mockReturnValue({
    inTrial: false,
    daysLeft: 0,
    endsAt: null,
    requiresPayment: false,
    status: null,
    planId: null,
  });
  hasActiveResellerMembershipMock.mockResolvedValue(false);
});

// ---------------------------------------------------------------------------
// Dynamic export — per-user projection must never prerender.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user results never bake into the build cache', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Anonymous branch — must skip every DB roundtrip and return the free-tier
// projection with an empty trial. This is hit on every logged-out page load.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — anonymous branch", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(null);
    getEntitlementsMock.mockResolvedValue(["free.a"]);
  });

  it("returns 200 (not 401) — the free-tier projection is public", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("calls getEntitlements exactly once with the literal 'free' plan", async () => {
    await GET();
    expect(getEntitlementsMock).toHaveBeenCalledTimes(1);
    expect(getEntitlementsMock).toHaveBeenCalledWith("free");
  });

  it("body pins the anonymous envelope: user_id=null, plan='free', segment='founder', jurisdiction=null, legal_review_passed=false", async () => {
    const body = await (await GET()).json();
    expect(body.user_id).toBeNull();
    expect(body.plan).toBe("free");
    expect(body.segment).toBe("founder");
    expect(body.jurisdiction).toBeNull();
    expect(body.legal_review_passed).toBe(false);
  });

  it("body.entitlements is the array returned by getEntitlements('free')", async () => {
    getEntitlementsMock.mockResolvedValue(["a", "b", "c"]);
    const body = await (await GET()).json();
    expect(body.entitlements).toEqual(["a", "b", "c"]);
  });

  it("body.trial is the empty-trial shape (all defaults, no live status)", async () => {
    const body = await (await GET()).json();
    expect(body.trial).toEqual({
      inTrial: false,
      daysLeft: 0,
      endsAt: null,
      requiresPayment: false,
      status: null,
      planId: null,
    });
  });

  it("does NOT touch supabase on the anonymous branch (getSupabaseAdmin never invoked)", async () => {
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toHaveLength(0);
  });

  it("does NOT call trialSummary — the empty-trial literal is baked into the route", async () => {
    await GET();
    expect(trialSummaryMock).not.toHaveBeenCalled();
  });

  it("sets Cache-Control: private, max-age=60 so the browser hook doesn't hammer the route", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });
});

// ---------------------------------------------------------------------------
// Authenticated branch — resolveSegment / resolveJurisdiction / loadTrialState
// each fan out to supabase; the route composes their results into UserWithPlan.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — authenticated happy path", () => {
  beforeEach(() => {
    tableState("app_users").data = {
      segment: "growth",
      jurisdiction: "AU",
    };
    tableState("subscription_trial_state").data = {
      user_id: "user-1",
      stripe_subscription_id: "sub_1",
      plan_id: "growth",
      trial_start: "2026-08-01T00:00:00Z",
      trial_end: "2026-08-15T00:00:00Z",
      status: "trialing",
      payment_method_id: "pm_1",
      reminder_sent: {},
      updated_at: "2026-08-05T00:00:00Z",
    };
  });

  it("returns 200 with the composed EntitlementMeResponse envelope", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBe("user-1");
    expect(body.plan).toBe("growth");
    expect(body.segment).toBe("growth");
    expect(body.jurisdiction).toBe("AU");
    expect(body.legal_review_passed).toBe(false);
    expect(body.entitlements).toEqual(["feature.a", "feature.b"]);
  });

  it("forwards user.plan verbatim into getEntitlements (no coercion / no downgrade)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "u@x.com",
      plan: "scale",
    });
    await GET();
    expect(getEntitlementsMock).toHaveBeenCalledWith("scale");
  });

  it("falls back to 'free' when user.plan is null (no plan claim on the session cookie)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "u@x.com",
      plan: null,
    });
    await GET();
    expect(getEntitlementsMock).toHaveBeenCalledWith("free");
    const body = await (await GET()).json();
    expect(body.plan).toBe("free");
  });

  it("calls trialSummary with a UserWithPlan carrying { id, plan, segment, jurisdiction } — the exact shape entitlements/trial contracts consume", async () => {
    await GET();
    expect(trialSummaryMock).toHaveBeenCalledTimes(1);
    const [uwp, trialState] = trialSummaryMock.mock.calls[0];
    expect(uwp).toEqual({
      id: "user-1",
      plan: "growth",
      segment: "growth",
      jurisdiction: "AU",
    });
    expect(trialState).toMatchObject({
      user_id: "user-1",
      stripe_subscription_id: "sub_1",
    });
  });

  it("passes jurisdiction=undefined (NOT null) into UserWithPlan when resolveJurisdiction returns null — protects downstream `can()` jurisdiction gates", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: null };
    await GET();
    const uwp = trialSummaryMock.mock.calls[0][0] as { jurisdiction?: unknown };
    expect(uwp.jurisdiction).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(uwp, "jurisdiction")).toBe(true);
  });

  it("body.trial is the value returned by trialSummary (route does not transform the summary)", async () => {
    trialSummaryMock.mockReturnValue({
      inTrial: true,
      daysLeft: 7,
      endsAt: new Date("2026-08-15T00:00:00Z"),
      requiresPayment: false,
      status: "trialing",
      planId: "growth",
    });
    const body = await (await GET()).json();
    expect(body.trial).toMatchObject({
      inTrial: true,
      daysLeft: 7,
      requiresPayment: false,
      status: "trialing",
      planId: "growth",
    });
  });

  it("legal_review_passed is hardcoded false (placeholder safety default — flipping to true would auto-unlock legal-gated UI)", async () => {
    const body = await (await GET()).json();
    expect(body.legal_review_passed).toBe(false);
  });

  it("sets Cache-Control: private, max-age=60 on the authenticated response too", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("issues Promise.all so entitlements + trial state are fetched in parallel (not serially)", async () => {
    // Both must be requested — trialSummary is the tail consumer of the parallel pair.
    await GET();
    expect(getEntitlementsMock).toHaveBeenCalledTimes(1);
    expect(tableState("subscription_trial_state").maybeSingleCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveSegment — app_users.segment lookup. All fall-throughs return 'founder'.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — resolveSegment", () => {
  it("queries the app_users table with select('segment') filtered by id = user.id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
      plan: "growth",
    });
    tableState("app_users").data = { segment: "growth", jurisdiction: null };
    await GET();
    const ts = tableState("app_users");
    // resolveSegment + resolveJurisdiction both hit app_users. The segment
    // resolver runs first, so its (select, eq) is overwritten by the
    // jurisdiction one — assert only the final call carries user.id.
    expect(ts.eqCol).toBe("id");
    expect(ts.eqVal).toBe("founder-42");
    expect(ts.maybeSingleCalls).toBeGreaterThanOrEqual(2);
  });

  it("uses maybeSingle() (not .single()) so a missing row does not throw", async () => {
    tableState("app_users").data = null;
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("falls back to 'founder' when getSupabaseAdmin() returns null (pre-migration / no service key)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const body = await (await GET()).json();
    expect(body.segment).toBe("founder");
    expect(body.jurisdiction).toBeNull();
  });

  it("falls back to 'founder' when the app_users row is null (user_id not yet in the segment table)", async () => {
    tableState("app_users").data = null;
    const body = await (await GET()).json();
    expect(body.segment).toBe("founder");
  });

  it("falls back to 'founder' when the row has no `segment` column (pre-migration schema)", async () => {
    tableState("app_users").data = { jurisdiction: "AU" };
    const body = await (await GET()).json();
    expect(body.segment).toBe("founder");
  });

  it("falls back to 'founder' when segment is the empty string (length-0 guard)", async () => {
    tableState("app_users").data = { segment: "", jurisdiction: "AU" };
    const body = await (await GET()).json();
    expect(body.segment).toBe("founder");
  });

  it("falls back to 'founder' when the supabase call throws (try/catch swallows and returns default)", async () => {
    tableState("app_users").throwOnAwait = true;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.segment).toBe("founder");
    expect(body.jurisdiction).toBeNull();
  });

  it("passes through a valid non-'founder' segment verbatim (no whitelist enforcement — segment values are open-ended)", async () => {
    tableState("app_users").data = { segment: "agency-partner", jurisdiction: "AU" };
    const body = await (await GET()).json();
    expect(body.segment).toBe("agency-partner");
  });
});

// ---------------------------------------------------------------------------
// resolveJurisdiction — app_users.jurisdiction lookup. Missing → null.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — resolveJurisdiction", () => {
  it("returns null (NOT the empty string) when jurisdiction is '' — length-0 guard is authoritative", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "" };
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBeNull();
  });

  it("returns null when the jurisdiction column is missing entirely (pre-migration row)", async () => {
    tableState("app_users").data = { segment: "growth" };
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBeNull();
  });

  it("returns null when the supabase call throws (try/catch swallows to null, not 'AU' default)", async () => {
    tableState("app_users").throwOnAwait = true;
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBeNull();
  });

  it("returns null when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBeNull();
  });

  it("passes a non-'AU' jurisdiction through verbatim (no jurisdiction whitelist at this layer)", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "NZ" };
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBe("NZ");
  });

  it("returns null when jurisdiction is explicit null (per the DB schema — column is nullable)", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: null };
    const body = await (await GET()).json();
    expect(body.jurisdiction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadTrialState — subscription_trial_state fetch. Failures degrade to null.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — loadTrialState", () => {
  it("queries the subscription_trial_state table filtered by user_id = user.id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-77",
      email: "f@x.com",
      plan: "growth",
    });
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    tableState("subscription_trial_state").data = null;
    await GET();
    const ts = tableState("subscription_trial_state");
    expect(ts.eqCol).toBe("user_id");
    expect(ts.eqVal).toBe("founder-77");
    expect(ts.maybeSingleCalls).toBe(1);
  });

  it("selects exactly the 9 columns the TrialSummary contract depends on — widening bloats the payload, narrowing breaks trialSummary()", async () => {
    tableState("subscription_trial_state").data = null;
    await GET();
    expect(tableState("subscription_trial_state").selectCols).toBe(
      "user_id, stripe_subscription_id, plan_id, trial_start, trial_end, status, payment_method_id, reminder_sent, updated_at",
    );
  });

  it("passes null trial state through to trialSummary when the row is missing (no active subscription)", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    tableState("subscription_trial_state").data = null;
    await GET();
    const [, trialState] = trialSummaryMock.mock.calls[0];
    expect(trialState).toBeNull();
  });

  it("passes null trial state through when getSupabaseAdmin() returns null (pre-migration DB)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    const [, trialState] = trialSummaryMock.mock.calls[0];
    expect(trialState).toBeNull();
  });

  it("passes null trial state through when the supabase call throws (try/catch → null, not 500)", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    tableState("subscription_trial_state").throwOnAwait = true;
    const res = await GET();
    expect(res.status).toBe(200);
    const [, trialState] = trialSummaryMock.mock.calls[0];
    expect(trialState).toBeNull();
  });

  it("passes the row verbatim to trialSummary when supabase returns data (no server-side coercion of dates)", async () => {
    const row = {
      user_id: "user-1",
      stripe_subscription_id: "sub_9",
      plan_id: "scale",
      trial_start: "2026-08-01T00:00:00Z",
      trial_end: "2026-08-15T00:00:00Z",
      status: "trialing",
      payment_method_id: null,
      reminder_sent: { day_1: true },
      updated_at: "2026-08-05T00:00:00Z",
    };
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    tableState("subscription_trial_state").data = row;
    await GET();
    const [, trialState] = trialSummaryMock.mock.calls[0];
    expect(trialState).toEqual(row);
  });
});

// ---------------------------------------------------------------------------
// Response envelope — the client hook parses these fields by exact name.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — response envelope", () => {
  it("Content-Type is application/json on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("Content-Type")?.toLowerCase()).toContain("application/json");
  });

  it("Content-Type is application/json on the authenticated branch", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    const res = await GET();
    expect(res.headers.get("Content-Type")?.toLowerCase()).toContain("application/json");
  });

  it("carries exactly the 7 top-level keys the useEntitlement hook consumes: user_id, plan, segment, jurisdiction, legal_review_passed, entitlements, trial (no extras leaked, no keys renamed)", async () => {
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "entitlements",
        "jurisdiction",
        "legal_review_passed",
        "plan",
        "segment",
        "trial",
        "user_id",
      ].sort(),
    );
  });

  it("entitlements is always an array (never null / undefined) on both branches", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getEntitlementsMock.mockResolvedValue([]);
    const anonBody = await (await GET()).json();
    expect(Array.isArray(anonBody.entitlements)).toBe(true);

    getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com", plan: "growth" });
    tableState("app_users").data = { segment: "growth", jurisdiction: "AU" };
    getEntitlementsMock.mockResolvedValue([]);
    const authBody = await (await GET()).json();
    expect(Array.isArray(authBody.entitlements)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reseller-membership merge — reseller owners on founder plans (e.g. growth)
// must have reseller.console entitlements folded into their response so the
// sidebar renders the Reseller nav group and the /reseller layout gate lets
// them through. Regression guard for the "reseller login" mis-gate.
// ---------------------------------------------------------------------------

describe("GET /api/entitlement/me — reseller_admins membership merge", () => {
  beforeEach(() => {
    tableState("app_users").data = { segment: "founder", jurisdiction: "AU" };
  });

  it("does NOT add reseller.* entitlements when the user has no active reseller_admins row", async () => {
    hasActiveResellerMembershipMock.mockResolvedValue(false);
    getEntitlementsMock.mockResolvedValue(["feature.a"]);
    const body = await (await GET()).json();
    expect(body.entitlements).toEqual(["feature.a"]);
  });

  it("merges reseller.console + reseller.create_startup + reseller.grant_credits when the user IS an active reseller admin", async () => {
    hasActiveResellerMembershipMock.mockResolvedValue(true);
    getEntitlementsMock.mockResolvedValue(["feature.a"]);
    const body = await (await GET()).json();
    expect(body.entitlements).toEqual(
      expect.arrayContaining([
        "feature.a",
        "reseller.console",
        "reseller.create_startup",
        "reseller.grant_credits",
      ]),
    );
  });

  it("does NOT duplicate reseller.* when they were already in the plan bundle (e.g. plan=reseller_admin)", async () => {
    hasActiveResellerMembershipMock.mockResolvedValue(true);
    getEntitlementsMock.mockResolvedValue([
      "reseller.console",
      "reseller.create_startup",
      "reseller.grant_credits",
    ]);
    const body = await (await GET()).json();
    const counts = (body.entitlements as string[]).reduce<Record<string, number>>((acc, e) => {
      acc[e] = (acc[e] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["reseller.console"]).toBe(1);
    expect(counts["reseller.create_startup"]).toBe(1);
    expect(counts["reseller.grant_credits"]).toBe(1);
  });

  it("does NOT probe reseller_admins on the anonymous branch (fast path stays cheap)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(hasActiveResellerMembershipMock).not.toHaveBeenCalled();
  });

  it("passes the current user's id to the membership probe", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-42",
      email: "owner@partner.example",
      plan: "growth",
    });
    tableState("app_users").data = { segment: "founder", jurisdiction: "AU" };
    await GET();
    expect(hasActiveResellerMembershipMock).toHaveBeenCalledWith("user-42");
  });
});
