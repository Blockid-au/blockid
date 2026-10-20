// The `Product` JSON-LD the (marketing) layout emits on every marketing page
// (B2 Task 8). Pricing v5 P5 (docs/pricing-v5-plan.md §6.7): with
// `platform_config.payg_enabled` on, the offer becomes an `AggregateOffer`
// over the three single-report tiers (Snapshot / Full / Verified), low/high
// derived from the PaygView display cents; with the flag off the block is
// exactly the pre-v5 single `Offer`. Pure — the layout reads the view.

import { LEGACY_REPORT_CENTS, type PaygView } from "@/lib/pricing/payg-copy";

const SITE_URL = "https://blockid.au";

/** "19.00" — schema.org price text. */
function priceText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function marketingProductJsonLd(view: PaygView): Record<string, unknown> {
  const base = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Trusted Business Report — Startup Value Index by BlockID",
    // 2026-09-09: this described the guest report as an "Investor Trust
    // Report" containing a "cap-table snapshot". The Trusted Business Report
    // is the guest SKU (re-priced from A$5.50 on 2026-09-10), and a guest
    // checkout has no account and therefore no cap table to snapshot.
    // Structured data is what Google reads, so a stale claim here outlives
    // the page copy that carried it. This lists what the report contains.
    description:
      "The full Trusted Business Report for Australian founders, from a pitch deck or a website URL. Startup Value Index score across 8 dimensions, an AUD valuation range with the methods behind it, a prioritised action list and a 90-day plan — emailed as a PDF, no account required.",
    brand: { "@type": "Brand", name: "BlockID.au" },
    url: `${SITE_URL}/one-click-report`,
    image: `${SITE_URL}/opengraph-image`,
  };

  if (!view.enabled) {
    return {
      ...base,
      offers: {
        "@type": "Offer",
        price: priceText(LEGACY_REPORT_CENTS),
        priceCurrency: "AUD",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/one-click-report`,
        priceValidUntil: "2027-12-31",
      },
    };
  }

  const tiers = [view.snapshotCents, view.fullCents, view.verifiedCents];
  return {
    ...base,
    description:
      "A Trusted Business Report on any Australian startup, from a pitch deck or a website URL, bought one report at a time: Snapshot (SVI score, 8-dimension radar, top risks), Full (all 16 sections, Australian comparables, evidence register) or Verified (evidence reviewed by the BlockID team). AUD, GST-inclusive.",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "AUD",
      lowPrice: priceText(Math.min(...tiers)),
      highPrice: priceText(Math.max(...tiers)),
      offerCount: tiers.length,
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/pricing#pay-as-you-go`,
    },
  };
}
