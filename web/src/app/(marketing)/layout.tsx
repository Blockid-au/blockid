/**
 * (marketing) route-group layout — Master Upgrade Plan §16.5.
 *
 * Route groups are folders wrapped in parentheses; they group routes
 * logically without adding a URL segment. Every page under
 * `web/src/app/(marketing)/*` is public marketing content (landing,
 * pricing, solutions, blog, legal, business-id, insights, team,
 * changelog, roadmap …). The URL each page serves is unchanged.
 *
 * This layout is intentionally a passthrough — the marketing shell
 * (header, footer, GA, providers) lives in the root `app/layout.tsx`.
 * Keeping this file thin means marketing pages continue to render
 * exactly as they did before the reorg; the layout exists so App
 * Router treats `(marketing)` as a real group and so a future
 * marketing-specific concern (e.g. cookie banner, campaign banner)
 * has a well-defined mount point.
 */

import type { ReactNode } from "react";
import { headers } from "next/headers";

/**
 * B2 Task 8 — marketing-scope structured data.
 *
 * `Organization` and `SoftwareApplication` are already emitted from the
 * root `app/layout.tsx` (see `OrganizationJsonLd` / `SoftwareApplicationJsonLd`
 * in `@/components/seo/json-ld`). We add three marketing-only schemas here so
 * they only render for pages under `(marketing)`:
 *
 *   1. `Product` — the A$3 One-Click Report SKU (Task 8 hard requirement).
 *
 * S8-A (2026-09-11) removed the layout-scope `FAQPage` and the Home-only
 * `BreadcrumbList`: Google requires FAQPage content to be visible on the
 * page and allows one FAQPage per page, so the invisible block was invalid
 * everywhere and doubled the real FAQ on /compare and /solutions/*; the
 * one-crumb trail added nothing next to the per-page BreadcrumbList. Pages
 * with a visible FAQ emit `FAQJsonLd` themselves.
 */
const SITE_URL = "https://blockid.au";

const marketingProductJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "BlockID SVI One-Click Report",
  // 2026-09-09: this described the A$3 guest report as an "Investor Trust
  // Report" containing a "cap-table snapshot". The Trust BizReport is the
  // A$3 SKU (re-priced from A$5.50 on 2026-09-10) that has never taken a
  // payment, and a guest checkout has no account and therefore no cap table
  // to snapshot. Structured data is what
  // Google reads, so a stale claim here outlives the page copy that carried
  // it. This now lists what the report actually contains.
  description:
    "A full startup analysis for Australian founders, from a pitch deck or a website URL. Startup Value Index score across 8 dimensions, an AUD valuation range with the methods behind it, a prioritised action list and a 90-day plan — emailed as a PDF, no account required.",
  brand: { "@type": "Brand", name: "BlockID.au" },
  url: `${SITE_URL}/one-click-report`,
  image: `${SITE_URL}/opengraph-image`,
  offers: {
    "@type": "Offer",
    price: "3.00",
    priceCurrency: "AUD",
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/one-click-report`,
    priceValidUntil: "2027-12-31",
  },
};

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // Thread the request-scoped CSP nonce onto every JSON-LD script tag so
  // the strict-dynamic script-src directive accepts them. Without the nonce
  // browsers block-and-report every page load (2 CSP violations per view
  // caught by the Playwright audit).
  const hdrs = await headers();
  const nonce = hdrs.get("x-nonce") ?? undefined;
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingProductJsonLd) }}
      />
      {children}
    </>
  );
}
