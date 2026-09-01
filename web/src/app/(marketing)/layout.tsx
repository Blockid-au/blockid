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
 *   2. `FAQPage` — top-of-funnel questions (pricing, refund, GST). These are
 *      surfaced across multiple marketing pages, so we register the schema
 *      once at layout scope rather than duplicating on every page.
 *   3. `BreadcrumbList` — Home → Marketing anchor. Per-page BreadcrumbList
 *      schemas can extend this via the JsonLd helpers.
 */
const SITE_URL = "https://blockid.au";

const marketingProductJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "BlockID SVI One-Click Report",
  description:
    "One-click Investor Trust Report for Australian founders. AI-generated SVI score across 8 dimensions, AUD valuation range, cap-table snapshot, and a 30-day investor-readiness plan — delivered by email in under 5 minutes.",
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

const marketingFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much does the One-Click Report cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A$3 one-off, GST-inclusive. You receive an ATO tax invoice after payment.",
      },
    },
    {
      "@type": "Question",
      name: "Do you charge GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Auschain PTY LTD (ABN 79 659 615 111) is GST-registered. All prices on blockid.au are GST-inclusive and every charge produces an ATO-compliant tax invoice.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to sign up to try BlockID?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The One-Click Report is a guest checkout — pay A$3, upload your pitch or paste your URL, and receive the report by email. No account required.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data secure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "BlockID.au follows the Australian Privacy Act 1988 (APP 1–13) and the ACSC Essential Eight (Maturity Level 1). Payments are processed by Stripe (PCI DSS Level 1). No personally identifying information is passed to AI providers.",
      },
    },
  ],
};

const marketingBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
  ],
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
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingFaqJsonLd) }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingBreadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
