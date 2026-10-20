// Order → report access tier (G35 Pricing v5 P2). Pure, client-safe.
//
// `report_orders.product_sku` exists since 0270, so the tier can be derived
// before migration 0474 adds `report_orders.tier` / `assembled_reports.payg_tier`:
//
//   sku_trust_report_5aud / sku_trust_report_credits  (legacy A$3 / credits)  → full
//   report_snapshot                                                          → snapshot
//   report_full,     upgrade_snapshot_full                                   → full
//   report_verified, upgrade_full_verified                                   → verified
//   report_funding  (Money Finder, D25 — not a TBR)                          → null
//
// `assembled_reports.payg_tier` (0474) is the stored report's current tier —
// an upgrade raises it without regenerating the document — so an order's
// effective tier is the higher of the two.

import { maxTier, isReportAccessTier, type ReportAccessTier } from "./tier-projection";
import { PAYG_SKUS, isPaygSkuId, isPaygTier, reportSkuForTier, type PaygTier } from "@/lib/pricing/v5-payg";

export const ORDER_SKU_TIER: Readonly<Record<string, ReportAccessTier | null>> = {
  sku_trust_report_5aud: "full",
  sku_trust_report_credits: "full",
  report_snapshot: "snapshot",
  report_full: "full",
  report_verified: "verified",
  upgrade_snapshot_full: "full",
  upgrade_full_verified: "verified",
  report_funding: null,
};

/** The tier an order's SKU buys (unknown SKU → null, never a silent "full"). */
export function tierForOrderSku(sku: unknown): ReportAccessTier | null {
  if (typeof sku !== "string") return null;
  return Object.prototype.hasOwnProperty.call(ORDER_SKU_TIER, sku) ? ORDER_SKU_TIER[sku] : null;
}

/**
 * Effective tier of a delivered order: max(SKU tier, stored payg_tier).
 * A row with neither (an unknown SKU and no payg_tier) gets the snapshot cut —
 * the least a paid order can show — rather than the full document.
 */
export function resolveOrderTier(order: { product_sku?: unknown; tier?: unknown }, paygTier?: unknown): ReportAccessTier {
  const fromSku = tierForOrderSku(order.product_sku);
  const fromColumn = isReportAccessTier(order.tier) ? order.tier : null;
  const fromReport = isReportAccessTier(paygTier) ? paygTier : null;
  return maxTier([fromSku, fromColumn, fromReport], "snapshot");
}

/**
 * The Pricing v5 tier to LABEL an order with ("Snapshot" / "Full" /
 * "Verified" on the order / report page) — only for a PAYG order: a v5 SKU
 * (report_* / upgrade_*) or a report whose `payg_tier` was stamped (0474).
 * A legacy A$3 / credits order gets null and the page shows no label, so a
 * pre-v5 order (every order while `payg_enabled` is OFF) renders unchanged.
 */
export function paygOrderLabelTier(order: { product_sku?: unknown; tier?: unknown }, paygTier?: unknown): PaygTier | null {
  const v5Sku = isPaygSkuId(order.product_sku) && tierForOrderSku(order.product_sku) !== null;
  if (!v5Sku && !isPaygTier(paygTier)) return null;
  const tier = resolveOrderTier(order, paygTier);
  return isPaygTier(tier) ? tier : null;
}

/** "Snapshot report" / "Full report" / "Verified report" — the catalogue label of the tier's SKU. */
export function paygTierLabel(tier: PaygTier): string {
  return PAYG_SKUS[reportSkuForTier(tier)].label;
}
