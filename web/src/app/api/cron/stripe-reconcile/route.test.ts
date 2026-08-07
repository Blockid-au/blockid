// Colocated vitest for GET+POST /api/cron/stripe-reconcile — P9-stripe-reconcile-route-test.
//
// Safety-net cron that scans Stripe checkout sessions in the last N hours,
// cross-checks against revenue_events, and auto-grants two SKU families
// (founding50 plan, credit_purchase pack) on missed webhooks. This is the
// exact route that would have caught the 2026-08 Zenya incident (webhook
// wasn't subscribed to the event type). Regressions here are silent revenue
// leaks — a founder paid but never got what they paid for.
//
// Regressions this suite is designed to catch:
//   - dropping the auth gate would let anyone trigger the reconcile scan;
//   - loosening the s.status==='complete' && s.payment_status==='paid' guard
//     would auto-grant on abandoned/expired sessions;
//   - dropping the skip rules (report_order, svi_analysis, founder_package)
//     would double-mint entitlements the primary path already grants;
//   - unknown-SKU auto-grant (instead of alert-only) would be a nightmare
//     — attacker sets metadata.blockid_user_id and gets arbitrary grants.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    isSupabaseConfiguredMock: vi.fn<() => boolean>(),
    isStripeConfiguredMock: vi.fn<() => boolean>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    getStripeMock: vi.fn<() => unknown | null>(),
    grantCreditsMock: vi.fn<(
      userId: string,
      amount: number,
      kind: string,
      meta: Record<string, unknown>,
    ) => Promise<{ ok: boolean }>>(),
    sendTelegramMock: vi.fn<(text: string) => Promise<void>>(),
    stripeSessionsListMock: vi.fn<(args: unknown) => Promise<{
      data: Array<Record<string, unknown>>;
      has_more: boolean;
    }>>(),
    PLAN_CREDITS_FIXTURE: {
      founding50: { amount: 100, recurring: false },
    } as Record<string, { amount: number; recurring: boolean }>,
  };
});

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
  getStripe: () => mocks.getStripeMock(),
}));

vi.mock("@/lib/credits", () => ({
  grantCredits: (
    id: string,
    amt: number,
    k: string,
    m: Record<string, unknown>,
  ) => mocks.grantCreditsMock(id, amt, k, m),
  PLAN_CREDITS: mocks.PLAN_CREDITS_FIXTURE,
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string) => mocks.sendTelegramMock(t),
}));

import { GET, POST } from "./route";

// --- Fake supabase --------------------------------------------------------

interface FakeState {
  existingRevRow: { id: string } | null;
  fromCalls: string[];
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
}

const state: FakeState = {
  existingRevRow: null,
  fromCalls: [],
  inserts: [],
  updates: [],
};

function makeChain(table: string) {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.eq = () => api;
  api.or = () => api;
  api.maybeSingle = () => Promise.resolve({ data: state.existingRevRow, error: null });
  api.insert = (row: Record<string, unknown>) => {
    state.inserts.push({ table, row });
    return { select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) };
  };
  api.update = (patch: Record<string, unknown>) => {
    state.updates.push({ table, patch });
    return { eq: () => Promise.resolve({ data: null, error: null }) };
  };
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return makeChain(table);
    },
  };
}

function fakeStripe() {
  return {
    checkout: {
      sessions: {
        list: (args: unknown) => mocks.stripeSessionsListMock(args),
      },
    },
  };
}

function req(method: "GET" | "POST", headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/stripe-reconcile", { method, headers });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.existingRevRow = null;
  state.fromCalls = [];
  state.inserts = [];
  state.updates = [];

  process.env.CRON_SECRET = "test_cron_secret";
  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.grantCreditsMock.mockReset().mockResolvedValue({ ok: true });
  mocks.sendTelegramMock.mockReset().mockResolvedValue(undefined);
  mocks.stripeSessionsListMock
    .mockReset()
    .mockResolvedValue({ data: [], has_more: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    status: "complete",
    payment_status: "paid",
    amount_total: 500, // A$5
    customer_email: "founder@example.com",
    metadata: { blockid_user_id: "user-1", blockid_plan: "founding50" },
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Auth gate
// -----------------------------------------------------------------------------

describe("stripe-reconcile — auth gate", () => {
  it("GET returns 401 without any auth header", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("unauthorized");
  });

  it("accepts x-cron-secret header", async () => {
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("accepts Authorization: Bearer <secret>", async () => {
    const res = await GET(req("GET", { authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong x-cron-secret", async () => {
    const res = await GET(req("GET", { "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong Bearer token", async () => {
    const res = await GET(req("GET", { authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("MUST NOT hit Stripe when auth fails", async () => {
    await GET(req("GET"));
    expect(mocks.stripeSessionsListMock).not.toHaveBeenCalled();
  });

  it("POST is aliased to GET (cron-runner.sh calls POST)", async () => {
    const res = await POST(req("POST", { "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("POST returns 401 without auth", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------------
// Config gate (503)
// -----------------------------------------------------------------------------

describe("stripe-reconcile — config gate", () => {
  it("returns 503 with error='not_configured' when Supabase is unconfigured", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error).toBe("not_configured");
  });

  it("returns 503 when Stripe is unconfigured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(res.status).toBe(503);
  });

  it("MUST NOT list Stripe sessions when config fails", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(mocks.stripeSessionsListMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Session filtering — status + payment_status guards
// -----------------------------------------------------------------------------

describe("stripe-reconcile — session filtering", () => {
  it("skips sessions that are not complete+paid", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({ status: "open" }),
        makeSession({ payment_status: "unpaid" }),
        makeSession({ status: "expired" }),
      ],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("skips metadata.bid_scope='report_order' (handled by its own reconciler)", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ metadata: { bid_scope: "report_order", blockid_user_id: "u1" } })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
  });

  it("skips metadata.blockid_type='svi_analysis'", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ metadata: { blockid_type: "svi_analysis", blockid_user_id: "u1" } })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
  });

  it("skips metadata.plan='founder_package' (Startup Package alerts only)", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ metadata: { plan: "founder_package", blockid_user_id: "u1" } })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
  });

  it("skips sessions with no metadata.blockid_user_id (can't attribute)", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ metadata: {} })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
  });

  it("skips sessions when revenue_events already has a matching row (idempotent)", async () => {
    state.existingRevRow = { id: "rev_1" };
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession()],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(0);
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Founding50 auto-grant
// -----------------------------------------------------------------------------

describe("stripe-reconcile — Founding50 auto-grant", () => {
  it("auto-grants plan=founding50 + credits when session metadata says so", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession()],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.missed).toBe(1);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.kind).toBe("founding50");
    expect(miss?.action).toBe("granted");
    expect(mocks.grantCreditsMock).toHaveBeenCalledWith(
      "user-1",
      100,
      "plan_grant",
      expect.objectContaining({
        plan: "founding50",
        session_id: "cs_test_1",
        reconciled_by: "stripe-reconcile-cron",
      }),
    );
  });

  it("writes app_users plan update + revenue_events insert on success", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession()],
      has_more: false,
    });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(state.updates.some((u) => u.table === "app_users" && u.patch.plan === "founding50")).toBe(true);
    expect(state.inserts.some((i) => i.table === "revenue_events")).toBe(true);
  });

  it("stamps revenue_events with the manual_reconciliation_<sessionId> event id", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession()],
      has_more: false,
    });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const revInsert = state.inserts.find((i) => i.table === "revenue_events");
    expect(revInsert?.row.stripe_event_id).toBe("manual_reconciliation_cs_test_1");
  });

  // ── Cutover safety — post-promo sessions are alerted, never auto-granted ──
  // FOUNDING_PROMO_END = 2026-09-01T00:00:00Z = unix seconds 1788307200. A
  // session created at or after that boundary is either a Stripe-dashboard
  // mistake or a bypass bug; either way, the cron must NEVER silently issue
  // lifetime access + credits for A$5 after the window closed. See fix in
  // route.ts (post-cutover branch → action:"alert_only").
  it("refuses to auto-grant founding50 for a POST-cutover session (alert only)", async () => {
    const postCutoverSec = Math.floor(
      new Date("2026-09-01T00:00:05Z").getTime() / 1000,
    );
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ created: postCutoverSec })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.kind).toBe("founding50");
    expect(miss?.action).toBe("alert_only");
    expect(String(miss?.detail)).toMatch(/post-cutover/);
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
    expect(state.updates.some((u) => u.table === "app_users")).toBe(false);
  });

  it("still auto-grants a founding50 session created BEFORE cutover (grace path)", async () => {
    // 23:59:58 on 2026-08-31 — legitimate late-webhook race that the safety
    // net exists for. Must still auto-grant so a paying founder never loses
    // access to what they bought.
    const preCutoverSec = Math.floor(
      new Date("2026-08-31T23:59:58Z").getTime() / 1000,
    );
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [makeSession({ created: preCutoverSec })],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.action).toBe("granted");
    expect(mocks.grantCreditsMock).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Credit-pack auto-grant
// -----------------------------------------------------------------------------

describe("stripe-reconcile — credit-pack auto-grant", () => {
  it("auto-grants N credits from metadata.blockid_credits", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: {
            blockid_user_id: "user-1",
            type: "credit_purchase",
            blockid_credits: "25",
          },
        }),
      ],
      has_more: false,
    });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(mocks.grantCreditsMock).toHaveBeenCalledWith(
      "user-1",
      25,
      "credit_pack_purchase",
      expect.objectContaining({ credits: 25, session_id: "cs_test_1" }),
    );
  });

  it("marks as credit_purchase kind and records the credits count in the miss row", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: {
            blockid_user_id: "user-1",
            type: "credit_purchase",
            blockid_credits: "50",
          },
        }),
      ],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.kind).toBe("credit_purchase");
    expect(miss?.credits).toBe(50);
  });

  it("skips credit_purchase when blockid_credits parses to 0 (falls through to alert)", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: {
            blockid_user_id: "user-1",
            type: "credit_purchase",
            blockid_credits: "0",
          },
        }),
      ],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.kind).toBe("unknown");
    expect(miss?.action).toBe("alert_only");
  });
});

// -----------------------------------------------------------------------------
// Unknown-SKU branch — alert only, never auto-grant
// -----------------------------------------------------------------------------

describe("stripe-reconcile — unknown SKU", () => {
  it("emits kind='unknown' + action='alert_only' when no auto-grant rule matches", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: {
            blockid_user_id: "user-1",
            blockid_plan: "enterprise_custom",
          },
        }),
      ],
      has_more: false,
    });
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    const miss = (body.misses as Array<Record<string, unknown>>)[0];
    expect(miss?.kind).toBe("unknown");
    expect(miss?.action).toBe("alert_only");
  });

  it("MUST NOT auto-grant credits or write revenue_events on unknown SKUs", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: {
            blockid_user_id: "user-1",
            blockid_plan: "hallucinated",
          },
        }),
      ],
      has_more: false,
    });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
    expect(state.inserts.filter((i) => i.table === "revenue_events")).toEqual([]);
  });

  it("fires a Telegram alert whenever any miss is found", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({
      data: [
        makeSession({
          metadata: { blockid_user_id: "user-1", blockid_plan: "unknown" },
        }),
      ],
      has_more: false,
    });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(mocks.sendTelegramMock).toHaveBeenCalled();
    const text = mocks.sendTelegramMock.mock.calls[0]?.[0] ?? "";
    expect(text).toContain("Stripe reconcile");
    expect(text).toContain("missed webhook");
  });

  it("does NOT fire a Telegram alert when there are no misses", async () => {
    mocks.stripeSessionsListMock.mockResolvedValue({ data: [], has_more: false });
    await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Response shape
// -----------------------------------------------------------------------------

describe("stripe-reconcile — response shape", () => {
  it("returns { ok, scanned, lookback_hours, missed, misses[] }", async () => {
    const res = await GET(req("GET", { "x-cron-secret": "test_cron_secret" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(typeof body.scanned).toBe("number");
    expect(typeof body.lookback_hours).toBe("number");
    expect(typeof body.missed).toBe("number");
    expect(Array.isArray(body.misses)).toBe(true);
  });
});
