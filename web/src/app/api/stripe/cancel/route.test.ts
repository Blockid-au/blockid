// Unit test for POST /api/stripe/cancel audit wire-in.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3). Asserts that a
// successful cancel-at-period-end logs `stripe.subscription.canceled`
// with { plan, at_period_end: true } — reason/feedback stay in
// churn_events, never in the audit trail.

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

/**
 * Builds a supabase-admin double whose `from(table)` returns either a
 * chained select for `app_users` or a chained insert / update depending
 * on the caller. Small enough for our audit-only assertions.
 */
function makeSupabase(customerId: string | null) {
  const appUsersSelectChain: Record<string, unknown> = {};
  appUsersSelectChain.select = vi.fn().mockReturnValue(appUsersSelectChain);
  appUsersSelectChain.eq = vi.fn().mockReturnValue(appUsersSelectChain);
  appUsersSelectChain.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: customerId ? { stripe_customer_id: customerId } : null });
  appUsersSelectChain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const churnInsertChain = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "churn_events") return churnInsertChain;
    return appUsersSelectChain;
  });
  return { appUsersSelectChain, churnInsertChain };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  stripeMock.subscriptions.list.mockReset();
  stripeMock.subscriptions.update.mockReset();
  supabaseMock.from.mockReset();
  sendCancellationEmailMock.mockClear();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/stripe/cancel audit wire-in", () => {
  it("logs stripe.subscription.canceled with plan + at_period_end after a successful cancel-at-period-end", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "u1@example.com" });
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: "sub_abc",
          items: {
            data: [
              {
                price: { lookup_key: "founder_growth", id: "price_xyz" },
                current_period_end: 2_000_000_000,
              },
            ],
          },
        },
      ],
    });
    stripeMock.subscriptions.update.mockResolvedValue({
      items: {
        data: [{ current_period_end: 2_000_000_000 }],
      },
    });

    const req = new Request("http://x/api/stripe/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "too_expensive" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

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

  it("does not log on save-offer accepted path (that path records churn, not audit)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "u1@example.com" });
    makeSupabase("cus_123");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: "sub_abc",
          items: { data: [{ price: { lookup_key: "founder_growth" } }] },
        },
      ],
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = new Request("http://x/api/stripe/cancel", {
      method: "POST",
      body: JSON.stringify({
        save_offer: { kind: "keep_30", coupon: "COMEBACK30", accepted: true },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when auth fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/stripe/cancel", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
