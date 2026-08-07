// Colocated vitest for POST /api/billing/cancel-trial — P9-cancel-trial-route-test.
//
// This route is fired from the dashboard trial banner "Cancel trial" button.
// It cancels the founder's trialing Stripe subscription (if any) immediately,
// then downgrades app_users.plan to 'free_expired', upserts
// subscription_trial_state, and writes an audit-log entry. It must be
// idempotent (safe to call when there is no trialing subscription) and it
// must NEVER call Stripe for a founder who has no stripe_customer_id.
//
// Regressions this suite is designed to catch:
//   - reordering the audit log to run BEFORE the DB writes would drop the
//     `billing.trial.canceled` record on transient Supabase failures;
//   - collapsing the 503 (unconfigured Supabase) branch into 500 would break
//     preview branches without Supabase credentials;
//   - dropping the `status: "trialing"` filter would let this cancel a
//     currently-paying subscription;
//   - swallowing the Stripe cancel error instead of returning 502 would
//     leave a live trialing sub attached to a downgraded app_users row;
//   - returning `cancelled: true` when no subscription was found would break
//     the UI's idempotent banner dismissal contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  isSupabaseConfiguredMock: vi.fn<() => boolean>(),
  isStripeConfiguredMock: vi.fn<() => boolean>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  getStripeMock: vi.fn<() => unknown | null>(),
  logUserActionMock: vi.fn<(args: Record<string, unknown>) => Promise<void>>(),
  extractIpMock: vi.fn<(h: Headers) => string | null>(),
  extractUserAgentMock: vi.fn<(h: Headers) => string | null>(),
  stripeListMock: vi.fn<
    (args: { customer: string; status: string; limit: number }) => Promise<{
      data: Array<{ id: string }>;
    }>
  >(),
  stripeCancelMock: vi.fn<(id: string) => Promise<{ id: string }>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripeMock(),
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
}));

vi.mock("@/lib/audit/log", () => ({
  logUserAction: (args: Record<string, unknown>) => mocks.logUserActionMock(args),
  extractIp: (h: Headers) => mocks.extractIpMock(h),
  extractUserAgent: (h: Headers) => mocks.extractUserAgentMock(h),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Fake Supabase + Stripe --------------------------------------------------

interface AppUsersRow {
  stripe_customer_id: string | null;
  trial_end_at: string | null;
  plan: string | null;
}

interface FakeState {
  appUsersRow: AppUsersRow | null;
  fromCalls: string[];
  appUsersUpdate: Record<string, unknown> | null;
  appUsersUpdateEqCol: string | null;
  appUsersUpdateEqVal: unknown;
  appUsersUpdateError: { message: string } | null;
  appUsersSelectCols: string | null;
  appUsersSelectEqCol: string | null;
  appUsersSelectEqVal: unknown;
  trialStateUpsertRow: Record<string, unknown> | null;
  trialStateUpsertOpts: Record<string, unknown> | null;
}

const state: FakeState = {
  appUsersRow: {
    stripe_customer_id: "cus_test_abc",
    trial_end_at: "2026-08-14T00:00:00.000Z",
    plan: "trialing",
  },
  fromCalls: [],
  appUsersUpdate: null,
  appUsersUpdateEqCol: null,
  appUsersUpdateEqVal: null,
  appUsersUpdateError: null,
  appUsersSelectCols: null,
  appUsersSelectEqCol: null,
  appUsersSelectEqVal: null,
  trialStateUpsertRow: null,
  trialStateUpsertOpts: null,
};

function appUsersChain() {
  // Each chain instance is either a select-chain or an update-chain — the
  // first method that gets called locks it into a role, so a select and an
  // update issued from separate `.from("app_users")` calls never conflate
  // even if the route is invoked multiple times.
  const api: Record<string, unknown> = {};
  let mode: "select" | "update" | null = null;
  api.select = (cols: string) => {
    mode = "select";
    state.appUsersSelectCols = cols;
    return api;
  };
  api.update = (patch: Record<string, unknown>) => {
    mode = "update";
    state.appUsersUpdate = patch;
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    if (mode === "update") {
      state.appUsersUpdateEqCol = col;
      state.appUsersUpdateEqVal = val;
      return Promise.resolve({ error: state.appUsersUpdateError });
    }
    state.appUsersSelectEqCol = col;
    state.appUsersSelectEqVal = val;
    return api;
  };
  api.maybeSingle = () => Promise.resolve({ data: state.appUsersRow, error: null });
  return api;
}

function trialStateChain() {
  const api: Record<string, unknown> = {};
  api.upsert = (row: Record<string, unknown>, opts: Record<string, unknown>) => {
    state.trialStateUpsertRow = row;
    state.trialStateUpsertOpts = opts;
    return Promise.resolve({ error: null });
  };
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      if (table === "app_users") return appUsersChain();
      if (table === "subscription_trial_state") return trialStateChain();
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function fakeStripe() {
  return {
    subscriptions: {
      list: (args: { customer: string; status: string; limit: number }) =>
        mocks.stripeListMock(args),
      cancel: (id: string) => mocks.stripeCancelMock(id),
    },
  };
}

const USER: AppUser = { id: "user-42", email: "founder@example.com" };

function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://blockid.au/api/billing/cancel-trial", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  state.appUsersRow = {
    stripe_customer_id: "cus_test_abc",
    trial_end_at: "2026-08-14T00:00:00.000Z",
    plan: "trialing",
  };
  state.fromCalls = [];
  state.appUsersUpdate = null;
  state.appUsersUpdateEqCol = null;
  state.appUsersUpdateEqVal = null;
  state.appUsersUpdateError = null;
  state.appUsersSelectCols = null;
  state.appUsersSelectEqCol = null;
  state.appUsersSelectEqVal = null;
  state.trialStateUpsertRow = null;
  state.trialStateUpsertOpts = null;

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.logUserActionMock.mockReset().mockResolvedValue(undefined);
  mocks.extractIpMock.mockReset().mockReturnValue("203.0.113.7");
  mocks.extractUserAgentMock.mockReset().mockReturnValue("vitest/1.0");
  mocks.stripeListMock
    .mockReset()
    .mockResolvedValue({ data: [{ id: "sub_trial_1" }] });
  mocks.stripeCancelMock.mockReset().mockResolvedValue({ id: "sub_trial_1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — module invariants", () => {
  it("exports dynamic='force-dynamic' so cancel writes are never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports a POST handler that is an async function", () => {
    expect(typeof POST).toBe("function");
    expect(POST.constructor.name).toBe("AsyncFunction");
  });
});

// -----------------------------------------------------------------------------
// Auth gate (401)
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — auth gate", () => {
  it("returns 401 when no user session", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(fakeRequest());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, reason: "auth_required" });
  });

  it("does not touch Supabase when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(fakeRequest());
    expect(state.fromCalls).toEqual([]);
  });

  it("does not call Stripe when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(fakeRequest());
    expect(mocks.stripeListMock).not.toHaveBeenCalled();
    expect(mocks.stripeCancelMock).not.toHaveBeenCalled();
  });

  it("does not audit-log when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(fakeRequest());
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Configuration gate (503)
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — configuration gate", () => {
  it("returns 503 when Supabase is not configured", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(fakeRequest());
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ ok: false, reason: "supabase_unavailable" });
  });

  it("does not call Stripe when Supabase is unavailable", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    await POST(fakeRequest());
    expect(mocks.stripeListMock).not.toHaveBeenCalled();
    expect(mocks.stripeCancelMock).not.toHaveBeenCalled();
  });

  it("does not audit-log when Supabase is unavailable", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    await POST(fakeRequest());
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Happy path — trialing sub exists, Stripe configured
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — cancels trialing subscription", () => {
  it("returns 200 with cancelled=true and the cancelled subscription id", async () => {
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      cancelled: true,
      subscription_id: "sub_trial_1",
    });
  });

  it("queries app_users by the current user's id for the customer id", async () => {
    await POST(fakeRequest());
    expect(state.appUsersSelectCols).toBe(
      "stripe_customer_id, trial_end_at, plan",
    );
    expect(state.appUsersSelectEqCol).toBe("id");
    expect(state.appUsersSelectEqVal).toBe(USER.id);
  });

  it("lists trialing subscriptions with limit=1 for the customer", async () => {
    await POST(fakeRequest());
    expect(mocks.stripeListMock).toHaveBeenCalledTimes(1);
    expect(mocks.stripeListMock).toHaveBeenCalledWith({
      customer: "cus_test_abc",
      status: "trialing",
      limit: 1,
    });
  });

  it("filters on status='trialing' so a paying sub is never cancelled by this route", async () => {
    // Regression guard: dropping the status filter would let this cancel a
    // paying subscription because the list would return the newest sub of
    // any status.
    await POST(fakeRequest());
    const args = mocks.stripeListMock.mock.calls[0]?.[0];
    expect(args?.status).toBe("trialing");
  });

  it("passes the exact trialing subscription id to stripe.subscriptions.cancel", async () => {
    await POST(fakeRequest());
    expect(mocks.stripeCancelMock).toHaveBeenCalledTimes(1);
    expect(mocks.stripeCancelMock).toHaveBeenCalledWith("sub_trial_1");
  });

  it("downgrades app_users to plan='free_expired' with matching cancel/trial timestamps", async () => {
    await POST(fakeRequest());
    expect(state.appUsersUpdate).not.toBeNull();
    const patch = state.appUsersUpdate!;
    expect(patch.plan).toBe("free_expired");
    // trial_end_at is set to the same "now" value as cancel_at
    expect(patch.trial_end_at).toBe(patch.cancel_at);
    expect(typeof patch.cancel_at).toBe("string");
    expect(String(patch.cancel_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stamps cancel_reason with the trial_banner_cancel source as JSON", async () => {
    await POST(fakeRequest());
    const reason = state.appUsersUpdate?.cancel_reason;
    expect(typeof reason).toBe("string");
    expect(JSON.parse(String(reason))).toEqual({ source: "trial_banner_cancel" });
  });

  it("scopes the app_users update to the current user's id", async () => {
    await POST(fakeRequest());
    expect(state.appUsersUpdateEqCol).toBe("id");
    expect(state.appUsersUpdateEqVal).toBe(USER.id);
  });

  it("upserts subscription_trial_state with status=canceled and cancel_at_period_end=false", async () => {
    await POST(fakeRequest());
    expect(state.trialStateUpsertRow).toMatchObject({
      user_id: USER.id,
      status: "canceled",
      cancel_at_period_end: false,
    });
    expect(state.trialStateUpsertOpts).toEqual({ onConflict: "user_id" });
  });

  it("stamps subscription_trial_state.updated_at with the same now-iso as cancel_at", async () => {
    await POST(fakeRequest());
    const upsertNow = state.trialStateUpsertRow?.updated_at;
    const cancelNow = state.appUsersUpdate?.cancel_at;
    expect(upsertNow).toBe(cancelNow);
  });

  it("touches app_users first and subscription_trial_state second", async () => {
    await POST(fakeRequest());
    expect(state.fromCalls).toEqual([
      "app_users",
      "app_users",
      "subscription_trial_state",
    ]);
  });

  it("writes an audit log tagged billing.trial.canceled with the sub id as subjectId", async () => {
    await POST(fakeRequest());
    expect(mocks.logUserActionMock).toHaveBeenCalledTimes(1);
    const [args] = mocks.logUserActionMock.mock.calls[0]!;
    expect(args).toMatchObject({
      userId: USER.id,
      action: "billing.trial.canceled",
      subjectType: "subscription",
      subjectId: "sub_trial_1",
      fields: { source: "trial_banner" },
      route: "/api/billing/cancel-trial",
      ip: "203.0.113.7",
      ua: "vitest/1.0",
    });
  });

  it("extracts ip + user-agent from the incoming request headers", async () => {
    const req = fakeRequest({ "x-forwarded-for": "198.51.100.9", "user-agent": "curl/8" });
    await POST(req);
    expect(mocks.extractIpMock).toHaveBeenCalledTimes(1);
    expect(mocks.extractUserAgentMock).toHaveBeenCalledTimes(1);
    // Both must receive a Headers instance, not the raw request.
    const [ipHeaders] = mocks.extractIpMock.mock.calls[0]!;
    const [uaHeaders] = mocks.extractUserAgentMock.mock.calls[0]!;
    expect(ipHeaders).toBeInstanceOf(Headers);
    expect(uaHeaders).toBeInstanceOf(Headers);
  });
});

// -----------------------------------------------------------------------------
// Idempotent branches — no customer / no trialing sub / Stripe unconfigured
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — idempotent no-op branches", () => {
  it("returns 200 with cancelled=false when the user has no stripe_customer_id", async () => {
    state.appUsersRow = { stripe_customer_id: null, trial_end_at: null, plan: "free" };
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      cancelled: false,
      subscription_id: null,
    });
  });

  it("does not call Stripe when the user has no stripe_customer_id", async () => {
    state.appUsersRow = { stripe_customer_id: null, trial_end_at: null, plan: "free" };
    await POST(fakeRequest());
    expect(mocks.stripeListMock).not.toHaveBeenCalled();
    expect(mocks.stripeCancelMock).not.toHaveBeenCalled();
  });

  it("returns 200 with cancelled=false when the app_users row is missing", async () => {
    state.appUsersRow = null;
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      cancelled: false,
      subscription_id: null,
    });
  });

  it("still downgrades app_users even when there is no Stripe customer to cancel", async () => {
    state.appUsersRow = { stripe_customer_id: null, trial_end_at: null, plan: "free" };
    await POST(fakeRequest());
    expect(state.appUsersUpdate?.plan).toBe("free_expired");
  });

  it("does not call Stripe when Stripe is unconfigured (preview branches)", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    // Return no stripe getter to make sure the route never dereferences it.
    mocks.getStripeMock.mockReturnValue(null);
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    expect(mocks.stripeListMock).not.toHaveBeenCalled();
    expect(mocks.stripeCancelMock).not.toHaveBeenCalled();
  });

  it("returns cancelled=false when Stripe is unconfigured (still audits the downgrade)", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    mocks.getStripeMock.mockReturnValue(null);
    const res = await POST(fakeRequest());
    expect(await json(res)).toEqual({
      ok: true,
      cancelled: false,
      subscription_id: null,
    });
    expect(mocks.logUserActionMock).toHaveBeenCalledTimes(1);
    const [args] = mocks.logUserActionMock.mock.calls[0]!;
    // No sub id available, so subjectId falls back to the user id.
    expect(args).toMatchObject({ subjectId: USER.id });
  });

  it("returns cancelled=false when there is no trialing subscription attached", async () => {
    mocks.stripeListMock.mockResolvedValue({ data: [] });
    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      cancelled: false,
      subscription_id: null,
    });
    expect(mocks.stripeCancelMock).not.toHaveBeenCalled();
  });

  it("uses the user id as the audit subjectId when nothing was cancelled", async () => {
    mocks.stripeListMock.mockResolvedValue({ data: [] });
    await POST(fakeRequest());
    const [args] = mocks.logUserActionMock.mock.calls[0]!;
    expect(args).toMatchObject({
      userId: USER.id,
      action: "billing.trial.canceled",
      subjectId: USER.id,
    });
  });

  it("still upserts subscription_trial_state on every successful call (no-op safe)", async () => {
    mocks.stripeListMock.mockResolvedValue({ data: [] });
    await POST(fakeRequest());
    expect(state.trialStateUpsertRow).toMatchObject({
      user_id: USER.id,
      status: "canceled",
    });
  });
});

// -----------------------------------------------------------------------------
// Stripe failure surface (502)
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — Stripe failure surface", () => {
  it("returns 502 when stripe.subscriptions.cancel throws", async () => {
    mocks.stripeCancelMock.mockRejectedValue(new Error("stripe outage"));
    const res = await POST(fakeRequest());
    expect(res.status).toBe(502);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "stripe_cancel_failed",
    });
  });

  it("returns 502 when stripe.subscriptions.list throws", async () => {
    mocks.stripeListMock.mockRejectedValue(new Error("network error"));
    const res = await POST(fakeRequest());
    expect(res.status).toBe(502);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "stripe_cancel_failed",
    });
  });

  it("does NOT downgrade app_users when the Stripe cancel fails", async () => {
    // Critical: we must not orphan a live trialing subscription attached to
    // a "free_expired" app_users row.
    mocks.stripeCancelMock.mockRejectedValue(new Error("stripe outage"));
    await POST(fakeRequest());
    expect(state.appUsersUpdate).toBeNull();
  });

  it("does NOT upsert subscription_trial_state when the Stripe cancel fails", async () => {
    mocks.stripeCancelMock.mockRejectedValue(new Error("stripe outage"));
    await POST(fakeRequest());
    expect(state.trialStateUpsertRow).toBeNull();
  });

  it("does NOT write an audit log when the Stripe cancel fails", async () => {
    mocks.stripeCancelMock.mockRejectedValue(new Error("stripe outage"));
    await POST(fakeRequest());
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Supabase update failure — non-fatal, must still 200 + audit
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — Supabase update failure is non-fatal", () => {
  it("still returns 200 when the app_users update returns an error", async () => {
    state.appUsersUpdateError = { message: "row-level security violated" };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(fakeRequest());
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({
        ok: true,
        cancelled: true,
        subscription_id: "sub_trial_1",
      });
      expect(consoleErr).toHaveBeenCalled();
    } finally {
      consoleErr.mockRestore();
    }
  });

  it("still audit-logs the cancellation when the app_users update returns an error", async () => {
    state.appUsersUpdateError = { message: "row-level security violated" };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await POST(fakeRequest());
      expect(mocks.logUserActionMock).toHaveBeenCalledTimes(1);
    } finally {
      consoleErr.mockRestore();
    }
  });
});

// -----------------------------------------------------------------------------
// Idempotency — multiple calls in a row
// -----------------------------------------------------------------------------

describe("POST /api/billing/cancel-trial — idempotency across repeated calls", () => {
  it("second call after Stripe reports no trialing sub returns cancelled=false", async () => {
    // First call: cancels the trialing sub.
    const res1 = await POST(fakeRequest());
    expect(res1.status).toBe(200);
    expect((await json(res1)).cancelled).toBe(true);

    // Second call: Stripe now has no trialing sub for the customer.
    mocks.stripeListMock.mockResolvedValue({ data: [] });
    const res2 = await POST(fakeRequest());
    expect(res2.status).toBe(200);
    expect(await json(res2)).toEqual({
      ok: true,
      cancelled: false,
      subscription_id: null,
    });
    expect(mocks.stripeCancelMock).toHaveBeenCalledTimes(1);
  });
});
