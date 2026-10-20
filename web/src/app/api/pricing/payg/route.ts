/**
 * GET /api/pricing/payg — public Pricing v5 DISPLAY prices (G35 P3).
 *
 * For client surfaces that cannot read platform_config themselves (the
 * /analyze guest panel, the Money Finder paywall on a static page): whether
 * pay-as-you-go is on, and the price / credits / delivery each tier SHOWS.
 *
 *   payg_enabled = false → { ok: true, enabled: false }   (surfaces keep A$3)
 *   payg_enabled = true  → { ok: true, enabled: true, billingNote, tiers[], funding }
 *
 * Display only — the amount CHARGED is always the Stripe Price the checkout
 * routes resolve server-side. No auth, no PII, short shared cache.
 */

import { NextResponse } from "next/server";
import { readPaygConfig } from "@/lib/pricing/payg-flag";
import { buildPaygOffer, PAYG_BILLING_NOTE, priceLabelCents } from "@/lib/pricing/payg-offer";
import { PAYG_SKUS, displayPriceCents } from "@/lib/pricing/v5-payg";

export const dynamic = "force-dynamic";

const CACHE = { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" };

export async function GET(): Promise<Response> {
  const cfg = await readPaygConfig();
  if (!cfg.payg_enabled) return NextResponse.json({ ok: true, enabled: false }, { headers: CACHE });
  // Verified availability is buyer-specific (and capacity-checked at checkout);
  // the public list shows the catalogue with Verified marked as sign-in only.
  const offer = buildPaygOffer({ config: cfg, orders: [], openVerifiedCount: 0 });
  const tiers = offer.enabled ? offer.tiers : [];
  const fundingCents = displayPriceCents("report_funding", cfg);
  return NextResponse.json(
    {
      ok: true,
      enabled: true,
      billingNote: PAYG_BILLING_NOTE,
      slaBusinessDays: cfg.verified_sla_business_days,
      tiers: tiers.map((t) => ({ ...t, available: true, unavailableReason: null })),
      funding: {
        sku: PAYG_SKUS.report_funding.id,
        amountCents: fundingCents,
        priceLabel: priceLabelCents(fundingCents),
        credits: PAYG_SKUS.report_funding.creditCost,
      },
    },
    { headers: CACHE },
  );
}
