// Unit test for POST /api/stripe/reactivate audit wire-in.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3). Asserts that a
// successful reactivation logs `stripe.subscription.reactivated` with
// only the plan lookup key in fields — never customer / raw price ids.

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

const supabaseUpdateMock = vi.fn().mockResolvedValue({ error: null });
const supabaseSelectChain = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
};
const supabaseMock = {
  from: vi.fn(),
};
const isSupabaseConfiguredMock = vi.fn().mockReturnValue(true);
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => supabaseMock,
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.9",
  extractUserAgent: () => "vitest",
}));

import { POST } from "./route";

function makeSelectChain(row: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: row });
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  return chain;
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  stripeMock.subscriptions.list.mockReset();
  stripeMock.subscriptions.update.mockReset();
  supabaseMock.from.mockReset();
  supabaseUpdateMock.mockClear();
  supabaseSelectChain.select.mockReset?.();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/stripe/reactivate audit wire-in", () => {
  it("logs stripe.subscription.reactivated with plan lookup key after a successful clear", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    supabaseMock.from.mockReturnValue(
      makeSelectChain({ stripe_customer_id: "cus_123" }),
    );
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: "sub_abc",
          cancel_at_period_end: true,
          items: {
            data: [
              { price: { lookup_key: "founder_growth", id: "price_xyz" } },
            ],
          },
        },
      ],
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = new Request("http://x/api/stripe/reactivate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("stripe.subscription.reactivated");
    expect(arg.subjectType).toBe("subscription");
    expect(arg.subjectId).toBe("sub_abc");
    expect(arg.fields).toEqual({ plan: "founder_growth" });
    expect(arg.route).toBe("/api/stripe/reactivate");
  });

  it("does not log when no pending-cancel subscription exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    supabaseMock.from.mockReturnValue(
      makeSelectChain({ stripe_customer_id: "cus_123" }),
    );
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_z", cancel_at_period_end: false, items: { data: [] } }],
    });
    const req = new Request("http://x/api/stripe/reactivate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when auth fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/stripe/reactivate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
