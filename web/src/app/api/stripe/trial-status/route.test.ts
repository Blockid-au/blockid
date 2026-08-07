// Colocated vitest for GET /api/stripe/trial-status — P9-trial-status-route-test.
//
// This route is polled by the workspace trial banner + trial-day-watcher
// upsell component to render the days-left countdown and decide whether to
// show the "add payment method" nudge. The response shape is a stable
// contract those two UI surfaces read directly, so silent field drops or
// misaligned defaults would break the banner.
//
// Regressions this suite is designed to catch:
//   - dropping the Cache-Control: no-store header on any response branch
//     would let a CDN cache one founder's trial state and serve it to
//     another;
//   - flipping inTrial to true when status !== "trialing" would trip the
//     banner for founders on paid plans;
//   - dropping the trialEnd future-check would keep the banner up
//     indefinitely on expired trials;
//   - dropping the payment_method_saved check on requiresPayment would nag
//     founders who already saved a card;
//   - swapping Math.ceil for Math.floor would show "0 days left" on the
//     final day (dismissing the banner too early);
//   - collapsing the no-Supabase branch to 500 would break preview
//     branches without Supabase credentials.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
}

interface TrialRow {
  plan_id: string | null;
  status: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  payment_method_saved: boolean | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  isSupabaseConfiguredMock: vi.fn<() => boolean>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake Supabase -----------------------------------------------------------

interface FakeState {
  trialRow: TrialRow | null;
  fromCalls: string[];
  selectCols: string | null;
  eqCol: string | null;
  eqVal: unknown;
  lookupError: { message: string } | null;
}

const state: FakeState = {
  trialRow: null,
  fromCalls: [],
  selectCols: null,
  eqCol: null,
  eqVal: null,
  lookupError: null,
};

function makeChain() {
  const api: Record<string, unknown> = {};
  api.select = (cols: string) => {
    state.selectCols = cols;
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCol = col;
    state.eqVal = val;
    return api;
  };
  api.maybeSingle = () =>
    Promise.resolve(
      state.lookupError
        ? { data: null, error: state.lookupError }
        : { data: state.trialRow, error: null },
    );
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return makeChain();
    },
  };
}

const USER: AppUser = { id: "user-42", email: "founder@example.com" };

// Fixed clock so daysLeft math is deterministic. All trialEnd values in the
// suite are anchored to this "now".
const NOW = new Date("2026-08-07T12:00:00.000Z");

beforeEach(() => {
  state.trialRow = null;
  state.fromCalls = [];
  state.selectCols = null;
  state.eqCol = null;
  state.eqVal = null;
  state.lookupError = null;

  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — module invariants", () => {
  it("exports dynamic='force-dynamic' so the response is never statically cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Auth gate
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — auth gate", () => {
  it("returns 401 when no user is signed in", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("401 response also carries Cache-Control: no-store", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not touch Supabase when the user is missing", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    await GET();
    expect(state.fromCalls).toEqual([]);
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Unconfigured Supabase (preview branches)
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — unconfigured Supabase", () => {
  it("returns a synthetic empty trial state (200) without calling Supabase", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      inTrial: false,
      daysLeft: 0,
      trialEnd: null,
      requiresPayment: false,
    });
    expect(state.fromCalls).toEqual([]);
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("unconfigured branch still carries Cache-Control: no-store", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValueOnce(false);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// -----------------------------------------------------------------------------
// Supabase lookup failures
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — Supabase lookup errors", () => {
  beforeEach(() => {
    // Swallow the console.error the route emits on lookup failure — the test
    // pins the *response* contract, not the log line.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 500 with a generic reason when the SELECT fails", async () => {
    state.lookupError = { message: "connection reset" };
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Lookup failed" });
  });

  it("500 response carries Cache-Control: no-store so the CDN never caches the error", async () => {
    state.lookupError = { message: "boom" };
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// -----------------------------------------------------------------------------
// No trial row on file
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — founder with no trial row", () => {
  it("returns the null-state envelope (200) when maybeSingle resolves to null", async () => {
    state.trialRow = null;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      inTrial: false,
      daysLeft: 0,
      trialEnd: null,
      requiresPayment: false,
      planId: null,
      status: null,
    });
  });

  it("no-row branch still carries Cache-Control: no-store", async () => {
    state.trialRow = null;
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("queries subscription_trial_state filtered on user_id with the full projection", async () => {
    state.trialRow = null;
    await GET();
    expect(state.fromCalls).toEqual(["subscription_trial_state"]);
    expect(state.eqCol).toBe("user_id");
    expect(state.eqVal).toBe(USER.id);
    expect(state.selectCols).toContain("plan_id");
    expect(state.selectCols).toContain("status");
    expect(state.selectCols).toContain("trial_start");
    expect(state.selectCols).toContain("trial_end");
    expect(state.selectCols).toContain("current_period_end");
    expect(state.selectCols).toContain("cancel_at_period_end");
    expect(state.selectCols).toContain("payment_method_saved");
  });
});

// -----------------------------------------------------------------------------
// Active trial (status = 'trialing' + future trialEnd)
// -----------------------------------------------------------------------------

function activeTrialRow(overrides: Partial<TrialRow> = {}): TrialRow {
  return {
    plan_id: "growth_monthly",
    status: "trialing",
    trial_start: "2026-08-01T00:00:00.000Z",
    trial_end: "2026-08-14T12:00:00.000Z", // 7 days after NOW
    current_period_end: "2026-08-14T12:00:00.000Z",
    cancel_at_period_end: false,
    payment_method_saved: false,
    ...overrides,
  };
}

describe("GET /api/stripe/trial-status — active trial", () => {
  it("flags inTrial=true when status='trialing' and trialEnd is in the future", async () => {
    state.trialRow = activeTrialRow();
    const res = await GET();
    const body = await json(res);
    expect(body.inTrial).toBe(true);
  });

  it("computes daysLeft as ceil((trialEnd - now) / 86_400_000)", async () => {
    // trialEnd - now = exactly 7 days -> ceil(7) = 7.
    state.trialRow = activeTrialRow({ trial_end: "2026-08-14T12:00:00.000Z" });
    const body = await json(await GET());
    expect(body.daysLeft).toBe(7);
  });

  it("rounds a partial day UP so a 6.25-day remainder shows as 7", async () => {
    // NOW = 2026-08-07T12:00:00Z; +6.25 days = 2026-08-13T18:00:00Z.
    state.trialRow = activeTrialRow({ trial_end: "2026-08-13T18:00:00.000Z" });
    const body = await json(await GET());
    expect(body.daysLeft).toBe(7);
  });

  it("returns daysLeft=1 on the final day (2 hours remaining -> ceil to 1)", async () => {
    state.trialRow = activeTrialRow({ trial_end: "2026-08-07T14:00:00.000Z" });
    const body = await json(await GET());
    expect(body.daysLeft).toBe(1);
  });

  it("surfaces trialEnd as an ISO string (not a raw Date)", async () => {
    state.trialRow = activeTrialRow({ trial_end: "2026-08-14T12:00:00.000Z" });
    const body = await json(await GET());
    expect(body.trialEnd).toBe("2026-08-14T12:00:00.000Z");
  });

  it("requiresPayment=true when trialing and no PM on file", async () => {
    state.trialRow = activeTrialRow({ payment_method_saved: false });
    const body = await json(await GET());
    expect(body.requiresPayment).toBe(true);
  });

  it("requiresPayment=false when trialing but PM is already saved", async () => {
    state.trialRow = activeTrialRow({ payment_method_saved: true });
    const body = await json(await GET());
    expect(body.requiresPayment).toBe(false);
  });

  it("passes planId, status, and cancelAtPeriodEnd through unchanged", async () => {
    state.trialRow = activeTrialRow({
      plan_id: "scale_annual",
      status: "trialing",
      cancel_at_period_end: true,
    });
    const body = await json(await GET());
    expect(body.planId).toBe("scale_annual");
    expect(body.status).toBe("trialing");
    expect(body.cancelAtPeriodEnd).toBe(true);
  });

  it("coerces a null cancel_at_period_end to false in the response", async () => {
    state.trialRow = activeTrialRow({ cancel_at_period_end: null });
    const body = await json(await GET());
    expect(body.cancelAtPeriodEnd).toBe(false);
  });

  it("happy-path response carries Cache-Control: no-store", async () => {
    state.trialRow = activeTrialRow();
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("response contract: exposes exactly the 8 fields the UI reads", async () => {
    state.trialRow = activeTrialRow();
    const body = await json(await GET());
    expect(Object.keys(body).sort()).toEqual(
      [
        "cancelAtPeriodEnd",
        "daysLeft",
        "inTrial",
        "ok",
        "planId",
        "requiresPayment",
        "status",
        "trialEnd",
      ].sort(),
    );
  });
});

// -----------------------------------------------------------------------------
// Inactive / expired / non-trialing rows
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — non-trialing rows", () => {
  it("inTrial=false when status='active' (paying plan, no banner)", async () => {
    state.trialRow = activeTrialRow({ status: "active" });
    const body = await json(await GET());
    expect(body.inTrial).toBe(false);
    expect(body.daysLeft).toBe(0);
    expect(body.requiresPayment).toBe(false);
  });

  it("inTrial=false when status='past_due'", async () => {
    state.trialRow = activeTrialRow({ status: "past_due" });
    const body = await json(await GET());
    expect(body.inTrial).toBe(false);
  });

  it("inTrial=false when trialEnd is in the past (expired trial still marked 'trialing' in DB)", async () => {
    // Row could be stale — a Stripe webhook lag can leave status='trialing'
    // after trial_end. The route MUST clamp this to inTrial=false so the UI
    // stops showing the banner.
    state.trialRow = activeTrialRow({ trial_end: "2026-08-01T00:00:00.000Z" });
    const body = await json(await GET());
    expect(body.inTrial).toBe(false);
    expect(body.daysLeft).toBe(0);
    expect(body.requiresPayment).toBe(false);
  });

  it("inTrial=false when trial_end is null (no trial ever started)", async () => {
    state.trialRow = activeTrialRow({ trial_end: null });
    const body = await json(await GET());
    expect(body.inTrial).toBe(false);
    expect(body.trialEnd).toBeNull();
  });

  it("requiresPayment=false when NOT inTrial, even if payment_method_saved is null", async () => {
    // The banner reads requiresPayment to decide whether to nag; nagging a
    // founder on an expired trial (or one who never trialed) would be spammy.
    state.trialRow = activeTrialRow({
      status: "canceled",
      payment_method_saved: null,
    });
    const body = await json(await GET());
    expect(body.requiresPayment).toBe(false);
  });

  it("planId=null when the row's plan_id is null (nullish coalescing preserved)", async () => {
    state.trialRow = activeTrialRow({ plan_id: null });
    const body = await json(await GET());
    expect(body.planId).toBeNull();
  });

  it("status=null when the row's status is null", async () => {
    state.trialRow = activeTrialRow({ status: null });
    const body = await json(await GET());
    expect(body.status).toBeNull();
    expect(body.inTrial).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Edge boundaries (clamping + exact-second boundaries)
// -----------------------------------------------------------------------------

describe("GET /api/stripe/trial-status — clock boundaries", () => {
  it("inTrial=false when trialEnd equals now (strict > check, not >=)", async () => {
    state.trialRow = activeTrialRow({ trial_end: NOW.toISOString() });
    const body = await json(await GET());
    expect(body.inTrial).toBe(false);
  });

  it("daysLeft never goes negative", async () => {
    state.trialRow = activeTrialRow({ trial_end: "2026-07-01T00:00:00.000Z" });
    const body = await json(await GET());
    expect(typeof body.daysLeft).toBe("number");
    expect(body.daysLeft as number).toBeGreaterThanOrEqual(0);
  });
});
