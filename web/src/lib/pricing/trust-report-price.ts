// trust-report-price — the ONE place a founder surface reads the Trusted
// Business Report's one-off price from (G16-B, copy truth).
//
// The amount lives on the v3 SKU (`TRUST_REPORT_5AUD.unit_amount_incl_gst_cents`)
// because that is what /api/reports/checkout books with Stripe; the credit
// side (`FEATURE_COSTS.trust_report`) is pinned equal by the colocated test.
// Components, the unlock rail, the paywall modal and the drip copy import
// these helpers — never a literal "A$3" — so a re-price happens in one file.
//
// Pure and isomorphic (no I/O), safe in "use client" modules.

import { formatAud } from "@/lib/plans-v2";
import { TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";

/** Stripe SKU id the checkout route books (historical id — never renamed). */
export const TRUST_REPORT_SKU_ID = TRUST_REPORT_5AUD.id;

/** One-off price in cents, GST inclusive, as booked by /api/reports/checkout. */
export const TRUST_REPORT_AMOUNT_CENTS: number = TRUST_REPORT_5AUD.unit_amount_incl_gst_cents ?? 0;

/** One-off price in whole AUD (3 for A$3.00). */
export const TRUST_REPORT_PRICE_AUD: number = TRUST_REPORT_AMOUNT_CENTS / 100;

/** "A$3" — the label every founder surface renders (formatAud from plans-v2). */
export function trustReportPriceLabel(): string {
  return formatAud(TRUST_REPORT_PRICE_AUD);
}

/** "A$3 inc-GST" — the long form for the confirm step and e-mails. */
export function trustReportPriceLabelLong(): string {
  return `${trustReportPriceLabel()} inc-GST`;
}
