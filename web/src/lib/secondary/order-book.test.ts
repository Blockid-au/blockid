// S27-B — sandbox matching engine. Pins: price-time priority, partial
// fills, trade at the resting price, no shorting (holdings cap incl. what
// is already resting), self-trade prevention, ROFR hold + release, cancel,
// depth aggregation, price discovery without NaN.

import { describe, expect, it } from "vitest";
import {
  SANDBOX_NOTICE,
  buildDepth,
  cancelOrder,
  matchOrder,
  positions,
  priceDiscovery,
  releaseHolds,
  restingSellQty,
  validateOrder,
  type SimOrder,
} from "./order-book";

let seq = 0;
function o(over: Partial<SimOrder> & { side: SimOrder["side"]; price: number; qty: number; holderKey?: string }): SimOrder {
  seq += 1;
  const qty = over.qty;
  return {
    id: over.id ?? `o${seq}`,
    holderKey: over.holderKey ?? `sh:${seq}`,
    holderLabel: over.holderLabel ?? `H${seq}`,
    side: over.side,
    price: over.price,
    qty,
    remaining: over.remaining ?? qty,
    status: over.status ?? "open",
    holdUntil: over.holdUntil ?? null,
    seq: over.seq ?? seq,
    createdAt: over.createdAt ?? new Date(2026, 8, 13, 0, 0, seq).toISOString(),
  };
}
const NOW = new Date("2026-09-13T10:00:00Z");

describe("matchOrder — price-time priority", () => {
  it("a buy walks the asks lowest-first then oldest, trading at the resting price", () => {
    const book = [
      o({ id: "a1", side: "sell", price: 1.2, qty: 100, holderKey: "sh:a" }),
      o({ id: "a2", side: "sell", price: 1.0, qty: 50, holderKey: "sh:b" }),
      o({ id: "a3", side: "sell", price: 1.0, qty: 50, holderKey: "sh:c" }),
    ];
    const r = matchOrder(o({ id: "b1", side: "buy", price: 1.2, qty: 120, holderKey: "sh:z" }), book, NOW);
    expect(r.fills.map((f) => [f.sellOrderId, f.price, f.qty])).toEqual([["a2", 1.0, 50], ["a3", 1.0, 50], ["a1", 1.2, 20]]);
    expect(r.order.remaining).toBe(0);
    expect(r.order.status).toBe("filled");
    expect(r.updated.find((u) => u.id === "a1")).toMatchObject({ remaining: 80, status: "open" });
    expect(r.updated.find((u) => u.id === "a2")).toMatchObject({ remaining: 0, status: "filled" });
    // inputs untouched
    expect(book[0].remaining).toBe(100);
  });

  it("a sell walks the bids highest-first; a non-crossing rest stays open (partial fill)", () => {
    const book = [
      o({ id: "b1", side: "buy", price: 0.9, qty: 40, holderKey: "sh:a" }),
      o({ id: "b2", side: "buy", price: 1.1, qty: 30, holderKey: "sh:b" }),
    ];
    const r = matchOrder(o({ id: "s1", side: "sell", price: 1.0, qty: 100, holderKey: "sh:z" }), book, NOW);
    expect(r.fills).toEqual([expect.objectContaining({ buyOrderId: "b2", sellOrderId: "s1", price: 1.1, qty: 30, buyerKey: "sh:b", sellerKey: "sh:z" })]);
    expect(r.order).toMatchObject({ remaining: 70, status: "open" });
    expect(r.updated).toHaveLength(1);
  });

  it("never fills against the same holder; a held sell does not match and is skipped as a resting order", () => {
    const book = [
      o({ id: "a1", side: "sell", price: 1.0, qty: 10, holderKey: "sh:me" }),
      o({ id: "a2", side: "sell", price: 1.0, qty: 10, holderKey: "sh:other", status: "held", holdUntil: "2026-09-15T10:00:00Z" }),
    ];
    const r = matchOrder(o({ id: "b1", side: "buy", price: 2, qty: 10, holderKey: "sh:me" }), book, NOW);
    expect(r.fills).toEqual([]);
    expect(r.order.remaining).toBe(10);
    const held = matchOrder(o({ id: "s9", side: "sell", price: 0.5, qty: 5, holderKey: "sh:x", status: "held", holdUntil: "2026-09-15T10:00:00Z" }), [o({ side: "buy", price: 1, qty: 5, holderKey: "sh:y" })], NOW);
    expect(held.fills).toEqual([]);
    expect(held.order.status).toBe("held");
  });

  it("releaseHolds opens expired holds only", () => {
    const book = [
      o({ id: "h1", side: "sell", price: 1, qty: 1, status: "held", holdUntil: "2026-09-13T09:00:00Z" }),
      o({ id: "h2", side: "sell", price: 1, qty: 1, status: "held", holdUntil: "2026-09-15T09:00:00Z" }),
    ];
    const released = releaseHolds(book, NOW);
    expect(released.map((r) => r.id)).toEqual(["h1"]);
    expect(book[0].status).toBe("open");
    expect(book[1].status).toBe("held");
  });
});

describe("validateOrder / cancel / positions", () => {
  it("no shorting: sell qty ≤ position − resting sells; buys are never capped", () => {
    expect(validateOrder({ side: "sell", price: 1, qty: 100, position: 100, restingSell: 0 })).toEqual({ ok: true });
    expect(validateOrder({ side: "sell", price: 1, qty: 101, position: 100, restingSell: 0 })).toMatchObject({ ok: false, error: "exceeds_holdings" });
    expect(validateOrder({ side: "sell", price: 1, qty: 60, position: 100, restingSell: 50 })).toMatchObject({ ok: false, error: "exceeds_holdings" });
    expect(validateOrder({ side: "sell", price: 1, qty: 1, position: 0, restingSell: 0 })).toMatchObject({ ok: false, error: "exceeds_holdings" });
    expect(validateOrder({ side: "buy", price: 1, qty: 1_000_000, position: 0, restingSell: 0 })).toEqual({ ok: true });
  });

  it("rejects bad side / price / qty", () => {
    expect(validateOrder({ side: "short" as never, price: 1, qty: 1, position: 1, restingSell: 0 })).toMatchObject({ error: "invalid_side" });
    expect(validateOrder({ side: "buy", price: 0, qty: 1, position: 1, restingSell: 0 })).toMatchObject({ error: "invalid_price" });
    expect(validateOrder({ side: "buy", price: Number.NaN, qty: 1, position: 1, restingSell: 0 })).toMatchObject({ error: "invalid_price" });
    expect(validateOrder({ side: "buy", price: 1, qty: 1.5, position: 1, restingSell: 0 })).toMatchObject({ error: "invalid_qty" });
    expect(validateOrder({ side: "buy", price: 1, qty: 0, position: 1, restingSell: 0 })).toMatchObject({ error: "invalid_qty" });
  });

  it("cancel works on open / held only", () => {
    expect(cancelOrder(o({ side: "buy", price: 1, qty: 1 }))?.status).toBe("cancelled");
    expect(cancelOrder(o({ side: "sell", price: 1, qty: 1, status: "held" }))?.status).toBe("cancelled");
    expect(cancelOrder(o({ side: "sell", price: 1, qty: 1, status: "filled" }))).toBeNull();
    expect(cancelOrder(o({ side: "sell", price: 1, qty: 1, status: "cancelled" }))).toBeNull();
  });

  it("positions = register + buys − sells; resting sell qty counts open + held", () => {
    const pos = positions(
      [{ holderKey: "sh:a", shares: 100 }, { holderKey: "sh:b", shares: 0 }],
      [{ buyerKey: "sb:inv", sellerKey: "sh:a", qty: 30 }, { buyerKey: "sh:b", sellerKey: "sb:inv", qty: 10 }],
    );
    expect(pos.get("sh:a")).toBe(70);
    expect(pos.get("sb:inv")).toBe(20);
    expect(pos.get("sh:b")).toBe(10);
    const book = [
      o({ side: "sell", price: 1, qty: 10, holderKey: "sh:a" }),
      o({ side: "sell", price: 1, qty: 5, holderKey: "sh:a", status: "held" }),
      o({ side: "sell", price: 1, qty: 99, holderKey: "sh:a", status: "cancelled" }),
      o({ side: "buy", price: 1, qty: 99, holderKey: "sh:a" }),
    ];
    expect(restingSellQty(book, "sh:a")).toBe(15);
  });
});

describe("depth + price discovery", () => {
  it("aggregates levels best-first with held qty flagged, spread from the top of book", () => {
    const book = [
      o({ side: "buy", price: 1.0, qty: 10 }),
      o({ side: "buy", price: 1.0, qty: 5 }),
      o({ side: "buy", price: 0.9, qty: 7 }),
      o({ side: "sell", price: 1.2, qty: 3 }),
      o({ side: "sell", price: 1.1, qty: 4, status: "held", holdUntil: "2026-09-15T00:00:00Z" }),
      o({ side: "sell", price: 1.1, qty: 6, status: "cancelled" }),
    ];
    const d = buildDepth(book);
    expect(d.bids).toEqual([{ price: 1.0, qty: 15, orders: 2, held: 0 }, { price: 0.9, qty: 7, orders: 1, held: 0 }]);
    expect(d.asks).toEqual([{ price: 1.1, qty: 4, orders: 1, held: 4 }, { price: 1.2, qty: 3, orders: 1, held: 0 }]);
    expect(d).toMatchObject({ bestBid: 1.0, bestAsk: 1.1, spread: 0.1 });
  });

  it("priceDiscovery: last / mid / vwap / implied valuation, and null (never NaN) on an empty book", () => {
    const depth = buildDepth([o({ side: "buy", price: 1.0, qty: 1 }), o({ side: "sell", price: 1.2, qty: 1 })]);
    const p = priceDiscovery({
      depth,
      trades: [
        { price: 1.0, qty: 100, tradedAt: "2026-09-13T01:00:00Z" },
        { price: 1.5, qty: 100, tradedAt: "2026-09-13T02:00:00Z" },
      ],
      fullyDilutedShares: 10_000_000,
    });
    expect(p).toEqual({
      sandbox: true,
      label: "sandbox implied",
      last: 1.5,
      mid: 1.1,
      vwap: 1.25,
      impliedValuationAud: 15_000_000,
      fullyDilutedShares: 10_000_000,
      tradedShares: 200,
      tradeCount: 2,
    });

    const empty = priceDiscovery({ depth: buildDepth([]), trades: [], fullyDilutedShares: Number.NaN });
    expect(empty).toMatchObject({ last: null, mid: null, vwap: null, impliedValuationAud: null, fullyDilutedShares: 0, tradedShares: 0 });
    for (const v of Object.values(empty)) expect(typeof v === "number" ? Number.isFinite(v) : true).toBe(true);
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });

  it("the sandbox notice names the Corporations Act chapters", () => {
    expect(SANDBOX_NOTICE).toMatch(/Chapter 6D/);
    expect(SANDBOX_NOTICE).toMatch(/Chapter 7/);
    expect(SANDBOX_NOTICE).toMatch(/no real securities/);
  });
});
