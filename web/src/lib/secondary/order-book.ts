// S27-B — pre-IPO secondary trading SANDBOX: pure limit-order matching engine.
//
// Everything here is a simulation over a project's tokenised shares. No real
// securities are offered, issued or transferred; nothing here is an offer
// under Chapter 6D or Chapter 7 of the Corporations Act 2001 (Cth). Every API
// response and every view that touches this module carries `sandbox: true`
// and the SANDBOX_NOTICE below.
//
// Rules (plain, deterministic, unit-tested):
//   • limit orders only — a buy at P fills against asks priced ≤ P, a sell at
//     P against bids priced ≥ P; the trade prints at the RESTING order's
//     price (price-time priority: best price first, then earliest `seq`)
//   • partial fills — the remainder rests on the book
//   • no shorting — a sell is refused when qty exceeds the holder's sandbox
//     position (register holding + sandbox buys − sandbox sells) minus what
//     they already have resting on the sell side
//   • self-trade prevention — an order never fills against the same holder
//   • ROFR — when the project's shareholders' agreement flag is on, a new
//     sell is HELD for `rofrHoldHours` (default 48) before it can match,
//     modelling the right-of-first-refusal notice window; a held order still
//     shows in the depth ladder (flagged) and can be cancelled
//
// Quantities are whole shares; prices are AUD with 4 dp. `seq` is a strictly
// increasing integer the store assigns (bigserial) so time priority never
// depends on clock ties.

export const SANDBOX_NOTICE =
  "Sandbox — no real securities are offered or transferred; not an offer under Chapter 6D or Chapter 7 of the Corporations Act 2001 (Cth). Prices are simulated by the people you invite to this order book and are not a valuation.";

export const DEFAULT_ROFR_HOLD_HOURS = 48;
export const MAX_ORDER_QTY = 1_000_000_000;
export const MAX_PRICE_AUD = 1_000_000;

export type Side = "buy" | "sell";
export type OrderStatus = "open" | "held" | "filled" | "cancelled";

export interface SimOrder {
  id: string;
  /** stable holder key: `sh:<shareholder id>` or `sb:<label>` for an invited sandbox buyer */
  holderKey: string;
  holderLabel: string;
  side: Side;
  price: number;
  qty: number;
  remaining: number;
  status: OrderStatus;
  /** ISO — a `held` sell cannot match until this instant */
  holdUntil: string | null;
  seq: number;
  createdAt: string;
}

export interface Fill {
  buyOrderId: string;
  sellOrderId: string;
  buyerKey: string;
  buyerLabel: string;
  sellerKey: string;
  sellerLabel: string;
  price: number;
  qty: number;
}

export interface MatchResult {
  /** the incoming order after matching (remaining / status updated) */
  order: SimOrder;
  /** resting orders that changed (remaining / status) — persist these */
  updated: SimOrder[];
  fills: Fill[];
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function isHeld(o: Pick<SimOrder, "status" | "holdUntil">, now: Date): boolean {
  if (o.status !== "held") return false;
  if (!o.holdUntil) return false;
  return new Date(o.holdUntil).getTime() > now.getTime();
}

/** Held sells whose window has passed become `open`. Pure: returns the changed ones. */
export function releaseHolds(book: SimOrder[], now: Date): SimOrder[] {
  const released: SimOrder[] = [];
  for (const o of book) {
    if (o.status === "held" && !isHeld(o, now)) {
      o.status = "open";
      released.push(o);
    }
  }
  return released;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidateInput {
  side: Side;
  price: number;
  qty: number;
  /** holder's sandbox position (register + sim buys − sim sells) */
  position: number;
  /** qty already resting on the SELL side for this holder */
  restingSell: number;
}

export type ValidationError =
  | "invalid_side"
  | "invalid_price"
  | "invalid_qty"
  | "exceeds_holdings";

export function validateOrder(input: ValidateInput): { ok: true } | { ok: false; error: ValidationError; detail?: string } {
  if (input.side !== "buy" && input.side !== "sell") return { ok: false, error: "invalid_side" };
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > MAX_PRICE_AUD) return { ok: false, error: "invalid_price" };
  if (!Number.isInteger(input.qty) || input.qty <= 0 || input.qty > MAX_ORDER_QTY) return { ok: false, error: "invalid_qty" };
  if (input.side === "sell") {
    const available = Math.max(0, Math.floor(input.position) - Math.max(0, Math.floor(input.restingSell)));
    if (input.qty > available) {
      return { ok: false, error: "exceeds_holdings", detail: `You can sell at most ${available.toLocaleString("en-AU")} shares in the sandbox (position ${Math.floor(input.position).toLocaleString("en-AU")}, ${Math.floor(input.restingSell).toLocaleString("en-AU")} already resting).` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function restingComparator(side: Side) {
  // For an incoming BUY we walk the asks: lowest price first, then oldest.
  // For an incoming SELL we walk the bids: highest price first, then oldest.
  return side === "buy"
    ? (a: SimOrder, b: SimOrder) => a.price - b.price || a.seq - b.seq
    : (a: SimOrder, b: SimOrder) => b.price - a.price || a.seq - b.seq;
}

function crosses(incoming: SimOrder, resting: SimOrder): boolean {
  return incoming.side === "buy" ? resting.price <= incoming.price : resting.price >= incoming.price;
}

/**
 * Match `incoming` against the resting `book` (both sides; only the
 * opposite side is walked). Mutates copies, never the inputs.
 */
export function matchOrder(incoming: SimOrder, book: SimOrder[], now: Date): MatchResult {
  const order: SimOrder = { ...incoming };
  const fills: Fill[] = [];
  const updated: SimOrder[] = [];

  if (isHeld(order, now)) {
    return { order, updated, fills };
  }

  const opposite: Side = order.side === "buy" ? "sell" : "buy";
  const candidates = book
    .filter((o) => o.side === opposite && o.status === "open" && o.remaining > 0 && o.holderKey !== order.holderKey)
    .map((o) => ({ ...o }))
    .sort(restingComparator(order.side));

  for (const resting of candidates) {
    if (order.remaining <= 0) break;
    if (!crosses(order, resting)) break; // sorted best-first, nothing further can cross
    const qty = Math.min(order.remaining, resting.remaining);
    if (qty <= 0) continue;
    const price = resting.price;
    order.remaining -= qty;
    resting.remaining -= qty;
    if (resting.remaining === 0) resting.status = "filled";
    updated.push(resting);
    const buy = order.side === "buy" ? order : resting;
    const sell = order.side === "sell" ? order : resting;
    fills.push({
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      buyerKey: buy.holderKey,
      buyerLabel: buy.holderLabel,
      sellerKey: sell.holderKey,
      sellerLabel: sell.holderLabel,
      price,
      qty,
    });
  }

  if (order.remaining === 0) order.status = "filled";
  return { order, updated, fills };
}

/** Cancel an open / held order. Pure: returns the changed copy or null when not cancellable. */
export function cancelOrder(order: SimOrder): SimOrder | null {
  if (order.status !== "open" && order.status !== "held") return null;
  return { ...order, status: "cancelled" };
}

// ---------------------------------------------------------------------------
// Depth + price discovery
// ---------------------------------------------------------------------------

export interface DepthLevel {
  price: number;
  qty: number;
  orders: number;
  /** qty at this level that is still inside a ROFR hold */
  held: number;
}

export interface Depth {
  bids: DepthLevel[];
  asks: DepthLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
}

export function buildDepth(book: SimOrder[], levels = 10): Depth {
  const agg = (side: Side) => {
    const map = new Map<number, DepthLevel>();
    for (const o of book) {
      if (o.side !== side || (o.status !== "open" && o.status !== "held") || o.remaining <= 0) continue;
      const price = round4(o.price);
      const lvl = map.get(price) ?? { price, qty: 0, orders: 0, held: 0 };
      lvl.qty += o.remaining;
      lvl.orders += 1;
      if (o.status === "held") lvl.held += o.remaining;
      map.set(price, lvl);
    }
    const list = [...map.values()];
    list.sort(side === "buy" ? (a, b) => b.price - a.price : (a, b) => a.price - b.price);
    return list.slice(0, levels);
  };
  const bids = agg("buy");
  const asks = agg("sell");
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  return { bids, asks, bestBid, bestAsk, spread: bestBid !== null && bestAsk !== null ? round4(bestAsk - bestBid) : null };
}

export interface TradeLike {
  price: number;
  qty: number;
  tradedAt: string;
}

export interface PriceDiscovery {
  sandbox: true;
  label: "sandbox implied";
  last: number | null;
  mid: number | null;
  vwap: number | null;
  /** last × fully diluted shares — a sandbox number, never a valuation */
  impliedValuationAud: number | null;
  fullyDilutedShares: number;
  tradedShares: number;
  tradeCount: number;
}

/** No NaN, ever: every field is a finite number or null. */
export function priceDiscovery(args: { depth: Depth; trades: TradeLike[]; fullyDilutedShares: number }): PriceDiscovery {
  const fd = Number.isFinite(args.fullyDilutedShares) && args.fullyDilutedShares > 0 ? Math.floor(args.fullyDilutedShares) : 0;
  const trades = args.trades.filter((t) => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.qty) && t.qty > 0);
  const sorted = [...trades].sort((a, b) => a.tradedAt.localeCompare(b.tradedAt));
  const last = sorted.length ? round4(sorted[sorted.length - 1].price) : null;
  const notional = trades.reduce((s, t) => s + t.price * t.qty, 0);
  const volume = trades.reduce((s, t) => s + t.qty, 0);
  const vwap = volume > 0 ? round4(notional / volume) : null;
  const { bestBid, bestAsk } = args.depth;
  const mid = bestBid !== null && bestAsk !== null ? round4((bestBid + bestAsk) / 2) : null;
  const implied = last !== null && fd > 0 ? Math.round(last * fd) : null;
  return {
    sandbox: true,
    label: "sandbox implied",
    last,
    mid,
    vwap,
    impliedValuationAud: implied !== null && Number.isFinite(implied) ? implied : null,
    fullyDilutedShares: fd,
    tradedShares: volume,
    tradeCount: trades.length,
  };
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/**
 * Sandbox position per holder: register holding + sim buys − sim sells.
 * Buyers with no register row start at 0 (they can only buy).
 */
export function positions(
  register: Array<{ holderKey: string; shares: number }>,
  trades: Array<{ buyerKey: string; sellerKey: string; qty: number }>,
): Map<string, number> {
  const pos = new Map<string, number>();
  for (const r of register) pos.set(r.holderKey, (pos.get(r.holderKey) ?? 0) + Math.max(0, Math.floor(r.shares)));
  for (const t of trades) {
    pos.set(t.buyerKey, (pos.get(t.buyerKey) ?? 0) + t.qty);
    pos.set(t.sellerKey, (pos.get(t.sellerKey) ?? 0) - t.qty);
  }
  return pos;
}

export function restingSellQty(book: SimOrder[], holderKey: string): number {
  return book.reduce((s, o) => (o.holderKey === holderKey && o.side === "sell" && (o.status === "open" || o.status === "held") ? s + o.remaining : s), 0);
}
