/**
 * robots.txt — indexer directives for BlockID.au.
 *
 * Master Upgrade Plan §7.5 SEO + Stage-3 sub-B3:
 *   - Explicitly allow the new marketing surfaces so crawlers pick them
 *     up quickly: `/solutions/*`, `/business-id`, `/id/*` (per user-locked
 *     decision D3 — `/id/[slug]` is public-by-default indexable).
 *   - Explicitly disallow app surfaces that should never index:
 *     `/dashboard`, `/checkout`, `/admin`.
 *   - Sitemap URL stays canonical.
 *
 * Order matters in a rules array — `allow` for a specific path beats a
 * broad `disallow` in Google's parser only when the allow rule is more
 * specific. We list allow paths first for clarity, then the disallows.
 */

import type { MetadataRoute } from "next";

const SITE_URL = "https://blockid.au";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/solutions/",
          "/business-id",
          "/id/",
        ],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/checkout",
          "/checkout/",
          "/admin",
          "/admin/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
