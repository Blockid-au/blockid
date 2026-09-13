// S27-B — sandbox store over the pure engine, against an in-memory
// Supabase stub that honours eq / in / order / limit and filtered updates.
//
//   - placeOrder resolves the holder (register row or sandbox buyer), caps
//     sells at the sandbox position, inserts the order with the CALLER's
//     user_id, matches against the resting book, persists fills as trades
//     and the resting order's new remaining / status
//   - ROFR on → a sell is HELD for the configured hours and does not match;
//     an expired hold is released on the next read
//   - a lost race on the conditional update skips that fill (no double fill)
//   - cancel only open / held; settings upsert clamps the hold window
//   - buildBookView: sandbox flag + notice, depth, tape, positions, price
//     discovery with the OWNER's fully diluted count, no NaN

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildBookView, cancelOrder, placeOrder, saveSettings } from "./sim";

// ── minimal in-memory Supabase ───────────────────────────────────────────────
type Row = Record<string, unknown>;
interface Store { [table: string]: Row[] }

function memSupabase(store: Store, opts: { onUpdate?: (table: string, patch: Row, rows: Row[]) => void } = {}) {
  let seq = 0;
  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let write: { kind: "insert" | "update" | "upsert"; payload: Row } | null = null;
    let affected: Row[] = [];
    const apply = () => {
      let rows = (store[table] ??= []).filter((r) => filters.every((f) => f(r)));
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => {
          const x = a[col] as number | string;
          const y = b[col] as number | string;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return rows;
    };
    const exec = () => {
      if (write?.kind === "insert") {
        seq += 1;
        const row = { id: `id-${table}-${seq}`, seq, ...write.payload };
        (store[table] ??= []).push(row);
        affected = [row];
      } else if (write?.kind === "update") {
        affected = apply();
        opts.onUpdate?.(table, write.payload, affected);
        for (const r of affected) Object.assign(r, write.payload);
      } else if (write?.kind === "upsert") {
        const p = write.payload;
        const existing = (store[table] ??= []).find((r) => r.project_id === p.project_id);
        if (existing) Object.assign(existing, p);
        else store[table].push({ ...p });
        affected = [p];
      }
      return write ? affected : apply();
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return api; },
      in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return api; },
      not: () => api,
      order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return api; },
      limit: (n: number) => { limit = n; return api; },
      insert: (p: Row) => { write = { kind: "insert", payload: p }; return api; },
      update: (p: Row) => { write = { kind: "update", payload: p }; return api; },
      upsert: (p: Row) => { write = { kind: "upsert", payload: p }; return api; },
      maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
      single: async () => ({ data: exec()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: exec(), error: null }),
    };
    return api;
  }
  return { from: (table: string) => query(table) };
}

const NOW = new Date("2026-09-13T10:00:00Z");
const OWNER = "user-owner";
const PROJ = "proj-1";

let store: Store;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

beforeEach(() => {
  store = {
    shareholders: [
      { id: "s1", account_id: OWNER, project_id: PROJ, name: "Ada", shares_held: 600 },
      { id: "s2", account_id: OWNER, project_id: PROJ, name: "Bob", shares_held: 400 },
    ],
    esop_pool: [{ account_id: OWNER, project_id: PROJ, total_pool_shares: 1000 }],
    secondary_sim_settings: [],
    secondary_sim_orders: [],
    secondary_sim_trades: [],
  };
  db = memSupabase(store);
});

const base = { projectId: PROJ, ownerUserId: OWNER, userId: "user-caller", now: NOW };

describe("placeOrder", () => {
  it("rests a sell from a register holder, then a crossing buy from a sandbox buyer fills at the resting price", async () => {
    const sell = await placeOrder(db, { ...base, side: "sell", price: 1.2, qty: 100, shareholderId: "s1" });
    expect(sell.ok && sell.order).toMatchObject({ holderKey: "sh:s1", holderLabel: "Ada", side: "sell", remaining: 100, status: "open" });
    expect(store.secondary_sim_orders[0]).toMatchObject({ user_id: "user-caller", shareholder_id: "s1", project_id: PROJ, status: "open" });

    const buy = await placeOrder(db, { ...base, side: "buy", price: 1.5, qty: 40, holderLabel: "Angel One" });
    expect(buy.ok).toBe(true);
    if (!buy.ok) return;
    expect(buy.fills).toEqual([expect.objectContaining({ buyerKey: "sb:angel one", sellerKey: "sh:s1", price: 1.2, qty: 40 })]);
    expect(buy.order).toMatchObject({ remaining: 0, status: "filled" });
    expect(store.secondary_sim_orders.find((o) => o.holder_key === "sh:s1")).toMatchObject({ remaining: 60, status: "open" });
    expect(store.secondary_sim_orders.find((o) => o.holder_key === "sb:angel one")).toMatchObject({ remaining: 0, status: "filled" });
    expect(store.secondary_sim_trades).toEqual([expect.objectContaining({ buyer_label: "Angel One", seller_label: "Ada", price_aud: 1.2, qty: 40 })]);
  });

  it("no shorting: sell capped at register + sim buys − sim sells − resting; unknown holder 404; bad label 400", async () => {
    const over = await placeOrder(db, { ...base, side: "sell", price: 1, qty: 601, shareholderId: "s1" });
    expect(over).toMatchObject({ ok: false, status: 422, error: "exceeds_holdings" });
    await placeOrder(db, { ...base, side: "sell", price: 1, qty: 500, shareholderId: "s1" });
    const rest = await placeOrder(db, { ...base, side: "sell", price: 1, qty: 101, shareholderId: "s1" });
    expect(rest).toMatchObject({ ok: false, status: 422 });
    // a sandbox buyer with no register row cannot sell at all …
    expect(await placeOrder(db, { ...base, side: "sell", price: 1, qty: 1, holderLabel: "Angel" })).toMatchObject({ ok: false, error: "exceeds_holdings" });
    // … until they have bought something
    await placeOrder(db, { ...base, side: "buy", price: 1, qty: 10, holderLabel: "Angel" });
    const resell = await placeOrder(db, { ...base, side: "sell", price: 2, qty: 10, holderLabel: "Angel" });
    expect(resell.ok).toBe(true);
    expect(await placeOrder(db, { ...base, side: "sell", price: 1, qty: 1, shareholderId: "nope" })).toMatchObject({ ok: false, status: 404 });
    expect(await placeOrder(db, { ...base, side: "buy", price: 1, qty: 1, holderLabel: "<script>" })).toMatchObject({ ok: false, status: 400, error: "invalid_holder" });
    expect(await placeOrder(db, { ...base, side: "buy", price: 0, qty: 1, holderLabel: "Angel" })).toMatchObject({ ok: false, status: 400, error: "invalid_price" });
  });

  it("ROFR on → sells are held for the window and do not match; the hold releases on a later read", async () => {
    await saveSettings(db, PROJ, { rofrEnabled: true, rofrHoldHours: 48 });
    await placeOrder(db, { ...base, side: "buy", price: 2, qty: 50, holderLabel: "Angel" });
    const sell = await placeOrder(db, { ...base, side: "sell", price: 1, qty: 50, shareholderId: "s1" });
    expect(sell.ok && sell.held).toBe(true);
    expect(sell.ok && sell.order).toMatchObject({ status: "held", holdUntil: "2026-09-15T10:00:00.000Z", remaining: 50 });
    expect(sell.ok && sell.fills).toEqual([]);
    expect(store.secondary_sim_trades).toEqual([]);

    const during = await buildBookView(db, { ...base, now: new Date("2026-09-14T10:00:00Z") });
    expect(during.depth.asks).toEqual([{ price: 1, qty: 50, orders: 1, held: 50 }]);
    expect(during.depth.bids).toEqual([{ price: 2, qty: 50, orders: 1, held: 0 }]);
    // S27 review: the release MATCHES the ask against the bid that rested during the window —
    // the book must not stay crossed (bid 2 ≥ ask 1) with no trade.
    const after = await buildBookView(db, { ...base, now: new Date("2026-09-16T10:00:00Z") });
    expect(after.depth.asks).toEqual([]);
    expect(after.depth.bids).toEqual([]);
    expect(after.trades).toEqual([expect.objectContaining({ buyerKey: "sb:angel", sellerKey: "sh:s1", price: 2, qty: 50, tradedAt: "2026-09-16T10:00:00.000Z" })]);
    expect(after.discovery.last).toBe(2);
    expect(store.secondary_sim_orders.find((o) => o.side === "sell")).toMatchObject({ status: "filled", remaining: 0 });
    expect(store.secondary_sim_orders.find((o) => o.side === "buy")).toMatchObject({ status: "filled", remaining: 0 });
    // positions reflect the release fill: Ada 600 − 50, Angel +50
    expect(after.holders.find((h) => h.holderKey === "sh:s1")?.position).toBe(550);
    expect(after.holders.find((h) => h.holderKey === "sb:angel")?.position).toBe(50);
  });

  it("a released hold that only partly crosses rests the remainder; releases match in seq order", async () => {
    await saveSettings(db, PROJ, { rofrEnabled: true, rofrHoldHours: 1 });
    await placeOrder(db, { ...base, side: "buy", price: 1.5, qty: 30, holderLabel: "Angel" });
    const first = await placeOrder(db, { ...base, side: "sell", price: 1, qty: 50, shareholderId: "s1" });
    const second = await placeOrder(db, { ...base, side: "sell", price: 1, qty: 20, shareholderId: "s2", now: new Date("2026-09-13T10:00:01Z") });
    expect(first.ok && first.held && second.ok && second.held).toBe(true);
    // Both holds lapse; a later placement releases them (seq order: Ada first) and matches before it trades.
    const later = new Date("2026-09-13T12:00:00Z");
    const probe = await placeOrder(db, { ...base, side: "buy", price: 0.5, qty: 1, holderLabel: "Nobody", now: later });
    expect(probe.ok && probe.fills).toEqual([]);
    expect(store.secondary_sim_trades).toEqual([expect.objectContaining({ seller_key: "sh:s1", buyer_key: "sb:angel", price_aud: 1.5, qty: 30 })]);
    expect(store.secondary_sim_orders.find((o) => o.holder_key === "sh:s1")).toMatchObject({ status: "open", remaining: 20 });
    expect(store.secondary_sim_orders.find((o) => o.holder_key === "sh:s2")).toMatchObject({ status: "open", remaining: 20 });
    const view = await buildBookView(db, { ...base, now: later });
    expect(view.depth.asks).toEqual([{ price: 1, qty: 40, orders: 2, held: 0 }]);
  });

  it("a lost race on the resting order's conditional update skips the fill (no trade, no double fill)", async () => {
    await placeOrder(db, { ...base, side: "sell", price: 1, qty: 100, shareholderId: "s1" });
    // Someone else fills the resting order between our read and our write.
    const racy = memSupabase(store, {
      onUpdate: (table, patch, rows) => {
        if (table === "secondary_sim_orders" && "remaining" in patch && rows.length === 1 && rows[0].side === "sell") {
          rows[0].remaining = 0; // mutate before assign → our conditional .eq("remaining", 100) would not have matched
          rows.length = 0;
        }
      },
    });
    const buy = await placeOrder(racy, { ...base, side: "buy", price: 1, qty: 10, holderLabel: "Angel" });
    expect(buy.ok && buy.fills).toEqual([]);
    expect(buy.ok && buy.order).toMatchObject({ remaining: 10, status: "open" });
    expect(store.secondary_sim_trades).toEqual([]);
  });
});

describe("cancelOrder / saveSettings", () => {
  it("cancels open / held only, project-scoped; settings clamp the window", async () => {
    const r = await placeOrder(db, { ...base, side: "buy", price: 1, qty: 1, holderLabel: "Angel" });
    const id = r.ok ? r.order.id : "";
    expect(await cancelOrder(db, { projectId: "other", orderId: id })).toMatchObject({ ok: false, status: 404 });
    expect((await cancelOrder(db, { projectId: PROJ, orderId: id, now: NOW })).ok).toBe(true);
    expect(store.secondary_sim_orders[0]).toMatchObject({ status: "cancelled", cancelled_at: NOW.toISOString() });
    expect(await cancelOrder(db, { projectId: PROJ, orderId: id })).toMatchObject({ ok: false, status: 409 });

    expect(await saveSettings(db, PROJ, { rofrHoldHours: 99999 })).toEqual({ rofrEnabled: false, rofrHoldHours: 720 });
    expect(await saveSettings(db, PROJ, { rofrEnabled: true, rofrHoldHours: 0 })).toEqual({ rofrEnabled: true, rofrHoldHours: 1 });
  });
});

describe("buildBookView", () => {
  it("sandbox flag + notice, tape, positions and sandbox-implied valuation off the OWNER's fully diluted count; no NaN", async () => {
    await placeOrder(db, { ...base, side: "sell", price: 1.5, qty: 100, shareholderId: "s1" });
    await placeOrder(db, { ...base, side: "buy", price: 1.5, qty: 30, holderLabel: "Angel" });
    await placeOrder(db, { ...base, side: "buy", price: 1.0, qty: 10, shareholderId: "s2" });
    const v = await buildBookView(db, base);
    expect(v.sandbox).toBe(true);
    expect(v.notice).toMatch(/Chapter 6D/);
    expect(v.fullyDilutedShares).toBe(2000);
    expect(v.discovery).toMatchObject({ label: "sandbox implied", last: 1.5, vwap: 1.5, mid: 1.25, impliedValuationAud: 3000, tradedShares: 30, tradeCount: 1 });
    expect(v.depth.bids).toEqual([{ price: 1.0, qty: 10, orders: 1, held: 0 }]);
    expect(v.depth.asks).toEqual([{ price: 1.5, qty: 70, orders: 1, held: 0 }]);
    expect(v.trades).toHaveLength(1);
    expect(v.holders).toEqual([
      expect.objectContaining({ holderKey: "sh:s1", label: "Ada", register: 600, position: 570, restingSell: 70, onRegister: true }),
      expect.objectContaining({ holderKey: "sh:s2", label: "Bob", register: 400, position: 400, restingSell: 0, onRegister: true }),
      expect.objectContaining({ holderKey: "sb:angel", label: "Angel", register: 0, position: 30, restingSell: 0, onRegister: false }),
    ]);
    expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);
  });

  it("empty project: nulls, zero counts, still sandbox-labelled", async () => {
    store.shareholders = [];
    store.esop_pool = [];
    const v = await buildBookView(db, base);
    expect(v.discovery).toMatchObject({ last: null, mid: null, vwap: null, impliedValuationAud: null, fullyDilutedShares: 0 });
    expect(v.holders).toEqual([]);
    expect(v.settings).toEqual({ rofrEnabled: false, rofrHoldHours: 48 });
    expect(JSON.stringify(v)).not.toMatch(/NaN/);
  });
});
