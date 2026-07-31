// Colocated regression suite for `web/src/lib/stripe/verify.ts` — the shared
// Stripe-webhook signature check + `stripe_webhook_events` idempotency helpers
// used by /api/stripe/webhook (and any future webhook endpoint). Pins the
// "fail open on transient DB errors, fail closed on bad signatures / missing
// secrets" posture so a silent regression here can't quietly drop / double-
// process a real Stripe delivery.
//
// P9_ship autonomous-loop tick — first test coverage for verify.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const constructEventMock = vi.fn();
const stripeMock = {
  webhooks: {
    constructEvent: constructEventMock,
  },
};
const getStripeMock = vi.fn(() => stripeMock as unknown as null | typeof stripeMock);

vi.mock("@/lib/stripe", () => ({
  getStripe: () => getStripeMock(),
}));

const supabaseFromMock = vi.fn();
const supabaseMock = { from: supabaseFromMock };
const getSupabaseAdminMock = vi.fn(() => supabaseMock as unknown as null | typeof supabaseMock);

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import {
  WEBHOOK_TOLERANCE_SECONDS,
  verifyWebhookSignature,
  claimWebhookEvent,
  markWebhookEventProcessed,
} from "./verify";

type InsertResult = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };

function makeInsertChain(result: InsertResult) {
  const calls: Array<Record<string, unknown>> = [];
  const chain = {
    insert(payload: Record<string, unknown>) {
      calls.push({ method: "insert", payload });
      return {
        select(cols: string) {
          calls.push({ method: "select", cols });
          return Promise.resolve(result);
        },
      };
    },
    calls,
  };
  return chain;
}

function makeUpdateChain(result: { error: unknown } = { error: null }) {
  const calls: Array<Record<string, unknown>> = [];
  const chain = {
    update(payload: Record<string, unknown>) {
      calls.push({ method: "update", payload });
      return {
        eq(col: string, val: unknown) {
          calls.push({ method: "eq", col, val });
          return Promise.resolve(result);
        },
      };
    },
    calls,
  };
  return chain;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  constructEventMock.mockReset();
  getStripeMock.mockReset();
  getStripeMock.mockReturnValue(stripeMock);
  supabaseFromMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(supabaseMock);
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleErrorSpy.mockClear();
});

describe("WEBHOOK_TOLERANCE_SECONDS", () => {
  it("is 300 seconds — matches Stripe's default replay-window recommendation", () => {
    expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300);
  });
});

describe("verifyWebhookSignature", () => {
  it("returns null when getStripe() is null (Stripe not configured)", () => {
    getStripeMock.mockReturnValue(null);
    const result = verifyWebhookSignature("body", "t=1,v1=sig");
    expect(result).toBeNull();
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("returns null when STRIPE_WEBHOOK_SECRET env is missing", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const result = verifyWebhookSignature("body", "t=1,v1=sig");
    expect(result).toBeNull();
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("returns the parsed event on success and forwards the 300s tolerance", () => {
    const event = { id: "evt_123", type: "invoice.paid" };
    constructEventMock.mockReturnValue(event);
    const result = verifyWebhookSignature("raw-body", "t=1,v1=sig");
    expect(result).toBe(event);
    expect(constructEventMock).toHaveBeenCalledTimes(1);
    expect(constructEventMock).toHaveBeenCalledWith(
      "raw-body",
      "t=1,v1=sig",
      "whsec_test_secret",
      WEBHOOK_TOLERANCE_SECONDS,
    );
  });

  it("passes the configured webhook secret verbatim to constructEvent", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_prod_specific";
    constructEventMock.mockReturnValue({ id: "evt_x", type: "customer.updated" });
    verifyWebhookSignature("body", "sig");
    expect(constructEventMock.mock.calls[0]![2]).toBe("whsec_prod_specific");
  });

  it("returns null when constructEvent throws (signature mismatch / expired)", () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const result = verifyWebhookSignature("body", "t=1,v1=bad");
    expect(result).toBeNull();
  });

  it("logs to console.error on signature verification failure", () => {
    const errSpy = consoleErrorSpy;
    constructEventMock.mockImplementation(() => {
      throw new Error("Timestamp outside tolerance");
    });
    verifyWebhookSignature("body", "sig");
    expect(errSpy).toHaveBeenCalledWith(
      "[blockid:stripe:verify] signature verification failed",
      expect.any(Error),
    );
  });
});

describe("claimWebhookEvent", () => {
  it("returns {duplicate:false} without touching supabase when admin client is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const result = await claimWebhookEvent({ id: "evt_a", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: false });
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("inserts into stripe_webhook_events with (id, type) and selects id", async () => {
    const chain = makeInsertChain({ data: [{ id: "evt_a" }], error: null });
    supabaseFromMock.mockReturnValue(chain);
    await claimWebhookEvent({ id: "evt_a", type: "invoice.paid" });
    expect(supabaseFromMock).toHaveBeenCalledWith("stripe_webhook_events");
    expect(chain.calls[0]).toEqual({ method: "insert", payload: { id: "evt_a", type: "invoice.paid" } });
    expect(chain.calls[1]).toEqual({ method: "select", cols: "id" });
  });

  it("returns {duplicate:false} on happy insert with returned row", async () => {
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: [{ id: "evt_a" }], error: null }),
    );
    const result = await claimWebhookEvent({ id: "evt_a", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: false });
  });

  it("returns {duplicate:true} when error.code === '23505' (unique_violation on concurrent delivery)", async () => {
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: null, error: { code: "23505", message: "duplicate key" } }),
    );
    const result = await claimWebhookEvent({ id: "evt_dup", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: true });
  });

  it("fails open with {duplicate:false} on non-23505 errors (never drop a real event)", async () => {
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: null, error: { code: "08006", message: "connection lost" } }),
    );
    const result = await claimWebhookEvent({ id: "evt_x", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: false });
  });

  it("logs to console.error on non-23505 error", async () => {
    const errSpy = consoleErrorSpy;
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: null, error: { code: "08006", message: "connection lost" } }),
    );
    await claimWebhookEvent({ id: "evt_x", type: "invoice.paid" });
    expect(errSpy).toHaveBeenCalledWith(
      "[blockid:stripe:verify] claimWebhookEvent failed",
      expect.objectContaining({ code: "08006" }),
    );
  });

  it("does NOT log to console.error on 23505 (duplicate is expected concurrent-delivery path, not a bug)", async () => {
    const errSpy = consoleErrorSpy;
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: null, error: { code: "23505", message: "duplicate key" } }),
    );
    await claimWebhookEvent({ id: "evt_dup", type: "invoice.paid" });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("returns {duplicate:true} when data is an empty array (RLS filtered the row out)", async () => {
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: [], error: null }),
    );
    const result = await claimWebhookEvent({ id: "evt_a", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: true });
  });

  it("returns {duplicate:true} when data is null with no error (defensive fallback)", async () => {
    supabaseFromMock.mockReturnValue(
      makeInsertChain({ data: null, error: null }),
    );
    const result = await claimWebhookEvent({ id: "evt_a", type: "invoice.paid" });
    expect(result).toEqual({ duplicate: true });
  });

  it("forwards the event type verbatim (no normalisation) — customer.subscription.deleted stays intact", async () => {
    const chain = makeInsertChain({ data: [{ id: "evt_sub_del" }], error: null });
    supabaseFromMock.mockReturnValue(chain);
    await claimWebhookEvent({ id: "evt_sub_del", type: "customer.subscription.deleted" });
    expect(chain.calls[0]).toMatchObject({
      payload: { id: "evt_sub_del", type: "customer.subscription.deleted" },
    });
  });
});

describe("markWebhookEventProcessed", () => {
  it("is a no-op when supabase admin client is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await markWebhookEventProcessed("evt_a");
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("updates processed_at with a fresh ISO timestamp when no error arg is passed", async () => {
    const chain = makeUpdateChain();
    supabaseFromMock.mockReturnValue(chain);
    const before = Date.now();
    await markWebhookEventProcessed("evt_a");
    const after = Date.now();

    expect(supabaseFromMock).toHaveBeenCalledWith("stripe_webhook_events");
    const updateCall = chain.calls[0] as { method: string; payload: { processed_at: string; error: unknown } };
    expect(updateCall.method).toBe("update");
    expect(updateCall.payload.error).toBeNull();
    const stampedAt = new Date(updateCall.payload.processed_at).getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });

  it("stamps the passed error string onto the row when the caller supplies one", async () => {
    const chain = makeUpdateChain();
    supabaseFromMock.mockReturnValue(chain);
    await markWebhookEventProcessed("evt_a", "handler_threw: TypeError");
    const updateCall = chain.calls[0] as { payload: { error: string } };
    expect(updateCall.payload.error).toBe("handler_threw: TypeError");
  });

  it("filters the update with .eq('id', eventId) — never wipes the whole table", async () => {
    const chain = makeUpdateChain();
    supabaseFromMock.mockReturnValue(chain);
    await markWebhookEventProcessed("evt_specific");
    expect(chain.calls[1]).toEqual({ method: "eq", col: "id", val: "evt_specific" });
  });

  it("coerces undefined error arg to null on the row (never writes literal undefined)", async () => {
    const chain = makeUpdateChain();
    supabaseFromMock.mockReturnValue(chain);
    await markWebhookEventProcessed("evt_a", undefined);
    const updateCall = chain.calls[0] as { payload: { error: unknown } };
    expect(updateCall.payload.error).toBeNull();
  });

  it("does not throw when the underlying update rejects — best-effort audit ack", async () => {
    const chain = makeUpdateChain({ error: { message: "row locked" } });
    supabaseFromMock.mockReturnValue(chain);
    await expect(markWebhookEventProcessed("evt_a")).resolves.toBeUndefined();
  });
});
