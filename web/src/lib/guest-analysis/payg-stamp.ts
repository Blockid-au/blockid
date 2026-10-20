// G35 D26 — the Pricing v5 tier a guest order was bought at. Pure.
//
// /api/guest-analysis/create-order stamps `report_data.payg = { tier, sku,
// pricing_version }` on the guest_analyses row (no new column); the runner
// reads it back to pick the PDF cut and the tax-invoice line. Absent on the
// A$3 One-Click SKU → the runner is unchanged.

export interface GuestPaygStamp {
  tier: "snapshot" | "full";
  sku: string;
  pricing_version: string;
}

/** The tier create-order stamped on `report_data.payg` (null on the A$3 SKU or anything malformed). */
export function guestPaygStamp(reportData: unknown): GuestPaygStamp | null {
  if (!reportData || typeof reportData !== "object") return null;
  const p = (reportData as { payg?: unknown }).payg;
  if (!p || typeof p !== "object") return null;
  const { tier, sku, pricing_version } = p as Record<string, unknown>;
  if (tier !== "snapshot" && tier !== "full") return null;
  return { tier, sku: typeof sku === "string" ? sku : `report_${tier}`, pricing_version: typeof pricing_version === "string" ? pricing_version : "v5" };
}

/** PDF depth per guest tier: Snapshot → the short "preview" cut; Full / legacy A$3 → "standard" (unchanged). */
export function guestPdfTier(stamp: GuestPaygStamp | null): "preview" | "standard" {
  return stamp?.tier === "snapshot" ? "preview" : "standard";
}

/** Tax-invoice line label for a v5 guest order. */
export function guestTierLabel(stamp: GuestPaygStamp): string {
  return stamp.tier === "snapshot" ? "Snapshot report" : "Full report";
}
