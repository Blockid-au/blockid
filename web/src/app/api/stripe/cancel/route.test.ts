// Unit tests for POST /api/stripe/cancel.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3): a successful
// cancel-at-period-end logs `stripe.subscription.canceled` with
// { plan, at_period_end: true } — reason/feedback stay in churn_events,
// never in the audit trail.
//
// G18-D (2026-09-19, self-serve cancel from /workspace/billing):
//   • trialing  → immediate Stripe cancel, no charge, plan → free, mirror
//                 → canceled (the old status=active list never found trials)
//   • active    → cancel_at_period_end, access until period end
//   • already scheduled → idempotent 200, no Stripe write / churn row / mail
//   • no customer / no live sub → 404 reason "no_subscription", never 500
//   • Stripe list failure → 503, cancel failure → 502

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isStripeConfiguredMock = vi.fn().mockReturnValue(true);
const stripeMock = {
  subscriptions: {
    list: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
};
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => isStripeConfiguredMock(),
  getStripe: () => stripeMock,
}));

const supabaseMock = {
  from: vi.fn(),
};
const isSupabaseConfiguredMock = vi.fn().mockReturnValue(true);
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => supabaseMock,
}));

const sendCancellationEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendCancellationEmail: (input: unknown) => sendCancellationEmailMock(input),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.9",
  extractUserAgent: () => "vitest",
}));

import { POST } from "./route";

const PERIOD_END = 2_000_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END * 1000).toISOString();

/**
 * Supabase double: app_users select / update, subscription_trial_state
 * update / upsert, churn_events insert — every write is recorded.
 */
function makeSupabase(customerId: string | null) {
  const writes: Array<{ table: string; op: string; row: Record<string, unknown> }> = [];
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    api.select = vi.fn().mockReturnValue(api);
    api.eq = vi.fn().mockReturnValue(api);
    api.maybeSingle = vi.fn().mockResolvedValue({ data: customerId ? { stripe_customer_id: customerId } : null });
    api.update = vi.fn((row: Record<string, unknown>) => {
      writes.push({ table, op: "update", row });
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });
    api.upsert = vi.fn((row: Record<string, unknown>) => {
      writes.push({ table, op: "upsert", row });
      return Promise.resolve({ error: null });
    });
    api.insert = vi.fn((row: Record<string, unknown>) => {
      writes.push({ table, op: "insert", row });
      return Promise.resolve({ error: null });
    });
    return api;
  };
  supabaseMock.from.mockImplementation((table: string) => chain(table));
  return { writes };
}

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_abc",
    status: "active",
    cancel_at_period_end: false,
    created: 1_700_000_000,
    trial_end: null,
    items: {
      data: [{ price: { lookup_key: "founder_growth", id: "price_xyz" }, current_period_end: PERIOD_END }],
    },
    ...overrides,
  };
}

function req(body: unknown = { reason: "too_expensive" }) {
  return new Request("http://x/api/stripe/cancel", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "u1", email: "u1@example.com" });
  stripeMock.subscriptions.list.mockReset();
  stripeMock.subscriptions.update.mockReset();
  stripeMock.subscriptions.cancel.mockReset().mockResolvedValue({ id: "sub_abc", status: "canceled" });
  supabaseMock.from.mockReset();
  sendCancellationEmailMock.mockClear();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/stripe/cancel — gates", () => {
  it("401 when unauthenticated; nothing logged", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("404 reason=no_subscription when the user has no Stripe customer (Free) — never a 500", async () => {
    makeSupabase(null);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "no_subscription" });
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });

  it("404 reason=no_subscription when Stripe lists only canceled / incomplete subs", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub({ status: "canceled" }), sub({ status: "incomplete" })] });
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe("no_subscription");
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("lists status=all (trials included) with the customer id", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    await POST(req());
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_123", status: "all", limit: 10 });
  });

  it("503 stripe_unavailable when the Stripe list throws", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockRejectedValue(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("stripe_unavailable");
  });
});

describe("POST /api/stripe/cancel — active subscription → cancel at period end", () => {
  it("sets cancel_at_period_end, mirrors the flag, records churn, e-mails, audits {plan, at_period_end:true}", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub()] });
    stripeMock.subscriptions.update.mockResolvedValue(sub({ cancel_at_period_end: true }));

    const res = await POST(req({ reason: "too_expensive", feedback: "just testing" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "cancel_scheduled", activeUntil: PERIOD_END_ISO });

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_abc", { cancel_at_period_end: true });
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();

    const mirror = writes.find((w) => w.table === "subscription_trial_state");
    expect(mirror?.row).toMatchObject({ cancel_at_period_end: true, current_period_end: PERIOD_END_ISO });
    const appUser = writes.find((w) => w.table === "app_users");
    expect(appUser?.row).toMatchObject({ cancel_at: PERIOD_END_ISO });
    expect(appUser?.row.plan, "plan stays until the period ends (webhook flips it to free)").toBeUndefined();
    const churn = writes.find((w) => w.table === "churn_events");
    expect(churn?.row).toMatchObject({ user_id: "u1", from_plan: "founder_growth", reason: "too_expensive", accepted_coupon: false });
    expect(sendCancellationEmailMock).toHaveBeenCalledWith({ to: "u1@example.com", activeUntil: PERIOD_END_ISO });

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("stripe.subscription.canceled");
    expect(arg.subjectType).toBe("subscription");
    expect(arg.subjectId).toBe("sub_abc");
    expect(arg.fields).toEqual({ plan: "founder_growth", at_period_end: true });
    expect(arg.route).toBe("/api/stripe/cancel");
    // Reason must NOT be echoed into audit fields — it belongs to churn_events.
    expect(JSON.stringify(arg.fields)).not.toContain("too_expensive");
  });

  it("past_due is cancellable the same way", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub({ status: "past_due" })] });
    stripeMock.subscriptions.update.mockResolvedValue(sub({ status: "past_due", cancel_at_period_end: true }));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("cancel_scheduled");
  });

  it("502 cancel_failed when the Stripe update throws (no churn row, no e-mail, no audit)", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub()] });
    stripeMock.subscriptions.update.mockRejectedValue(new Error("stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe("cancel_failed");
    expect(writes.find((w) => w.table === "churn_events")).toBeUndefined();
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/cancel — idempotent when already scheduled", () => {
  it("returns the same cancel_scheduled state without touching Stripe, churn, mail or audit", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub({ cancel_at_period_end: true })] });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "cancel_scheduled", alreadyScheduled: true, activeUntil: PERIOD_END_ISO });
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(writes.filter((w) => w.table !== "app_users" || w.op !== "select")).toEqual([]);
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/cancel — trialing subscription → cancelled now, no charge", () => {
  const TRIAL_END = 1_900_000_000;

  it("calls stripe.subscriptions.cancel (not update), plan → free, mirror → canceled, audits at_period_end:false + trialing", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [sub({ id: "sub_trial", status: "trialing", trial_end: TRIAL_END, items: { data: [{ price: { lookup_key: "investor_angel" }, current_period_end: TRIAL_END }] } })],
    });

    const res = await POST(req({ reason: "not_using" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, state: "canceled", trial: true, charged: false });
    expect(typeof body.activeUntil).toBe("string");

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_trial");
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();

    const appUser = writes.find((w) => w.table === "app_users" && w.op === "update");
    expect(appUser?.row).toMatchObject({ plan: "free", plan_started_at: null });
    const mirror = writes.find((w) => w.table === "subscription_trial_state" && w.op === "upsert");
    expect(mirror?.row).toMatchObject({ user_id: "u1", stripe_subscription_id: "sub_trial", status: "canceled", cancel_at_period_end: false });
    const churn = writes.find((w) => w.table === "churn_events");
    expect(churn?.row).toMatchObject({ from_plan: "investor_angel", reason: "not_using" });
    expect((churn?.row.detail as Record<string, unknown>).trial_cancelled_immediately).toBe(true);
    // No "access until <period end>" mail for a trial that ends now.
    expect(sendCancellationEmailMock).not.toHaveBeenCalled();

    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("stripe.subscription.canceled");
    expect(arg.fields).toEqual({ plan: "investor_angel", at_period_end: false, trialing: true });
  });

  it("prefers the trial over an older active sub on the same customer", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [sub({ id: "sub_old", status: "active", created: 1 }), sub({ id: "sub_trial", status: "trialing", created: 2, trial_end: TRIAL_END })],
    });
    await POST(req());
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_trial");
  });

  it("a save-offer on a trial is ignored — no coupon is stacked, the trial is cancelled", async () => {
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub({ status: "trialing", trial_end: TRIAL_END })] });
    const res = await POST(req({ save_offer: { kind: "keep_30", coupon: "COMEBACK30", accepted: true } }));
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("canceled");
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  it("502 cancel_failed when Stripe refuses; plan is left untouched", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub({ status: "trialing", trial_end: TRIAL_END })] });
    stripeMock.subscriptions.cancel.mockRejectedValue(new Error("nope"));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(writes.find((w) => w.table === "app_users" && w.op === "update")).toBeUndefined();
  });
});

describe("POST /api/stripe/cancel — save-offer accepted on an active sub", () => {
  it("applies the coupon, records churn with accepted_coupon=true and does NOT cancel or audit", async () => {
    const { writes } = makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub()] });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const res = await POST(req({ save_offer: { kind: "keep_30", coupon: "COMEBACK30", accepted: true } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, offer_applied: true, kind: "keep_30" });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_abc", { discounts: [{ coupon: "COMEBACK30" }] });
    expect(writes.find((w) => w.table === "churn_events")?.row).toMatchObject({ accepted_coupon: true });
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("rejects a coupon that is not on the allow-list before touching Stripe", async () => {
    makeSupabase("cus_123");
    const res = await POST(req({ save_offer: { kind: "keep_30", coupon: "ADMIN100", accepted: true } }));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("coupon_not_allowed");
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });
});
