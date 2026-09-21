// /showcase/blockid/report — BlockID's own Trusted Business Report, public
// (G19-S46, docs/plans/g19-report-quality-2026-09-20.md §0 row 6).
//
// The report is the ReportV2 that `scripts/run-self-analysis.mjs --report`
// persisted on BlockID's canonical project (lib/showcase/blockid-report.ts:
// newest snapshot WITH a stored report_v2, data-cached 1 h). Rendered through
// the same <TbrReportV2> the founder workspace, /tbr/[token] and /tbr/demo
// use — unlocked (standard tier), no survey, nothing edited.
//
// Empty state ("not published yet") when the project has no stored report,
// the column is absent (42P01) or the DB is unreachable — never a 500 and
// never the demo fixture passed off as ours.

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageTracker } from "@/components/analytics/page-tracker";
import { WebPageJsonLd } from "@/components/seo/json-ld";
import { ShowcaseBlockidReportView } from "@/components/showcase/blockid-report-view";
import { loadBlockidShowcaseReport, blockidShowcaseProjectId } from "@/lib/showcase/blockid-report";
import { loadAssessmentContext } from "@/lib/svi/assessment-context";

const SITE_URL = "https://blockid.au";
const SHOWCASE = `${SITE_URL}/showcase/blockid`;
const CANONICAL = `${SHOWCASE}/report`;

const TITLE = "BlockID's own Trusted Business Report — the showcase";
const DESCRIPTION = "BlockID scoring BlockID: our own Trusted Business Report from the pipeline every founder gets — score ledger, honest valuation, real evidence, honest gaps.";

// The showcase segment's file-convention OG / Twitter images are reused —
// this page has no data of its own for a card.
const OG_IMAGE = { url: `${SHOWCASE}/opengraph-image`, width: 1200, height: 630, alt: "BlockID.au — Startup Valuation Index" };
const TWITTER_IMAGE = { url: `${SHOWCASE}/twitter-image`, width: 1200, height: 675, alt: "BlockID.au — Startup Valuation Index" };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["trusted business report", "blockid showcase", "startup value index report", "dogfooding startup report"],
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: CANONICAL, siteName: "BlockID", locale: "en_AU", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [TWITTER_IMAGE] },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

// Rendered per request (nonce-mode CSP). The report data itself is data-cached
// 1 h in lib/showcase/blockid-report.ts, but the Assessment Card context
// (benchmark segments, claim counts) changes on the server between deploys —
// as an ISR document the regenerated flight chunk no longer matched the
// hash-mode CSP header (blocked inline script + React #412, 2026-09-21), so
// this route is excluded from lib/security/public-cacheable-routes.ts.
export const dynamic = "force-dynamic";

export default async function ShowcaseBlockidReportPage() {
  const loaded = await loadBlockidShowcaseReport();
  // G21 P1: claims count + stage benchmark for the Assessment Card (fail-soft).
  const assessmentContext = await loadAssessmentContext(blockidShowcaseProjectId(), loaded?.report.cover.stage ?? null, loaded?.report.cover.sector ?? null);
  return (
    <>
      <PageTracker page="showcase-blockid-report" />
      <WebPageJsonLd
        url={CANONICAL}
        name={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[
          { name: "Home", url: SITE_URL },
          { name: "Showcase", url: SHOWCASE },
          { name: "Our own report", url: CANONICAL },
        ]}
      />
      <MarketingShell>
        <ShowcaseBlockidReportView loaded={loaded} benchmarks={{ total: assessmentContext.benchmark, evidenceConfidence: assessmentContext.evidenceConfidence, unverifiedMaterialClaims: assessmentContext.unverifiedMaterialClaims }} />
      </MarketingShell>
    </>
  );
}
