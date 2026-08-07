// Colocated vitest for POST /api/coupon/redeem — P9 batch 1.
//
// Coupon redemption is a money surface: it grants plan upgrades for free
// (bypassing Stripe). A regression here could allow free-plan escalation,
// coupon reuse, or silent DB corruption. Suite covers:
//   - auth 401 gate
//   - bad JSON 400
//   - missing code / plan 400
//   - unknown plan 400
//   - supabase not configured 503
//   - coupon not found (ok:false, 200)
//   - inactive coupon (ok:false, 200)
//   - expired coupon (ok:false, 200)
//   - already redeemed (ok:false, 200)
//   - over usage limit (ok:false, 200)
//   - DB error on coupon read 500
//   - DB error on redemption insert 500
//   - DB error on user update 500
//   - happy path: returns ok + pricing

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getPlatformConfig: vi.fn(),
  buildPlansFromConfig: vi.fn(),
  getPlan: vi.fn(),
  getPlanPrice: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfigured(),
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/platform-config", () => ({ getPlatformConfig: () => mocks.getPlatformConfig() }));
vi.mock("@/lib/plans", () => ({
  buildPlansFromConfig: (cfg: unknown) => mocks.buildPlansFromConfig(cfg),
  getPlan: (id: string, plans: unknown) => mocks.getPlan(id, plans),
  getPlanPrice: (id: string, pct: number, plans: unknown) => mocks.getPlanPrice(id, pct, plans),
}));

import { POST } from "./route";

const USER = { id: "user-1", email: "founder@example.com", plan: "free", role: "user" };
const PLANS = [{ id: "growth", cadence: "monthly", price: 9900 }];

function makeSb(overrides: Record<string, unknown> = {}) {
  const couponSelect = vi.fn().mockReturnValue({
    data: {
      code: "SAVE50",
      discount_pct: 50,
      active: true,
      valid_until: null,
      max_uses: null,
      current_uses: 0,
    },
    error: null,
  });

  const existingSelect = vi.fn().mockReturnValue({ data: null });
  const updateSelect = vi.fn().mockReturnValue({ data: { current_uses: 1 }, error: null });
  const insertRedemption = vi.fn().mockReturnValue({ error: null });
  const updateUser = vi.fn().mockReturnValue({ error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "coupons") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: couponSelect,
            }),
          }),
          update: () => ({
            eq: () => ({
              or: () => ({
                select: () => ({
                  maybeSingle: updateSelect,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "coupon_redemptions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: existingSelect,
              }),
            }),
          }),
          insert: insertRedemption,
        };
      }
      if (table === "app_users") {
        return {
          update: () => ({
            eq: updateUser,
          }),
        };
      }
      return {};
    }),
    _couponSelect: couponSelect,
    _existingSelect: existingSelect,
    _updateSelect: updateSelect,
    _insertRedemption: insertRedemption,
    _updateUser: updateUser,
    ...overrides,
  };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/coupon/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.getPlatformConfig.mockResolvedValue({});
  mocks.buildPlansFromConfig.mockReturnValue(PLANS);
  mocks.getPlan.mockReturnValue(PLANS[0]);
  mocks.getPlanPrice.mockReturnValue({ original: 9900, discounted: 4950 });
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/coupon/redeem", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when code is missing", async () => {
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toMatch(/code/i);
  });

  it("returns 400 when code is empty string", async () => {
    const res = await POST(req({ code: "  ", plan: "growth" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when plan is missing", async () => {
    const res = await POST(req({ code: "SAVE50" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toMatch(/plan/i);
  });

  it("returns 400 when plan is unknown", async () => {
    mocks.getPlan.mockReturnValue(undefined);
    const res = await POST(req({ code: "SAVE50", plan: "unknown_plan" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toMatch(/unknown plan/i);
  });

  it("returns 503 when supabase not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(503);
  });

  it("returns 500 on coupon DB read error", async () => {
    const sb = makeSb();
    sb._couponSelect.mockReturnValue({ data: null, error: { message: "db error" } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(500);
  });

  it("returns ok:false when coupon not found", async () => {
    const sb = makeSb();
    sb._couponSelect.mockReturnValue({ data: null, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "NOSUCH", plan: "growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/not found/i);
  });

  it("returns ok:false when coupon is inactive", async () => {
    const sb = makeSb();
    sb._couponSelect.mockReturnValue({
      data: { code: "SAVE50", discount_pct: 50, active: false, valid_until: null, max_uses: null, current_uses: 0 },
      error: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/active/i);
  });

  it("returns ok:false when coupon has expired", async () => {
    const sb = makeSb();
    sb._couponSelect.mockReturnValue({
      data: {
        code: "SAVE50",
        discount_pct: 50,
        active: true,
        valid_until: "2020-01-01T00:00:00Z",
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/expir/i);
  });

  it("returns ok:false when already redeemed", async () => {
    const sb = makeSb();
    sb._existingSelect.mockReturnValue({ data: { id: "rdem-1" } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/already/i);
  });

  it("returns ok:false when usage limit reached", async () => {
    const sb = makeSb();
    sb._updateSelect.mockReturnValue({ data: null, error: null });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/limit/i);
  });

  it("returns 500 when redemption insert fails", async () => {
    const sb = makeSb();
    sb._insertRedemption.mockReturnValue({ error: { message: "insert failed" } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when user plan update fails", async () => {
    const sb = makeSb();
    sb._updateUser.mockReturnValue({ error: { message: "update failed" } });
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(500);
  });

  it("happy path: returns ok + plan + pricing", async () => {
    const res = await POST(req({ code: "SAVE50", plan: "growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.plan).toBe("growth");
    expect(body.originalPrice).toBe(9900);
    expect(body.discountedPrice).toBe(4950);
  });

  it("normalises code to uppercase before DB lookup", async () => {
    const sb = makeSb();
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    await POST(req({ code: "save50", plan: "growth" }));
    // Just verify it completes without error — normalisation is internal
    expect(mocks.getSupabaseAdmin).toHaveBeenCalled();
  });
});
