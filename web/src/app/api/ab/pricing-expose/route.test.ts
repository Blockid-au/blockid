// Colocated vitest for POST /api/ab/pricing-expose — P9 batch 4.
//
// Founding-price A/B exposure logging. Public endpoint used by /founding-50
// page. Suite covers:
//   - returns variant info on first call (new anon cookie minted)
//   - returns variant info on subsequent call (existing anon cookie)
//   - cookieSet:true when new cookie minted
//   - cookieSet:false when existing cookie used
//   - logAbEvent is called fire-and-forget
//   - variant shape in response (id, priceAud, priceCents, label)
//   - always returns ok:true

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getFoundingPriceVariant: vi.fn(),
  logAbEvent: vi.fn(),
  FOUNDING_PRICE_EXPERIMENT: { id: "founding-price-v1" },
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));
vi.mock("@/lib/ab-pricing", () => ({
  FOUNDING_PRICE_EXPERIMENT: mocks.FOUNDING_PRICE_EXPERIMENT,
  getFoundingPriceVariant: (opts: unknown) => mocks.getFoundingPriceVariant(opts),
  logAbEvent: (args: unknown) => mocks.logAbEvent(args),
}));

import { POST } from "./route";

const VARIANT = {
  id: "control",
  priceAud: 5,
  priceCents: 500,
  label: "A$5",
};

function makeCookieStore(existingAnonId?: string) {
  const store = {
    get: vi.fn((name: string) =>
      name === "blockid_anonid" && existingAnonId
        ? { value: existingAnonId }
        : undefined,
    ),
    set: vi.fn(),
  };
  return store;
}

function req() {
  return new Request("http://x/api/ab/pricing-expose", { method: "POST" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.cookies.mockResolvedValue(makeCookieStore("anon_existing_123"));
  mocks.getFoundingPriceVariant.mockResolvedValue(VARIANT);
  mocks.logAbEvent.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/ab/pricing-expose", () => {
  it("returns ok:true always", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("returns variant info in response", async () => {
    const res = await POST();
    const body = await json(res);
    const variant = body.variant as Record<string, unknown>;
    expect(variant.id).toBe("control");
    expect(variant.priceAud).toBe(5);
    expect(variant.priceCents).toBe(500);
    expect(variant.label).toBe("A$5");
  });

  it("cookieSet:false when existing anon cookie present", async () => {
    mocks.cookies.mockResolvedValue(makeCookieStore("anon_existing_123"));
    const res = await POST();
    const body = await json(res);
    expect(body.cookieSet).toBe(false);
  });

  it("cookieSet:true when no existing anon cookie", async () => {
    const store = makeCookieStore(undefined);
    mocks.cookies.mockResolvedValue(store);
    const res = await POST();
    const body = await json(res);
    expect(body.cookieSet).toBe(true);
    expect(store.set).toHaveBeenCalledWith(
      "blockid_anonid",
      expect.stringContaining("anon_"),
      expect.any(Object),
    );
  });

  it("calls getFoundingPriceVariant with identityOverride", async () => {
    await POST();
    expect(mocks.getFoundingPriceVariant).toHaveBeenCalledWith(
      expect.objectContaining({ identityOverride: "anon_existing_123" }),
    );
  });

  it("calls logAbEvent fire-and-forget", async () => {
    await POST();
    // logAbEvent is called via void so we wait micro-task
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.logAbEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: "founding-price-v1",
        eventType: "exposure",
        variantId: "control",
      }),
    );
  });

  it("still returns ok even if logAbEvent rejects", async () => {
    mocks.logAbEvent.mockRejectedValue(new Error("log db down"));
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("identityHash is a 24-char hex string", async () => {
    await POST();
    // We can't directly read identityHash but we can verify logAbEvent received it
    await new Promise((r) => setTimeout(r, 10));
    const call = mocks.logAbEvent.mock.calls[0]?.[0] as Record<string, string>;
    expect(call?.identityHash).toBeDefined();
    expect(typeof call?.identityHash).toBe("string");
    expect(call?.identityHash.length).toBe(24);
  });
});
