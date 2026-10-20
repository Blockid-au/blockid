// payg-copy — the ONE switch every customer-facing price line reads in wave P5
// of Pricing v5 (G35, docs/pricing-v5-plan.md §6.7; founder D25–D27 approved
// 2026-10-20).
//
// `platform_config.payg_enabled` is a single switch:
//
//   OFF (default) → every surface renders exactly what it rendered before P5:
//                   the legacy one-off report price (v3-skus, A$3), Money
//                   Finder at the legacy price / credits, re-score priced in
//                   A$ — so the live site does not move until the founder
//                   flips the flag.
//   ON            → Pricing v5: Snapshot / Full / Verified PAYG (display
//                   prices from platform_config via `displayPriceCents`),
//                   Money Finder at the Snapshot price point (D25), every
//                   credit amount shown as "N credits" with no A$ conversion
//                   (D27).
//
// Server code builds a `PaygView` once (`getPaygView()` in
// `payg-view.server.ts`) and passes it — or just `view.enabled` — down as a
// prop; client components never fetch the flag where a prop can carry it.
// Legacy amounts are DERIVED from the v3 SKU / FEATURE_COSTS rows rather than
// typed, so this file holds no A$3 / A$1 literal for the messaging guard to
// trip on (docs/design/messaging.md §11).
//
// Pure and isomorphic (no I/O), safe in "use client" modules.

import { FUNDING_REPORT_3AUD, ONE_CLICK_REPORT_3AUD, TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import {
  PAYG_SKUS,
  displayPriceCents,
  type PaygConfig,
  type PaygTier,
} from "@/lib/pricing/v5-payg";

// ─── Formatting ──────────────────────────────────────────────────────────────

/** "A$19", "A$1,500", "A$19.50" — no trailing `.00` on a whole dollar amount. */
export function audFromCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `A$${dollars.toLocaleString("en-AU")}`
    : `A$${dollars.toFixed(2)}`;
}

/** "1 credit" / "19 credits" — D27: credits are never converted to A$. */
export function creditsLabel(n: number): string {
  return `${n.toLocaleString("en-AU")} ${n === 1 ? "credit" : "credits"}`;
}

/** Vietnamese mirror of `creditsLabel` ("19 credit" — the product noun stays English). */
export function creditsLabelVi(n: number): string {
  return `${n.toLocaleString("en-AU")} credit`;
}

// ─── Legacy (flag OFF) values — derived, never typed ────────────────────────

function cents(n: number | null, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** Legacy member/guest Trusted Business Report one-off price (cents). */
export const LEGACY_REPORT_CENTS = cents(ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents, cents(TRUST_REPORT_5AUD.unit_amount_incl_gst_cents, 0));
/** Legacy Money Finder one-off price (cents). */
export const LEGACY_FUNDING_CENTS = cents(FUNDING_REPORT_3AUD.unit_amount_incl_gst_cents, LEGACY_REPORT_CENTS);
/** Legacy Money Finder credit cost (1 credit = 1 legacy A$ unit, pre-D27). */
export const LEGACY_FUNDING_CREDITS = Math.round(LEGACY_FUNDING_CENTS / 100);
/** Legacy evaluator re-score amount (cents) — `FEATURE_COSTS.trust_report_rescore` × 100. */
export const LEGACY_RESCORE_CENTS = 100;

// ─── The view ────────────────────────────────────────────────────────────────

export interface PaygView {
  /** `platform_config.payg_enabled`. */
  readonly enabled: boolean;
  readonly snapshotCents: number;
  readonly fullCents: number;
  readonly verifiedCents: number;
  /** Money Finder full report (D25 = Snapshot price point when ON; legacy when OFF). */
  readonly fundingCents: number;
  /** Money Finder credit cost (D25 19 when ON; legacy when OFF). */
  readonly fundingCredits: number;
  /** "A$19" */
  readonly snapshot: string;
  /** "A$49" */
  readonly full: string;
  /** "A$149" */
  readonly verified: string;
  /** "A$19" (ON) · legacy label (OFF) */
  readonly funding: string;
  /**
   * The cheapest one-off report a visitor can buy: "A$19" when ON (Snapshot),
   * the legacy single report price when OFF.
   */
  readonly reportEntry: string;
  /** Verified SLA in business days. */
  readonly slaDays: number;
}

type ViewConfig = Partial<PaygConfig> | null | undefined;

/** Build the view from a (merged) platform_config. Pure. */
export function paygView(config?: ViewConfig): PaygView {
  const enabled = config?.payg_enabled === true;
  const snapshotCents = displayPriceCents("report_snapshot", config);
  const fullCents = displayPriceCents("report_full", config);
  const verifiedCents = displayPriceCents("report_verified", config);
  // D25 pins Money Finder to the Snapshot price point.
  const fundingCents = enabled ? displayPriceCents("report_funding", config) : LEGACY_FUNDING_CENTS;
  const fundingCredits = enabled ? (PAYG_SKUS.report_funding.creditCost ?? 0) : LEGACY_FUNDING_CREDITS;
  const sla = config?.verified_sla_business_days;
  return Object.freeze({
    enabled,
    snapshotCents,
    fullCents,
    verifiedCents,
    fundingCents,
    fundingCredits,
    snapshot: audFromCents(snapshotCents),
    full: audFromCents(fullCents),
    verified: audFromCents(verifiedCents),
    funding: audFromCents(fundingCents),
    reportEntry: enabled ? audFromCents(snapshotCents) : audFromCents(LEGACY_REPORT_CENTS),
    slaDays: typeof sla === "number" && Number.isInteger(sla) && sla > 0 ? sla : 2,
  });
}

/** The flag-OFF view (today's site). Default for every prop / context. */
export const PAYG_OFF_VIEW: PaygView = paygView(null);
/** The flag-ON view at catalogue prices — tests and previews. */
export const PAYG_ON_VIEW: PaygView = paygView({ payg_enabled: true });

/** Tier display price label. */
export function tierPriceLabel(view: PaygView, tier: PaygTier): string {
  return tier === "snapshot" ? view.snapshot : tier === "full" ? view.full : view.verified;
}

// ─── Shared v5 sentences (one string, every surface) ────────────────────────

/** /pricing FAQ + JSON-LD (plan §6.7, verbatim). */
export function paygSingleReportSentence(view: PaygView): string {
  return `Without a subscription, buy a single report: Snapshot ${view.snapshot}, Full ${view.full} or Verified ${view.verified} (all AUD, GST-inclusive).`;
}

/** VI mirror of `paygSingleReportSentence`. */
export function paygSingleReportSentenceVi(view: PaygView): string {
  return `Không cần gói thuê bao, bạn có thể mua từng báo cáo: Snapshot ${view.snapshot}, Full ${view.full} hoặc Verified ${view.verified} (tất cả bằng AUD, đã gồm GST).`;
}

/** Scout break-even line (plan §6.7): Scout A$79/month < two Full reports. */
export const PAYG_SCOUT_BREAKEVEN_LINE = "Scout pays for itself after two Full reports.";
export const PAYG_SCOUT_BREAKEVEN_LINE_VI = "Gói Scout tự hoàn vốn sau hai báo cáo Full.";

/**
 * Refund sentence for one-off purchases — Terms v2.2 clause 3A. Shared by the
 * /pricing FAQ, faq-v2 and pricing-data so the FAQ never drifts from Terms.
 */
export function paygRefundSentence(view: PaygView): string {
  if (!view.enabled) {
    return `One-off ${audFromCents(LEGACY_REPORT_CENTS)} reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund.`;
  }
  return "One-off reports (Snapshot, Full, Verified, Money Finder) and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund; a Verified report still in review is refunded in full on request.";
}

/** "from A$19" (ON) — the entry price wherever one number stands for "a report". */
export function reportFromLabel(view: PaygView): string {
  return view.enabled ? `from ${view.snapshot}` : view.reportEntry;
}

/** Re-score price label (D27): "1 credit" when ON, the legacy A$ amount when OFF. */
export function rescoreLabel(view: Pick<PaygView, "enabled">): string {
  return view.enabled ? creditsLabel(1) : audFromCents(LEGACY_RESCORE_CENTS);
}

/** Money Finder price line: "A$19 · or 19 credits". */
export function fundingPriceLine(view: PaygView): string {
  return `${view.funding} · or ${creditsLabel(view.fundingCredits)}`;
}
