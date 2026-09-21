/**
 * `/tbr/demo?band=A|B|C|D` URL contract → internal static route (G28-D).
 *
 * `/tbr/demo` is `force-static` and reading `searchParams` there would make
 * the whole page dynamic (per-request render, no CDN cache). So the four
 * verdict bands are prerendered as their own static variants and the proxy
 * rewrites the query URL onto them — the same shape as
 * `/funding/grants?state=NSW` → `/funding/grants/state/NSW` (S31-D):
 *
 *   /tbr/demo                → app/tbr/demo/page.tsx                (band B, the demo as stored)
 *   /tbr/demo?band=A         → app/tbr/demo/band/[band]/page.tsx    (generateStaticParams A–D)
 *   /tbr/demo?band=junk      → served as-is (the base page ignores the query)
 *
 * Direct hits on `/tbr/demo/band/A` work too and canonicalise to the query
 * URL. Dependency-light on purpose: imported by the proxy.
 */

import type { InvestmentBandFixture } from "@/lib/report-v2/fixtures";

const DEMO = "/tbr/demo";

export const DEMO_BANDS: readonly InvestmentBandFixture[] = ["A", "B", "C", "D"];

/** The band a raw `?band=` / `[band]` value names, or null when it is not one of A–D. */
export function normaliseDemoBand(raw: string | null | undefined): InvestmentBandFixture | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return (DEMO_BANDS as readonly string[]).includes(t) ? (t as InvestmentBandFixture) : null;
}

/** Path the request should be rewritten to, or null to serve the URL as-is. */
export function demoBandRewriteTarget(pathname: string, search: URLSearchParams): string | null {
  if (pathname !== DEMO) return null;
  const band = normaliseDemoBand(search.get("band"));
  return band ? `${DEMO}/band/${band}` : null;
}

/** The public URL of one band variant (what links and canonicals use). */
export function demoBandHref(band: InvestmentBandFixture): string {
  return `${DEMO}?band=${band}`;
}

/** The static route path of one band variant (what the sitemap-free static file is served from). */
export function demoBandPath(band: InvestmentBandFixture): string {
  return `${DEMO}/band/${band}`;
}

/** Static params for the per-band demo pages. */
export function demoBandParams(): Array<{ band: InvestmentBandFixture }> {
  return DEMO_BANDS.map((band) => ({ band }));
}
