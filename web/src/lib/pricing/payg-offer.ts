// payg-offer — what a buyer is OFFERED on the review-before-pay step
// (G35 Pricing v5 P3, plan §6.4.1 / §6.4.6).
//
// Pure + isomorphic: GET /api/reports/access builds the offer server-side
// from platform_config + the buyer's report_orders rows, and the paywall
// dialog / unlock rail / evaluator dialog render it. The client only
// DISPLAYS these numbers — POST /api/reports/checkout re-derives the SKU,
// the Stripe Price, the ownership and the Verified cap at submit.
//
// Rules encoded here (pinned by payg-offer.test.ts):
//   - Prices shown = `displayPriceCents()` (platform_config), "one-off, GST incl."
//   - Delivery: Snapshot / Full "usually within an hour"; Verified "within N
//     business days" (N = verified_sla_business_days, D29).
//   - Verified is hidden (available: false) while open Verified work
//     (PAID / GENERATING / IN_REVIEW) ≥ payg_verified_max_open (D29).
//   - Upgrades (D28) are offered only to the owner of a delivered (READY /
//     SHARED) order whose highest owned tier is exactly the upgrade's
//     `from` tier: Snapshot → Full, Full → Verified. Never a coupon.

import { formatAud } from "@/lib/plans-v2";
import { tierForOrderSku } from "@/lib/report-v2/order-tier";
import {
  PAYG_SKUS,
  PAYG_TIERS,
  PAYG_TIER_RANK,
  PAYG_UPGRADES,
  displayPriceCents,
  reportSkuForTier,
  type PaygConfig,
  type PaygReportSkuId,
  type PaygTier,
  type PaygUpgradeSkuId,
} from "./v5-payg";

/** Buyer-facing tier names. */
export const PAYG_TIER_NAME: Readonly<Record<PaygTier, string>> = Object.freeze({
  snapshot: "Snapshot",
  full: "Full",
  verified: "Verified",
});

/** "Snapshot report" — receipts, billing history, e-mails. */
export function paygTierLabel(tier: PaygTier): string {
  return `${PAYG_TIER_NAME[tier]} report`;
}

export const PAYG_BILLING_NOTE = "One-off, GST incl.";

/** Order statuses that count against the Verified review capacity (D29). */
export const VERIFIED_OPEN_STATUSES = ["PAID", "GENERATING", "IN_REVIEW"] as const;
/** SKUs that end in a human review (count against the cap). */
export const VERIFIED_REVIEW_SKUS = ["report_verified", "upgrade_full_verified"] as const;
/** Delivered statuses an upgrade can lift. */
export const UPGRADEABLE_ORDER_STATUSES = ["READY", "SHARED"] as const;
/** Statuses that mean "the buyer holds this tier" (in review = the Full document exists). */
export const OWNED_ORDER_STATUSES = ["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"] as const;

export const VERIFIED_FULL_MESSAGE =
  "Verified reviews are fully booked right now. Choose Full today and move up to Verified later, or try again in a few days.";

export function paygDeliveryText(tier: PaygTier, slaBusinessDays: number): string {
  if (tier === "verified") {
    const n = Number.isInteger(slaBusinessDays) && slaBusinessDays > 0 ? slaBusinessDays : 2;
    return `Within ${n} business day${n === 1 ? "" : "s"} (team review)`;
  }
  return "Usually ready within an hour";
}

export function priceLabelCents(cents: number): string {
  const aud = cents / 100;
  return Number.isInteger(aud) ? formatAud(aud) : `A$${aud.toFixed(2)}`;
}

export interface PaygTierOffer {
  tier: PaygTier;
  sku: PaygReportSkuId;
  name: string;
  included: readonly string[];
  amountCents: number;
  priceLabel: string;
  delivery: string;
  /** Credits that buy this tier (Snapshot 19 / Full 49); null = card only (Verified). */
  creditCost: number | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface PaygUpgradeOffer {
  from: PaygTier;
  to: PaygTier;
  sku: PaygUpgradeSkuId;
  name: string;
  included: readonly string[];
  amountCents: number;
  priceLabel: string;
  delivery: string;
  /** The delivered order whose report this upgrade lifts. */
  orderId: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface PaygOwnedReport {
  orderId: string;
  tier: PaygTier;
  status: string;
}

export interface PaygOfferEnabled {
  enabled: true;
  billingNote: string;
  tiers: PaygTierOffer[];
  upgrades: PaygUpgradeOffer[];
  /** Highest tier this buyer holds for the business (any owning status), or null. */
  owned: PaygOwnedReport | null;
}

export type PaygOffer = { enabled: false } | PaygOfferEnabled;

export interface OrderRowLike {
  id?: unknown;
  status?: unknown;
  product_sku?: unknown;
  created_at?: unknown;
}

interface TieredOrder {
  id: string;
  status: string;
  tier: PaygTier;
}

function tieredOrders(rows: readonly OrderRowLike[]): TieredOrder[] {
  const out: TieredOrder[] = [];
  for (const r of rows) {
    if (typeof r.id !== "string" || typeof r.status !== "string") continue;
    const t = tierForOrderSku(r.product_sku);
    if (t !== "snapshot" && t !== "full" && t !== "verified") continue;
    out.push({ id: r.id, status: r.status, tier: t });
  }
  return out;
}

/** The highest tier held across owning orders (rows in input order; first wins on a tie). */
export function highestOwnedOrder(rows: readonly OrderRowLike[]): PaygOwnedReport | null {
  let best: TieredOrder | null = null;
  for (const o of tieredOrders(rows)) {
    if (!(OWNED_ORDER_STATUSES as readonly string[]).includes(o.status)) continue;
    if (!best || PAYG_TIER_RANK[o.tier] > PAYG_TIER_RANK[best.tier]) best = o;
  }
  return best ? { orderId: best.id, tier: best.tier, status: best.status } : null;
}

export type UpgradeSourceResult =
  | { ok: true; orderId: string; sku: PaygUpgradeSkuId; to: PaygTier }
  | { ok: false; code: "no_upgrade_path" | "not_owned" | "already_higher" | "in_progress"; reason: string };

/**
 * Which delivered order an upgrade from `fromTier` lifts. Server truth for
 * the checkout route and the same rule the offer uses:
 *   - a single-step upgrade Price must exist (D28),
 *   - the buyer's highest owned tier must be exactly `fromTier`,
 *   - that tier must be held on a delivered (READY / SHARED) order.
 */
export function resolveUpgradeSource(rows: readonly OrderRowLike[], fromTier: PaygTier): UpgradeSourceResult {
  const path = PAYG_UPGRADES.find((u) => u.from === fromTier);
  if (!path) return { ok: false, code: "no_upgrade_path", reason: `There is no upgrade from ${PAYG_TIER_NAME[fromTier]}.` };
  const owned = highestOwnedOrder(rows);
  if (!owned || PAYG_TIER_RANK[owned.tier] < PAYG_TIER_RANK[fromTier]) {
    return { ok: false, code: "not_owned", reason: `You need a delivered ${paygTierLabel(fromTier)} for this business first.` };
  }
  if (PAYG_TIER_RANK[owned.tier] > PAYG_TIER_RANK[fromTier]) {
    return { ok: false, code: "already_higher", reason: `You already hold the ${paygTierLabel(owned.tier)} for this business.` };
  }
  const delivered = tieredOrders(rows).find(
    (o) => o.tier === fromTier && (UPGRADEABLE_ORDER_STATUSES as readonly string[]).includes(o.status),
  );
  if (!delivered) {
    return { ok: false, code: "in_progress", reason: `Your ${paygTierLabel(fromTier)} is still being prepared — you can move up once it is ready.` };
  }
  return { ok: true, orderId: delivered.id, sku: path.sku, to: path.to };
}

export interface BuildPaygOfferInput {
  config: Partial<PaygConfig> | null | undefined;
  /** The buyer's report_orders rows for this business (any status). Newest first is best. */
  orders: readonly OrderRowLike[];
  /** Open Verified work platform-wide (VERIFIED_OPEN_STATUSES × VERIFIED_REVIEW_SKUS). */
  openVerifiedCount: number;
}

export function verifiedCapacityLeft(config: Partial<PaygConfig> | null | undefined, openVerifiedCount: number): boolean {
  const cap = typeof config?.payg_verified_max_open === "number" ? config.payg_verified_max_open : 5;
  return Number.isFinite(openVerifiedCount) && openVerifiedCount < cap;
}

export function buildPaygOffer(input: BuildPaygOfferInput): PaygOffer {
  const cfg = input.config ?? {};
  if (cfg.payg_enabled !== true) return { enabled: false };
  const sla = typeof cfg.verified_sla_business_days === "number" ? cfg.verified_sla_business_days : 2;
  const verifiedOpen = verifiedCapacityLeft(cfg, input.openVerifiedCount);

  const tiers: PaygTierOffer[] = PAYG_TIERS.map((tier) => {
    const sku = reportSkuForTier(tier);
    const s = PAYG_SKUS[sku];
    const amountCents = displayPriceCents(sku, cfg);
    const blocked = tier === "verified" && !verifiedOpen;
    return {
      tier,
      sku,
      name: PAYG_TIER_NAME[tier],
      included: s.included,
      amountCents,
      priceLabel: priceLabelCents(amountCents),
      delivery: paygDeliveryText(tier, sla),
      creditCost: s.creditCost,
      available: !blocked,
      unavailableReason: blocked ? VERIFIED_FULL_MESSAGE : null,
    };
  });

  const upgrades: PaygUpgradeOffer[] = [];
  for (const u of PAYG_UPGRADES) {
    const src = resolveUpgradeSource(input.orders, u.from);
    if (!src.ok) continue;
    const s = PAYG_SKUS[u.sku];
    const amountCents = displayPriceCents(u.sku, cfg);
    const blocked = u.to === "verified" && !verifiedOpen;
    upgrades.push({
      from: u.from,
      to: u.to,
      sku: u.sku,
      name: `${PAYG_TIER_NAME[u.from]} → ${PAYG_TIER_NAME[u.to]}`,
      included: s.included,
      amountCents,
      priceLabel: priceLabelCents(amountCents),
      delivery: u.to === "verified" ? paygDeliveryText("verified", sla) : "Immediately — same report, every section opened",
      orderId: src.orderId,
      available: !blocked,
      unavailableReason: blocked ? VERIFIED_FULL_MESSAGE : null,
    });
  }

  return {
    enabled: true,
    billingNote: PAYG_BILLING_NOTE,
    tiers,
    upgrades,
    owned: highestOwnedOrder(input.orders),
  };
}
