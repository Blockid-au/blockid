// PAYG KPIs for the /admin dashboard (G35 Pricing v5 §6.8):
//
//   orders by tier       paid v5 orders (Snapshot / Full / Verified / upgrades)
//                        in the last 7 and 30 days
//   PAYG revenue         A$ (cents, GST-inclusive) of paid v5 card orders in
//                        7 / 30 days; refunded orders excluded and counted apart
//   Snapshot → Full      share of Snapshot buyers (30-day cohort) who later
//                        bought Full for the same startup (upgrade SKU, a Full
//                        order, or an order whose upgrade_of_order_id points
//                        at the Snapshot)
//   Verified SLA         W4's definition (lib/verified-review/kpi.ts
//                        computeSlaHitRate): orders due in the last 30 days,
//                        on time = delivered_at ≤ sla_due_at, an IN_REVIEW
//                        order past due counts as a miss; plus the open queue
//   PAYG → subscription  distinct PAYG buyers (all time in the read window)
//                        whose subscription (trial_start, else updated_at)
//                        started after their first paid PAYG order
//
// The SLA rate reuses W4's pure `computeSlaHitRate` over the same order rows
// (one definition for /admin and /admin/verified-reviews).
//
// `computePaygKpis` is pure (tests); `loadPaygKpis` does the reads and never
// throws — a missing 0474 column degrades to `null`, never a broken dashboard.

import { PAYG_SKUS, isPaygSkuId, type PaygSkuId } from "@/lib/pricing/v5-payg";
import { VERIFIED_ORDER_SKUS, computeSlaHitRate } from "@/lib/verified-review/kpi";

/** Statuses that mean money moved and was kept (REFUNDED is counted apart). */
export const PAYG_PAID_STATUSES = ["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"] as const;
const PAID = new Set<string>(PAYG_PAID_STATUSES);
const ACTIVE_SUB = new Set(["trialing", "active", "past_due"]);

export interface PaygOrderRow {
  id: string;
  user_id: string | null;
  business_id: string | null;
  product_sku: string;
  status: string;
  amount_aud: number | null;
  paid_at: string | null;
  created_at: string;
  delivered_at?: string | null;
  sla_due_at?: string | null;
  upgrade_of_order_id?: string | null;
}

export interface PaygSubscriptionRow {
  user_id: string | null;
  status: string | null;
  trial_start?: string | null;
  updated_at?: string | null;
}

export type PaygKpiBucket = "snapshot" | "full" | "verified" | "upgrade" | "funding";

export interface PaygWindowKpi {
  days: number;
  orders: number;
  byTier: Record<PaygKpiBucket, number>;
  revenueCents: number;
  refunded: number;
}

export interface PaygKpis {
  last7: PaygWindowKpi;
  last30: PaygWindowKpi;
  /** Snapshot buyers in the 30-day cohort and how many moved to Full. */
  snapshotToFull: { cohort: number; upgraded: number; rate: number | null };
  /** W4 computeSlaHitRate over orders due in 30 days (breached = in review past due); plus the open queue. */
  verifiedSla: { onTime: number; late: number; breached: number; rate: number | null; open: number; openOverdue: number };
  /** Distinct PAYG buyers and how many subscribed after their first PAYG order. */
  buyersSubscribed: { buyers: number; subscribed: number; rate: number | null };
}

function bucketFor(sku: PaygSkuId): PaygKpiBucket {
  const s = PAYG_SKUS[sku];
  if (s.kind === "upgrade") return "upgrade";
  if (s.kind === "funding") return "funding";
  return s.tier ?? "full";
}

function at(row: PaygOrderRow): number {
  return Date.parse(row.paid_at ?? row.created_at);
}

const emptyByTier = (): Record<PaygKpiBucket, number> => ({ snapshot: 0, full: 0, verified: 0, upgrade: 0, funding: 0 });
const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

function windowKpi(rows: PaygOrderRow[], now: number, days: number): PaygWindowKpi {
  const since = now - days * 86_400_000;
  const out: PaygWindowKpi = { days, orders: 0, byTier: emptyByTier(), revenueCents: 0, refunded: 0 };
  for (const r of rows) {
    if (!isPaygSkuId(r.product_sku)) continue;
    const t = at(r);
    if (!Number.isFinite(t) || t < since || t > now) continue;
    if (r.status === "REFUNDED") {
      out.refunded += 1;
      continue;
    }
    if (!PAID.has(r.status)) continue;
    out.orders += 1;
    out.byTier[bucketFor(r.product_sku)] += 1;
    out.revenueCents += Math.max(0, Number(r.amount_aud ?? 0)) || 0;
  }
  return out;
}

export function computePaygKpis(input: { orders: PaygOrderRow[]; subscriptions?: PaygSubscriptionRow[]; now?: Date }): PaygKpis {
  const now = (input.now ?? new Date()).getTime();
  const orders = input.orders.filter((r) => isPaygSkuId(r.product_sku));
  const paid = orders.filter((r) => PAID.has(r.status));

  // Snapshot → Full (30-day Snapshot cohort; a later Full/upgrade for the same startup counts).
  const since30 = now - 30 * 86_400_000;
  const snapshots = paid.filter((r) => r.product_sku === "report_snapshot" && at(r) >= since30 && at(r) <= now);
  let upgraded = 0;
  for (const s of snapshots) {
    const moved = paid.some(
      (o) =>
        o.id !== s.id &&
        (o.upgrade_of_order_id === s.id ||
          ((o.product_sku === "upgrade_snapshot_full" || o.product_sku === "report_full") &&
            o.business_id === s.business_id &&
            o.user_id === s.user_id &&
            at(o) >= at(s))),
    );
    if (moved) upgraded += 1;
  }

  // Verified SLA — W4's definition, plus the open review queue.
  const verifiedSkus = new Set<string>(VERIFIED_ORDER_SKUS);
  const verified = orders.filter((r) => verifiedSkus.has(r.product_sku));
  const sla = computeSlaHitRate(verified as unknown as Record<string, unknown>[], new Date(now), 30);
  let open = 0;
  let openOverdue = 0;
  for (const v of verified) {
    if (v.status !== "IN_REVIEW") continue;
    open += 1;
    const due = v.sla_due_at ? Date.parse(v.sla_due_at) : NaN;
    if (Number.isFinite(due) && due < now) openOverdue += 1;
  }

  // PAYG buyer → subscription after the first paid PAYG order.
  const firstPaid = new Map<string, number>();
  for (const r of paid) {
    if (!r.user_id) continue;
    const t = at(r);
    if (!Number.isFinite(t)) continue;
    const prev = firstPaid.get(r.user_id);
    if (prev === undefined || t < prev) firstPaid.set(r.user_id, t);
  }
  let subscribed = 0;
  const subs = new Map<string, PaygSubscriptionRow>();
  for (const s of input.subscriptions ?? []) if (s.user_id) subs.set(s.user_id, s);
  for (const [uid, first] of firstPaid) {
    const s = subs.get(uid);
    if (!s || !s.status || !ACTIVE_SUB.has(s.status)) continue;
    const started = Date.parse(s.trial_start ?? s.updated_at ?? "");
    if (Number.isFinite(started) && started >= first) subscribed += 1;
  }

  return {
    last7: windowKpi(orders, now, 7),
    last30: windowKpi(orders, now, 30),
    snapshotToFull: { cohort: snapshots.length, upgraded, rate: ratio(upgraded, snapshots.length) },
    verifiedSla: { onTime: sla.onTime, late: sla.late, breached: sla.breached, rate: sla.rate, open, openOverdue },
    buyersSubscribed: { buyers: firstPaid.size, subscribed, rate: ratio(subscribed, firstPaid.size) },
  };
}

type Result = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** The narrow PostgREST surface the loader uses (Supabase admin client fits). */
export interface PaygKpiDb {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: readonly string[]): {
        gte(col: string, v: string): { limit(n: number): Result };
        limit(n: number): Result;
      };
    };
  };
}

export const PAYG_ORDER_COLUMNS =
  "id, user_id, business_id, product_sku, status, amount_aud, paid_at, created_at, delivered_at, sla_due_at, upgrade_of_order_id";

/** Reads the last 180 days of v5 orders + the buyers' subscription rows. Never throws; null when unreadable. */
export async function loadPaygKpis(db: PaygKpiDb | null, now: Date = new Date()): Promise<PaygKpis | null> {
  if (!db) return null;
  try {
    const since = new Date(now.getTime() - 180 * 86_400_000).toISOString();
    const skus = Object.keys(PAYG_SKUS);
    const { data, error } = await db.from("report_orders").select(PAYG_ORDER_COLUMNS).in("product_sku", skus).gte("created_at", since).limit(10_000);
    if (error || !Array.isArray(data)) return null;
    const orders = data as PaygOrderRow[];
    const userIds = [...new Set(orders.map((o) => o.user_id).filter((u): u is string => !!u))];
    let subscriptions: PaygSubscriptionRow[] = [];
    if (userIds.length) {
      const res = await db.from("subscription_trial_state").select("user_id, status, trial_start, updated_at").in("user_id", userIds.slice(0, 1000)).limit(1000);
      if (!res.error && Array.isArray(res.data)) subscriptions = res.data as PaygSubscriptionRow[];
    }
    return computePaygKpis({ orders, subscriptions, now });
  } catch {
    return null;
  }
}
