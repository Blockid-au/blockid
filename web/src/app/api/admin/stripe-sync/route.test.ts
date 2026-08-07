// Colocated vitest for GET+POST /api/admin/stripe-sync — P9 batch 2.
//
// Stripe/config pricing reconciliation. Admin-only. Regression here could
// create orphaned Stripe prices or false drift alarms. Suite covers:
//   - GET 403 for non-admin
//   - GET 403 for unauthenticated
//   - GET happy path returns audit result
//   - POST 403 for non-admin
//   - POST 400 on bad JSON
//   - POST 400 when planId missing
//   - POST 500 when createFreshStripePrice fails
//   - POST happy path returns newPriceId + instruction

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  runStripePricingAudit: vi.fn(),
  createFreshStripePrice: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/stripe-pricing-audit", () => ({
  runStripePricingAudit: () => mocks.runStripePricingAudit(),
  createFreshStripePrice: (planId: string, opts?: unknown) =>
    mocks.createFreshStripePrice(planId, opts),
}));

import { GET, POST } from "./route";

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const REGULAR_USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };

function postReq(body: unknown, opts?: { badJson?: boolean }) {
  return {
    json: opts?.badJson
      ? () => { throw new SyntaxError("bad json"); }
      : () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.runStripePricingAudit.mockResolvedValue({
    driftedPlans: [],
    inSyncPlans: ["growth", "founding50"],
    missingPrices: [],
  });
  mocks.createFreshStripePrice.mockResolvedValue({
    ok: true,
    newPriceId: "price_new_123",
    envVarName: "STRIPE_PRICE_GROWTH",
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/stripe-sync", () => {
  it("returns 403 when user is not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 403 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("happy path: returns audit result", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.driftedPlans)).toBe(true);
    expect(Array.isArray(body.inSyncPlans)).toBe(true);
  });

  it("calls runStripePricingAudit", async () => {
    await GET();
    expect(mocks.runStripePricingAudit).toHaveBeenCalledOnce();
  });
});

describe("POST /api/admin/stripe-sync", () => {
  it("returns 403 when user is not admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await POST(postReq({ planId: "growth" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 403 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ planId: "growth" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid/i);
  });

  it("returns 400 when planId is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/planId/i);
  });

  it("returns 500 when createFreshStripePrice fails", async () => {
    mocks.createFreshStripePrice.mockResolvedValue({
      ok: false,
      error: "Stripe API error",
    });
    const res = await POST(postReq({ planId: "growth" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Stripe API error");
  });

  it("happy path: returns newPriceId + instruction", async () => {
    const res = await POST(postReq({ planId: "growth", productName: "BlockID Growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.newPriceId).toBe("price_new_123");
    expect(typeof body.instruction).toBe("string");
    expect((body.instruction as string)).toContain("STRIPE_PRICE_GROWTH");
  });

  it("passes productName to createFreshStripePrice", async () => {
    await POST(postReq({ planId: "growth", productName: "My Product" }));
    expect(mocks.createFreshStripePrice).toHaveBeenCalledWith(
      "growth",
      expect.objectContaining({ productName: "My Product" }),
    );
  });
});
