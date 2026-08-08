/**
 * Colocated vitest for POST /api/reports/redeem — Path B (credits-debit)
 * Trust Business Report checkout.
 *
 * The route is the atomic credits path: it re-quotes server-side, refuses
 * on insufficient balance, WHERE-guards the debit against a concurrent
 * spend, and rolls back the debit if the order-row insert fails. This
 * suite pins each of those branches plus the auth + validation gates.
 *
 * Silent regressions pinned against:
 *   - dropping the auth gate → any anon can debit a random user's wallet
 *   - dropping the uuid regex → SQL comes in via businessId
 *   - dropping the in-flight check → a second concurrent order runs
 *   - dropping the `.gte("balance", quote.credits)` WHERE guard → race
 *     between two tabs double-debits the wallet
 *   - dropping the refund on order-insert failure → the founder pays but
 *     never gets a report row for the worker to pick up
 *   - trusting client-supplied credit cost → §8.7 confirm-before-charge
 *     violated
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface SupabaseState {
  existingOrder: { data: { id: string; status: string } | null };
  balanceRow: { data: { balance: number; lifetime_spent: number } | null };
  debitResult: { data: { balance: number } | null; error: unknown };
  insertOrderResult: { data: { id: string } | null; error: unknown };
  calls: {
    reportOrdersSelect: number;
    reportOrdersInsert: unknown | null;
    creditBalancesSelect: number;
    creditBalancesUpdatePayloads: unknown[];
    creditBalancesUpdateGuards: Array<
      { eq: [string, unknown][]; gte: [string, unknown] | null }
    >;
    usageLogsInsert: unknown | null;
  };
}

let state: SupabaseState;

function resetState() {
  state = {
    existingOrder: { data: null },
    balanceRow: { data: { balance: 500, lifetime_spent: 0 } },
    debitResult: { data: { balance: 300 }, error: null },
    insertOrderResult: { data: { id: "order-42" }, error: null },
    calls: {
      reportOrdersSelect: 0,
      reportOrdersInsert: null,
      creditBalancesSelect: 0,
      creditBalancesUpdatePayloads: [],
      creditBalancesUpdateGuards: [],
      usageLogsInsert: null,
    },
  };
}

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: {
        _mode: "select" | "update" | "insert" | null;
        _payload: unknown;
        _eqs: [string, unknown][];
        _gte: [string, unknown] | null;
        select: (cols?: string) => typeof chain;
        insert: (payload: unknown) => typeof chain;
        update: (payload: unknown) => typeof chain;
        eq: (col: string, val: unknown) => typeof chain;
        gte: (col: string, val: unknown) => typeof chain;
        in: (col: string, vals: unknown) => typeof chain;
        maybeSingle: () => Promise<unknown>;
        single: () => Promise<unknown>;
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise<unknown>;
      } = {
        _mode: null,
        _payload: null,
        _eqs: [],
        _gte: null,
        select(_cols?: string) {
          if (this._mode === null) this._mode = "select";
          return this;
        },
        insert(payload: unknown) {
          this._mode = "insert";
          this._payload = payload;
          if (table === "report_orders") state.calls.reportOrdersInsert = payload;
          if (table === "usage_logs") state.calls.usageLogsInsert = payload;
          return this;
        },
        update(payload: unknown) {
          this._mode = "update";
          this._payload = payload;
          if (table === "credit_balances") {
            state.calls.creditBalancesUpdatePayloads.push(payload);
          }
          return this;
        },
        eq(col: string, val: unknown) {
          this._eqs.push([col, val]);
          return this;
        },
        gte(col: string, val: unknown) {
          this._gte = [col, val];
          return this;
        },
        in(_col: string, _vals: unknown) {
          return this;
        },
        async maybeSingle() {
          if (table === "report_orders" && this._mode === "select") {
            state.calls.reportOrdersSelect += 1;
            return state.existingOrder;
          }
          if (table === "credit_balances" && this._mode === "select") {
            state.calls.creditBalancesSelect += 1;
            return state.balanceRow;
          }
          if (table === "credit_balances" && this._mode === "update") {
            state.calls.creditBalancesUpdateGuards.push({
              eq: this._eqs.slice(),
              gte: this._gte,
            });
            return state.debitResult;
          }
          return { data: null, error: null };
        },
        async single() {
          if (table === "report_orders" && this._mode === "insert") {
            return state.insertOrderResult;
          }
          return { data: null, error: null };
        },
        // Thenable — allows `await supabase.from(...).update({...}).eq(...)`
        // (refund path in the route) to resolve without a terminal call.
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          try {
            if (table === "credit_balances" && this._mode === "update") {
              state.calls.creditBalancesUpdateGuards.push({
                eq: this._eqs.slice(),
                gte: this._gte,
              });
              return Promise.resolve(resolve({ data: null, error: null }));
            }
            if (table === "usage_logs" && this._mode === "insert") {
              return Promise.resolve(resolve({ data: null, error: null }));
            }
            return Promise.resolve(resolve({ data: null, error: null }));
          } catch (err) {
            return Promise.resolve(reject ? reject(err) : err);
          }
        },
      };
      return chain;
    },
  };
}

const getSupabaseAdminMock = vi.fn(() => fakeSupabase() as unknown);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const enqueueOrderMock = vi.fn();
vi.mock("@/lib/paywall/report-order-worker", () => ({
  enqueueOrder: (...args: unknown[]) => enqueueOrderMock(...args),
}));

import { POST } from "./route";
import {
  quoteTrustReport,
  BASE_UNITS_PER_SECTION,
  DEPTH_MULTIPLIER,
  MODEL_MULTIPLIER,
  REPORT_SECTIONS,
} from "@/lib/pricing/report-credit-cost";

const BUSINESS_ID = "11111111-2222-3333-4444-555555555555";

function makeReq(body: unknown | string): Request {
  return new Request("http://x/api/reports/redeem", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.au" });
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockImplementation(() => fakeSupabase());
  enqueueOrderMock.mockReset();
  enqueueOrderMock.mockResolvedValue({ ok: true });
});

describe("POST /api/reports/redeem — auth + validation gates", () => {
  it("401 when anon — no supabase touch, no worker enqueue", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; reason: string };
    expect(json.ok).toBe(false);
    expect(json.reason).toMatch(/auth/i);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(enqueueOrderMock).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body — no supabase touch", async () => {
    const res = await POST(makeReq("{not-json"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toMatch(/json/i);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 when businessId missing (not a uuid) — no supabase touch", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toMatch(/uuid/i);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 when businessId is not a well-formed uuid", async () => {
    const res = await POST(makeReq({ businessId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("400 when businessId is a number (type-hostile input)", async () => {
    const res = await POST(makeReq({ businessId: 12345 }));
    expect(res.status).toBe(400);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("accepts uppercase-hex uuid (case-insensitive regex)", async () => {
    const upper = BUSINESS_ID.toUpperCase();
    const res = await POST(makeReq({ businessId: upper }));
    // Not 400 — should pass validation and proceed to happy path.
    expect(res.status).toBe(200);
  });

  it("503 when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null as unknown);
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toMatch(/database/i);
  });
});

describe("POST /api/reports/redeem — in-flight guard", () => {
  it("409 when an in-flight order already exists — echoes orderId + status", async () => {
    state.existingOrder = {
      data: { id: "existing-99", status: "GENERATING" },
    };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as {
      ok: boolean;
      orderId: string;
      status: string;
      reason: string;
    };
    expect(json.ok).toBe(false);
    expect(json.orderId).toBe("existing-99");
    expect(json.status).toBe("GENERATING");
    expect(json.reason).toMatch(/in-flight/i);
    // Never touched credit_balances (short-circuits before debit).
    expect(state.calls.creditBalancesSelect).toBe(0);
    expect(state.calls.creditBalancesUpdatePayloads).toEqual([]);
    expect(enqueueOrderMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/reports/redeem — credit-balance branches", () => {
  it("402 when balance < quote.credits — returns quote + balance (never debits)", async () => {
    state.balanceRow = { data: { balance: 50, lifetime_spent: 999 } };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(402);
    const json = (await res.json()) as {
      reason: string;
      quote: { credits: number };
      balance: number;
    };
    expect(json.reason).toBe("insufficient_credits");
    expect(json.balance).toBe(50);
    // Default quote is sonnet × standard × 10 sections = 200 credits.
    expect(json.quote.credits).toBe(200);
    // No debit UPDATE fired.
    expect(state.calls.creditBalancesUpdatePayloads).toEqual([]);
    expect(state.calls.reportOrdersInsert).toBeNull();
    expect(enqueueOrderMock).not.toHaveBeenCalled();
  });

  it("402 when no balance row exists (treated as 0)", async () => {
    state.balanceRow = { data: null };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(402);
    const json = (await res.json()) as { balance: number };
    expect(json.balance).toBe(0);
  });

  it("402 boundary — balance exactly one credit below quote fails", async () => {
    state.balanceRow = { data: { balance: 199, lifetime_spent: 0 } };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(402);
  });

  it("200 boundary — balance exactly equal to quote succeeds (newBalance = 0)", async () => {
    state.balanceRow = { data: { balance: 200, lifetime_spent: 0 } };
    state.debitResult = { data: { balance: 0 }, error: null };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { newBalance: number };
    expect(json.newBalance).toBe(0);
  });

  it("debit UPDATE carries the WHERE-guard (.eq user_id, .gte balance quote.credits)", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID }));
    // First update = debit (WHERE-guarded).
    const debit = state.calls.creditBalancesUpdateGuards[0];
    expect(debit).toBeDefined();
    expect(debit.eq).toContainEqual(["user_id", "user-1"]);
    expect(debit.gte).toEqual(["balance", 200]);
  });

  it("debit UPDATE payload includes the new balance + accumulated lifetime_spent + fresh updated_at", async () => {
    state.balanceRow = { data: { balance: 500, lifetime_spent: 100 } };
    await POST(makeReq({ businessId: BUSINESS_ID }));
    const [payload] = state.calls.creditBalancesUpdatePayloads as [
      { balance: number; lifetime_spent: number; updated_at: string },
    ];
    expect(payload.balance).toBe(300);
    expect(payload.lifetime_spent).toBe(300);
    expect(payload.updated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("409 credit_debit_race when WHERE-guard matches zero rows (debit returns null data)", async () => {
    state.debitResult = { data: null, error: null };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { reason: string; quote: { credits: number } };
    expect(json.reason).toMatch(/race/i);
    expect(json.quote.credits).toBe(200);
    // Order row must NOT have been written.
    expect(state.calls.reportOrdersInsert).toBeNull();
    expect(enqueueOrderMock).not.toHaveBeenCalled();
  });

  it("409 credit_debit_race when debit returns an error", async () => {
    state.debitResult = { data: null, error: { message: "network" } };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(409);
    expect(state.calls.reportOrdersInsert).toBeNull();
  });
});

describe("POST /api/reports/redeem — order-insert refund branch", () => {
  it("500 when order insert fails — refunds credits + never enqueues", async () => {
    state.insertOrderResult = { data: null, error: { message: "boom" } };
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { reason: string; balance: number };
    expect(json.reason).toBe("order_insert_failed_debit_reversed");
    expect(json.balance).toBe(500);

    // Two UPDATEs on credit_balances: (1) debit, (2) refund back to original.
    expect(state.calls.creditBalancesUpdatePayloads.length).toBe(2);
    const [debit, refund] = state.calls.creditBalancesUpdatePayloads as [
      { balance: number; lifetime_spent: number },
      { balance: number; lifetime_spent: number },
    ];
    expect(debit.balance).toBe(300);
    expect(refund.balance).toBe(500);
    expect(refund.lifetime_spent).toBe(0);
    expect(enqueueOrderMock).not.toHaveBeenCalled();
  });

  it("500 branch preserves the original lifetime_spent even when non-zero", async () => {
    state.balanceRow = { data: { balance: 500, lifetime_spent: 777 } };
    state.insertOrderResult = { data: null, error: { message: "boom" } };
    await POST(makeReq({ businessId: BUSINESS_ID }));
    const [, refund] = state.calls.creditBalancesUpdatePayloads as [
      unknown,
      { lifetime_spent: number },
    ];
    expect(refund.lifetime_spent).toBe(777);
  });
});

describe("POST /api/reports/redeem — happy path (default quote)", () => {
  it("200 returns orderId + quote + newBalance", async () => {
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      orderId: string;
      quote: { credits: number; model: string; depth: string; sections: number };
      newBalance: number;
    };
    expect(json.ok).toBe(true);
    expect(json.orderId).toBe("order-42");
    expect(json.newBalance).toBe(300);
    expect(json.quote).toEqual({
      credits: 200,
      estimatedWords: REPORT_SECTIONS * 850,
      model: "sonnet",
      depth: "standard",
      sections: 10,
    });
  });

  it("order insert payload is PAID with credits_used = quote.credits, amount_aud = 0", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID }));
    const payload = state.calls.reportOrdersInsert as {
      business_id: string;
      user_id: string;
      product_sku: string;
      amount_aud: number;
      credits_used: number;
      status: string;
      paid_at: string;
      metadata: { sku: string; payment_path: string; quote: { credits: number } };
    };
    expect(payload.business_id).toBe(BUSINESS_ID);
    expect(payload.user_id).toBe("user-1");
    expect(payload.product_sku).toBe("sku_trust_report_credits");
    expect(payload.amount_aud).toBe(0);
    expect(payload.credits_used).toBe(200);
    expect(payload.status).toBe("PAID");
    expect(payload.paid_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.metadata.sku).toBe("sku_trust_report_credits");
    expect(payload.metadata.payment_path).toBe("credits");
    expect(payload.metadata.quote.credits).toBe(200);
  });

  it("metadata.first_touch stamped when firstTouch provided", async () => {
    await POST(
      makeReq({ businessId: BUSINESS_ID, firstTouch: "utm_source=partner-x" }),
    );
    const payload = state.calls.reportOrdersInsert as {
      metadata: { first_touch?: string };
    };
    expect(payload.metadata.first_touch).toBe("utm_source=partner-x");
  });

  it("metadata.first_touch omitted when firstTouch missing", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID }));
    const payload = state.calls.reportOrdersInsert as {
      metadata: Record<string, unknown>;
    };
    expect(payload.metadata.first_touch).toBeUndefined();
  });

  it("metadata.first_touch omitted when firstTouch is an empty string", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID, firstTouch: "" }));
    const payload = state.calls.reportOrdersInsert as {
      metadata: Record<string, unknown>;
    };
    expect(payload.metadata.first_touch).toBeUndefined();
  });

  it("enqueueOrder called with the freshly-created order id + business id", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(enqueueOrderMock).toHaveBeenCalledTimes(1);
    const [, input] = enqueueOrderMock.mock.calls[0] as [
      unknown,
      { orderId: string; businessId: string },
    ];
    expect(input.orderId).toBe("order-42");
    expect(input.businessId).toBe(BUSINESS_ID);
  });

  it("usage_logs row records feature + credits_used + business_id + order_id", async () => {
    await POST(makeReq({ businessId: BUSINESS_ID }));
    const log = state.calls.usageLogsInsert as {
      user_id: string;
      feature: string;
      credits_used: number;
      metadata: {
        business_id: string;
        order_id: string;
        sku_reference: string;
        quote: { credits: number };
      };
    };
    expect(log.user_id).toBe("user-1");
    expect(log.feature).toBe("trust_business_report");
    expect(log.credits_used).toBe(200);
    expect(log.metadata.business_id).toBe(BUSINESS_ID);
    expect(log.metadata.order_id).toBe("order-42");
    expect(log.metadata.sku_reference).toBe("sku_trust_report_5aud");
    expect(log.metadata.quote.credits).toBe(200);
  });

  it("enqueueOrder failure is swallowed — 200 still returned", async () => {
    enqueueOrderMock.mockResolvedValue({ ok: false, reason: "queue_down" });
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; orderId: string };
    expect(json.ok).toBe(true);
    expect(json.orderId).toBe("order-42");
  });

  it("enqueueOrder throw is swallowed — 200 still returned", async () => {
    enqueueOrderMock.mockRejectedValue(new Error("worker exploded"));
    const res = await POST(makeReq({ businessId: BUSINESS_ID }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/reports/redeem — quote parameter branches", () => {
  it("respects model/depth/sections overrides in the quote", async () => {
    // opus (2.5) × deep (1.0) × 5 sections × 40 = 500 credits.
    state.balanceRow = { data: { balance: 1000, lifetime_spent: 0 } };
    state.debitResult = { data: { balance: 500 }, error: null };
    const res = await POST(
      makeReq({
        businessId: BUSINESS_ID,
        model: "opus",
        depth: "deep",
        sections: 5,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      quote: { credits: number; model: string; depth: string; sections: number };
      newBalance: number;
    };
    expect(json.quote.credits).toBe(
      Math.ceil(BASE_UNITS_PER_SECTION * DEPTH_MULTIPLIER.deep * MODEL_MULTIPLIER.opus * 5),
    );
    expect(json.quote.model).toBe("opus");
    expect(json.quote.depth).toBe("deep");
    expect(json.quote.sections).toBe(5);
    expect(json.newBalance).toBe(500);
  });

  it("ignores unknown model — falls back to sonnet default", async () => {
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, model: "hacker" }),
    );
    const json = (await res.json()) as { quote: { model: string; credits: number } };
    expect(json.quote.model).toBe("sonnet");
    expect(json.quote.credits).toBe(200);
  });

  it("ignores unknown depth — falls back to standard default", async () => {
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, depth: "ultra" }),
    );
    const json = (await res.json()) as { quote: { depth: string; credits: number } };
    expect(json.quote.depth).toBe("standard");
    expect(json.quote.credits).toBe(200);
  });

  it("ignores non-positive sections — falls back to REPORT_SECTIONS", async () => {
    const res = await POST(makeReq({ businessId: BUSINESS_ID, sections: 0 }));
    const json = (await res.json()) as { quote: { sections: number; credits: number } };
    expect(json.quote.sections).toBe(REPORT_SECTIONS);
    expect(json.quote.credits).toBe(200);
  });

  it("ignores non-numeric sections — falls back to REPORT_SECTIONS", async () => {
    const res = await POST(
      makeReq({ businessId: BUSINESS_ID, sections: "many" }),
    );
    const json = (await res.json()) as { quote: { sections: number; credits: number } };
    expect(json.quote.sections).toBe(REPORT_SECTIONS);
    expect(json.quote.credits).toBe(200);
  });

  it("server re-quote arithmetic matches quoteTrustReport (no client-trust)", async () => {
    // Attempt to smuggle a low cost via a client-shaped body key that the
    // route does NOT parse (credits/cost). The re-quote must ignore them.
    const res = await POST(
      makeReq({
        businessId: BUSINESS_ID,
        credits: 1,
        cost: 1,
      } as unknown as Record<string, unknown>),
    );
    const json = (await res.json()) as { quote: { credits: number } };
    expect(json.quote.credits).toBe(quoteTrustReport().credits);
    expect(json.quote.credits).toBe(200);
  });
});
