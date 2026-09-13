// S27-B — secondary trading SANDBOX: server-side store over the pure engine.
//
// Everything is project-scoped and keyed on the project OWNER for the
// register (`shareholders.account_id` = owner user id + project_id). The
// caller's own `user_id` is stamped on orders they place (provenance +
// erasure), never used as a data key.
//
// Concurrency: the sandbox is a low-volume founder tool. Matching reads the
// open book, computes fills in memory and writes the resulting rows; a
// concurrent placement on the same project could double-fill a resting
// order in theory. `remaining` is re-checked with a conditional UPDATE
// (`.eq("remaining", before)`) and a lost race skips that fill, so the
// worst case is a fill that does not happen — never a negative position.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ROFR_HOLD_HOURS,
  SANDBOX_NOTICE,
  buildDepth,
  cancelOrder as cancelPure,
  matchOrder,
  positions,
  priceDiscovery,
  releaseHolds,
  restingSellQty,
  round4,
  validateOrder,
  type Depth,
  type Fill,
  type PriceDiscovery,
  type Side,
  type SimOrder,
} from "./order-book";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface SimSettings {
  rofrEnabled: boolean;
  rofrHoldHours: number;
}

export interface RegisterHolder {
  shareholderId: string;
  holderKey: string;
  name: string;
  shares: number;
}

export interface SimTrade {
  id: string;
  buyOrderId: string | null;
  sellOrderId: string | null;
  buyerKey: string;
  buyerLabel: string;
  sellerKey: string;
  sellerLabel: string;
  price: number;
  qty: number;
  tradedAt: string;
}

export interface BookView {
  sandbox: true;
  notice: string;
  settings: SimSettings;
  depth: Depth;
  discovery: PriceDiscovery;
  trades: SimTrade[];
  holders: Array<{ holderKey: string; label: string; register: number; position: number; restingSell: number; onRegister: boolean }>;
  fullyDilutedShares: number;
}

const ORDER_COLS = "id, project_id, user_id, shareholder_id, holder_key, holder_label, side, price_aud, qty, remaining, status, hold_until, seq, created_at, updated_at, cancelled_at";
const TRADE_COLS = "id, buy_order_id, sell_order_id, buyer_key, buyer_label, seller_key, seller_label, price_aud, qty, traded_at";

export function rowToOrder(r: Record<string, unknown>): SimOrder {
  return {
    id: String(r.id),
    holderKey: String(r.holder_key),
    holderLabel: String(r.holder_label),
    side: r.side as Side,
    price: round4(Number(r.price_aud)),
    qty: Number(r.qty),
    remaining: Number(r.remaining),
    status: r.status as SimOrder["status"],
    holdUntil: typeof r.hold_until === "string" ? r.hold_until : null,
    seq: Number(r.seq),
    createdAt: String(r.created_at),
  };
}

export function rowToTrade(r: Record<string, unknown>): SimTrade {
  return {
    id: String(r.id),
    buyOrderId: typeof r.buy_order_id === "string" ? r.buy_order_id : null,
    sellOrderId: typeof r.sell_order_id === "string" ? r.sell_order_id : null,
    buyerKey: String(r.buyer_key),
    buyerLabel: String(r.buyer_label),
    sellerKey: String(r.seller_key),
    sellerLabel: String(r.seller_label),
    price: round4(Number(r.price_aud)),
    qty: Number(r.qty),
    tradedAt: String(r.traded_at),
  };
}

export async function loadSettings(db: Db, projectId: string): Promise<SimSettings> {
  const { data } = await db.from("secondary_sim_settings").select("rofr_enabled, rofr_hold_hours").eq("project_id", projectId).maybeSingle();
  const row = data as { rofr_enabled?: boolean; rofr_hold_hours?: number } | null;
  return {
    rofrEnabled: Boolean(row?.rofr_enabled),
    rofrHoldHours: Number.isFinite(Number(row?.rofr_hold_hours)) && Number(row?.rofr_hold_hours) > 0 ? Number(row?.rofr_hold_hours) : DEFAULT_ROFR_HOLD_HOURS,
  };
}

export async function saveSettings(db: Db, projectId: string, s: Partial<SimSettings>): Promise<SimSettings> {
  const current = await loadSettings(db, projectId);
  const next: SimSettings = {
    rofrEnabled: s.rofrEnabled ?? current.rofrEnabled,
    rofrHoldHours: Math.min(720, Math.max(1, Math.floor(s.rofrHoldHours ?? current.rofrHoldHours))),
  };
  const { error } = await db
    .from("secondary_sim_settings")
    .upsert({ project_id: projectId, rofr_enabled: next.rofrEnabled, rofr_hold_hours: next.rofrHoldHours, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) throw new Error(error.message ?? "settings save failed");
  return next;
}

export async function loadRegister(db: Db, ownerUserId: string, projectId: string): Promise<{ holders: RegisterHolder[]; fullyDilutedShares: number }> {
  const [{ data: rows }, { data: esop }] = await Promise.all([
    db.from("shareholders").select("id, name, shares_held").eq("account_id", ownerUserId).eq("project_id", projectId),
    db.from("esop_pool").select("total_pool_shares").eq("account_id", ownerUserId).eq("project_id", projectId).maybeSingle(),
  ]);
  const holders = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    shareholderId: String(r.id),
    holderKey: `sh:${String(r.id)}`,
    name: String(r.name ?? "Shareholder"),
    shares: Math.max(0, Math.floor(Number(r.shares_held ?? 0))),
  }));
  const issued = holders.reduce((s, h) => s + h.shares, 0);
  const pool = Math.max(0, Math.floor(Number((esop as { total_pool_shares?: unknown } | null)?.total_pool_shares ?? 0)));
  return { holders, fullyDilutedShares: issued + pool };
}

export async function loadOpenBook(db: Db, projectId: string): Promise<SimOrder[]> {
  const { data, error } = await db
    .from("secondary_sim_orders")
    .select(ORDER_COLS)
    .eq("project_id", projectId)
    .in("status", ["open", "held"])
    .order("seq", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message ?? "book read failed");
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToOrder);
}

export async function loadTrades(db: Db, projectId: string, limit = 200): Promise<SimTrade[]> {
  const { data, error } = await db
    .from("secondary_sim_trades")
    .select(TRADE_COLS)
    .eq("project_id", projectId)
    .order("traded_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message ?? "trades read failed");
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToTrade);
}

export async function listOrders(db: Db, projectId: string, limit = 200): Promise<SimOrder[]> {
  const { data, error } = await db
    .from("secondary_sim_orders")
    .select(ORDER_COLS)
    .eq("project_id", projectId)
    .order("seq", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message ?? "orders read failed");
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToOrder);
}

/** Held sells whose window passed are opened in the store before any read / match. */
async function releaseExpiredHolds(db: Db, book: SimOrder[], now: Date): Promise<void> {
  const released = releaseHolds(book, now);
  for (const o of released) {
    await db.from("secondary_sim_orders").update({ status: "open", updated_at: now.toISOString() }).eq("id", o.id).eq("status", "held");
  }
}

export async function buildBookView(db: Db, args: { projectId: string; ownerUserId: string; now?: Date }): Promise<BookView> {
  const now = args.now ?? new Date();
  const [settings, register, book, trades] = await Promise.all([
    loadSettings(db, args.projectId),
    loadRegister(db, args.ownerUserId, args.projectId),
    loadOpenBook(db, args.projectId),
    loadTrades(db, args.projectId),
  ]);
  await releaseExpiredHolds(db, book, now);
  const depth = buildDepth(book);
  const discovery = priceDiscovery({ depth, trades: trades.map((t) => ({ price: t.price, qty: t.qty, tradedAt: t.tradedAt })), fullyDilutedShares: register.fullyDilutedShares });

  const pos = positions(register.holders.map((h) => ({ holderKey: h.holderKey, shares: h.shares })), trades);
  const labels = new Map<string, string>();
  for (const h of register.holders) labels.set(h.holderKey, h.name);
  for (const o of book) if (!labels.has(o.holderKey)) labels.set(o.holderKey, o.holderLabel);
  for (const t of trades) {
    if (!labels.has(t.buyerKey)) labels.set(t.buyerKey, t.buyerLabel);
    if (!labels.has(t.sellerKey)) labels.set(t.sellerKey, t.sellerLabel);
  }
  const registerByKey = new Map(register.holders.map((h) => [h.holderKey, h.shares]));
  const holders = [...labels.entries()].map(([holderKey, label]) => ({
    holderKey,
    label,
    register: registerByKey.get(holderKey) ?? 0,
    position: pos.get(holderKey) ?? 0,
    restingSell: restingSellQty(book, holderKey),
    onRegister: registerByKey.has(holderKey),
  }));
  holders.sort((a, b) => b.position - a.position || a.label.localeCompare(b.label));

  return { sandbox: true, notice: SANDBOX_NOTICE, settings, depth, discovery, trades, holders, fullyDilutedShares: register.fullyDilutedShares };
}

// ---------------------------------------------------------------------------
// Place / cancel
// ---------------------------------------------------------------------------

export interface PlaceArgs {
  projectId: string;
  ownerUserId: string;
  userId: string;
  side: Side;
  price: number;
  qty: number;
  /** trade AS a register holder … */
  shareholderId?: string | null;
  /** … or AS an invited sandbox buyer (buys only; a label with no register row) */
  holderLabel?: string | null;
  now?: Date;
}

export type PlaceOutcome =
  | { ok: true; order: SimOrder; fills: Fill[]; held: boolean }
  | { ok: false; status: 400 | 404 | 422; error: string; detail?: string };

const LABEL_RE = /^[\p{L}\p{N} .,'&()\-]{1,120}$/u;

export async function placeOrder(db: Db, args: PlaceArgs): Promise<PlaceOutcome> {
  const now = args.now ?? new Date();
  const price = round4(Number(args.price));
  const qty = Number(args.qty);

  const [settings, register, book, trades] = await Promise.all([
    loadSettings(db, args.projectId),
    loadRegister(db, args.ownerUserId, args.projectId),
    loadOpenBook(db, args.projectId),
    loadTrades(db, args.projectId, 5000),
  ]);
  await releaseExpiredHolds(db, book, now);

  // Resolve the holder identity the order trades as.
  let holderKey: string;
  let holderLabel: string;
  let shareholderId: string | null = null;
  if (args.shareholderId) {
    const h = register.holders.find((r) => r.shareholderId === args.shareholderId);
    if (!h) return { ok: false, status: 404, error: "shareholder_not_found", detail: "That holder is not on this project's register." };
    holderKey = h.holderKey;
    holderLabel = h.name;
    shareholderId = h.shareholderId;
  } else {
    const label = String(args.holderLabel ?? "").trim();
    if (!LABEL_RE.test(label)) return { ok: false, status: 400, error: "invalid_holder", detail: "Pick a register holder, or name a sandbox buyer (letters, numbers, spaces)." };
    holderKey = `sb:${label.toLowerCase()}`;
    holderLabel = label;
  }

  const pos = positions(register.holders.map((h) => ({ holderKey: h.holderKey, shares: h.shares })), trades);
  const v = validateOrder({ side: args.side, price, qty, position: pos.get(holderKey) ?? 0, restingSell: restingSellQty(book, holderKey) });
  if (!v.ok) return { ok: false, status: v.error === "exceeds_holdings" ? 422 : 400, error: v.error, detail: v.detail };

  const held = args.side === "sell" && settings.rofrEnabled;
  const holdUntil = held ? new Date(now.getTime() + settings.rofrHoldHours * 3_600_000).toISOString() : null;

  // Insert first so the order has an id + seq, then match and persist fills.
  const { data: inserted, error: insErr } = await db
    .from("secondary_sim_orders")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      shareholder_id: shareholderId,
      holder_key: holderKey,
      holder_label: holderLabel,
      side: args.side,
      price_aud: price,
      qty,
      remaining: qty,
      status: held ? "held" : "open",
      hold_until: holdUntil,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select(ORDER_COLS)
    .single();
  if (insErr || !inserted) throw new Error(insErr?.message ?? "order insert failed");
  const incoming = rowToOrder(inserted as Record<string, unknown>);

  const result = matchOrder(incoming, book, now);
  const fills: Fill[] = [];
  let filledQty = 0;
  for (let i = 0; i < result.fills.length; i++) {
    const f = result.fills[i];
    const restingId = incoming.side === "buy" ? f.sellOrderId : f.buyOrderId;
    const before = book.find((o) => o.id === restingId);
    const after = result.updated.find((o) => o.id === restingId);
    if (!before || !after) continue;
    // Conditional update — a lost race (someone else filled it first) skips this fill.
    const { data: upd } = await db
      .from("secondary_sim_orders")
      .update({ remaining: after.remaining, status: after.status, updated_at: now.toISOString() })
      .eq("id", restingId)
      .eq("remaining", before.remaining)
      .select("id");
    if (!upd || (Array.isArray(upd) && upd.length === 0)) continue;
    const { error: tErr } = await db.from("secondary_sim_trades").insert({
      project_id: args.projectId,
      buy_order_id: f.buyOrderId,
      sell_order_id: f.sellOrderId,
      buyer_key: f.buyerKey,
      buyer_label: f.buyerLabel,
      seller_key: f.sellerKey,
      seller_label: f.sellerLabel,
      price_aud: f.price,
      qty: f.qty,
      traded_at: now.toISOString(),
    });
    if (tErr) throw new Error(tErr.message ?? "trade insert failed");
    fills.push(f);
    filledQty += f.qty;
  }

  const remaining = incoming.qty - filledQty;
  const status: SimOrder["status"] = remaining === 0 ? "filled" : incoming.status;
  if (filledQty > 0) {
    await db.from("secondary_sim_orders").update({ remaining, status, updated_at: now.toISOString() }).eq("id", incoming.id);
  }
  return { ok: true, order: { ...incoming, remaining, status }, fills, held };
}

export async function cancelOrder(db: Db, args: { projectId: string; orderId: string; now?: Date }): Promise<{ ok: true; order: SimOrder } | { ok: false; status: 404 | 409; error: string }> {
  const now = args.now ?? new Date();
  const { data } = await db.from("secondary_sim_orders").select(ORDER_COLS).eq("id", args.orderId).eq("project_id", args.projectId).maybeSingle();
  if (!data) return { ok: false, status: 404, error: "order_not_found" };
  const order = rowToOrder(data as Record<string, unknown>);
  const cancelled = cancelPure(order);
  if (!cancelled) return { ok: false, status: 409, error: "not_cancellable" };
  const { error } = await db
    .from("secondary_sim_orders")
    .update({ status: "cancelled", cancelled_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", args.orderId)
    .eq("project_id", args.projectId)
    .in("status", ["open", "held"]);
  if (error) throw new Error(error.message ?? "cancel failed");
  return { ok: true, order: cancelled };
}
