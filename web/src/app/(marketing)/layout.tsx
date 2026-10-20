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
import { getPaygView } from "@/lib/pricing/payg-view.server";
import { marketingProductJsonLd } from "@/lib/seo/marketing-product-jsonld";

/**
 * B2 Task 8 — marketing-scope structured data.
 *
 * `Organization` and `SoftwareApplication` are already emitted from the
 * root `app/layout.tsx` (see `OrganizationJsonLd` / `SoftwareApplicationJsonLd`
 * in `@/components/seo/json-ld`). We add three marketing-only schemas here so
 * they only render for pages under `(marketing)`:
 *
 *   1. `Product` — the Trusted Business Report (`lib/seo/marketing-product-jsonld`).
 *      Pricing v5 P5: a single legacy `Offer` while
 *      `platform_config.payg_enabled` is off (unchanged), an `AggregateOffer`
 *      over Snapshot / Full / Verified when it is on.
 *
 * S8-A (2026-09-11) removed the layout-scope `FAQPage` and the Home-only
 * `BreadcrumbList`: Google requires FAQPage content to be visible on the
 * page and allows one FAQPage per page, so the invisible block was invalid
 * everywhere and doubled the real FAQ on /compare and /solutions/*; the
 * one-crumb trail added nothing next to the per-page BreadcrumbList. Pages
 * with a visible FAQ emit `FAQJsonLd` themselves.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // S31-D: no `headers()` here any more — it made every marketing route
  // dynamic. JSON-LD blocks are `type="application/ld+json"` data blocks:
  // the HTML "prepare the script element" algorithm returns before the CSP
  // check for a non-JavaScript type, so they need no nonce (the Playwright
  // CSP audit in tests/e2e/smoke/public-hash-csp.spec.ts pins zero
  // violations on the hashed pages). `getPaygView()` reads platform_config
  // through its 60 s cache (no cookies / headers), never throws and falls
  // back to the flag-OFF view, so the marketing routes stay static / ISR.
  const payg = await getPaygView();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingProductJsonLd(payg)) }}
      />
      {children}
    </>
  );
}
