import type { MetadataRoute } from "next";
import { getAllArticles, invalidateCache } from "@/lib/insights";
import { listPublicSlugsForSitemap } from "@/lib/business-id/list-public-slugs";

export const dynamic = "force-dynamic";

const SITE_URL = "https://blockid.au";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  invalidateCache(); // ensure fresh read from disk (content volume)
  const lastModified = new Date();

  // Master Upgrade Plan §11.1 + §14bis D3 — public Business ID profiles.
  // Only rows with public_index=true AND verification_level >= 2 make it
  // in; L1 self-declared is not sufficient for public discovery.
  const publicSlugs = await listPublicSlugsForSitemap();
  const businessIdEntries: MetadataRoute.Sitemap = publicSlugs.flatMap((entry) => {
    // L2 = 0.6 baseline, +0.1 per level up to L5 = 0.9
    const priority = Math.min(0.9, 0.6 + (entry.verificationLevel - 2) * 0.1);
    const enUrl = `${SITE_URL}/id/${entry.slug}`;
    const viUrl = `${SITE_URL}/vi/id/${entry.slug}`;
    const languages = {
      en: enUrl,
      vi: viUrl,
      "x-default": enUrl,
    };
    return [
      {
        url: enUrl,
        lastModified: entry.lastVerifiedAt,
        changeFrequency: "weekly" as const,
        priority,
        alternates: { languages },
      },
      // Sub-T4 — VI mirror only for L2+ profiles (same gate as EN); the
      // reader-language toggle is discoverable via hreflang on both sides.
      {
        url: viUrl,
        lastModified: entry.lastVerifiedAt,
        changeFrequency: "weekly" as const,
        priority,
        alternates: { languages },
      },
    ];
  });

  // Dynamic insight articles — recent (last 30d) get weekly crawl + higher priority
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const insightEntries: MetadataRoute.Sitemap = getAllArticles().map((a) => {
    const isRecent = new Date(a.publishedAt) >= thirtyDaysAgo;
    const keywordBoost = a.keywords.length >= 4 ? 0.05 : 0;
    return {
      url: `${SITE_URL}/insights/${a.slug}`,
      lastModified: new Date(a.updatedAt ?? a.publishedAt),
      changeFrequency: isRecent ? ("weekly" as const) : ("monthly" as const),
      priority: isRecent ? Math.min(0.9, 0.8 + keywordBoost) : Math.min(0.8, 0.7 + keywordBoost),
    };
  });

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          en: `${SITE_URL}/`,
          vi: `${SITE_URL}/vi`,
          "x-default": `${SITE_URL}/`,
        },
      },
    },
    // Vietnamese-Australian founder cohort (T-1400)
    {
      url: `${SITE_URL}/vi`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          en: `${SITE_URL}/`,
          vi: `${SITE_URL}/vi`,
          "x-default": `${SITE_URL}/`,
        },
      },
    },
    {
      url: `${SITE_URL}/vi/pricing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: {
        languages: {
          en: `${SITE_URL}/pricing`,
          vi: `${SITE_URL}/vi/pricing`,
          "x-default": `${SITE_URL}/pricing`,
        },
      },
    },
    {
      url: `${SITE_URL}/score`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/svi`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/demo`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/tools`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/benchmarks`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guides/valuation-methods`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/dilution`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/safe-calculator`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/esop-checklist`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/financial-projections`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/idea-valuation`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/cap-table`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/equity-split`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/term-sheet`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/data-room`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/funding-plan`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/cofounder-match`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/asic`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/esic`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools/rnd-tax`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          en: `${SITE_URL}/pricing`,
          vi: `${SITE_URL}/vi/pricing`,
          "x-default": `${SITE_URL}/pricing`,
        },
      },
    },
    {
      url: `${SITE_URL}/developers`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Per-segment marketing landings (T-0317)
    {
      url: `${SITE_URL}/for/founder`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for/investor`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for/advisor`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/for/accelerator`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // v3 persona landings under /solutions/* — Master Upgrade Plan §7.1
    // (Stage-3 sub-B3). Legacy /for/founder now 301s to /solutions/founder
    // via next.config.ts; we keep the sitemap entry to give Google a fresh
    // canonical target during transition.
    {
      url: `${SITE_URL}/solutions/founder`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          en: `${SITE_URL}/solutions/founder`,
          vi: `${SITE_URL}/vi/solutions/founder`,
          "x-default": `${SITE_URL}/solutions/founder`,
        },
      },
    },
    // Sub-T4 (§7.7) — VI mirror of the Founder persona page.
    {
      url: `${SITE_URL}/vi/solutions/founder`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          en: `${SITE_URL}/solutions/founder`,
          vi: `${SITE_URL}/vi/solutions/founder`,
          "x-default": `${SITE_URL}/solutions/founder`,
        },
      },
    },
    {
      url: `${SITE_URL}/solutions/vn-sme`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          en: `${SITE_URL}/solutions/vn-sme`,
          vi: `${SITE_URL}/vi/solutions/vn-sme`,
          "x-default": `${SITE_URL}/solutions/vn-sme`,
        },
      },
    },
    {
      url: `${SITE_URL}/vi/solutions/vn-sme`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          en: `${SITE_URL}/solutions/vn-sme`,
          vi: `${SITE_URL}/vi/solutions/vn-sme`,
          "x-default": `${SITE_URL}/solutions/vn-sme`,
        },
      },
    },
    {
      url: `${SITE_URL}/solutions/investor`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/solutions/accelerator`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // Business ID explainer (D3 — public, indexable)
    {
      url: `${SITE_URL}/business-id`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // Insights / blog
    {
      url: `${SITE_URL}/insights`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // AU Startup Index — public directory (T-1300 first scaffold, Goal 5C).
    // Per-listing `/listings/[ticker]` URLs will be sourced from
    // `getPublicListings()` in a future task (T-1305) once listings begin to
    // populate; for now we ship the /index entry so Google discovers the
    // top-level directory URL.
    {
      url: `${SITE_URL}/listings`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    // Public transparency + docs surfaces
    {
      url: `${SITE_URL}/roadmap`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/changelog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/status`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/security-audit`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/legal/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/disclaimers`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    // Static pages
    {
      url: `${SITE_URL}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/founding-50`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/investors`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    // Dynamic insight articles
    ...insightEntries,
    // Dynamic public Business ID profiles (§11.1 / §14bis D3)
    ...businessIdEntries,
  ];
}
