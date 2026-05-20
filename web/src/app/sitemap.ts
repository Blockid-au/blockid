import type { MetadataRoute } from "next";
import { getAllArticles, invalidateCache } from "@/lib/insights";

export const dynamic = "force-dynamic";

const SITE_URL = "https://blockid.au";

export default function sitemap(): MetadataRoute.Sitemap {
  invalidateCache(); // ensure fresh read from disk (content volume)
  const lastModified = new Date();

  // Dynamic insight articles
  const insightEntries: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: `${SITE_URL}/insights/${a.slug}`,
    lastModified: new Date(a.updatedAt ?? a.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/score`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/tools/dilution`,
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
    },
    {
      url: `${SITE_URL}/developers`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Insights / blog
    {
      url: `${SITE_URL}/insights`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
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
    // Dynamic insight articles
    ...insightEntries,
  ];
}
