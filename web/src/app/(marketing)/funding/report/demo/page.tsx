/**
 * /funding/report/demo — the public sample Money Finder report (S7-B).
 *
 * Shows a visitor exactly what A$3 buys before they answer the three
 * questions: the same `FundingReportView` the paid page renders, fed by
 * `buildDemoFundingReport()` — the real matcher over the seed catalogue for a
 * fixed NSW / MVP / agtech intake with a fixed "today", template narrative,
 * no AI call, no DB, no Stripe. Same input → same page, so it is safe to
 * screenshot for the ProductHunt kit and to index.
 *
 * What differs from /funding/report/[id]: a "Sample report" banner, no
 * Download PDF / Save to data room, no Founder Radar upsell (it needs a
 * viewer), and a single CTA — "Build mine for A$3" → /funding?intent=money.
 * Guest card context (official links only; no ICS / draft links).
 *
 * Static (the seeds are bundled); ISR keeps the CSP nonce path of
 * `FundingJsonLd` happy. VI: no /vi/funding/report route exists, so none here.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { FundingReportView } from "@/components/funding/funding-report-view";
import {
  DEMO_BANNER,
  DEMO_CTA_HREF,
  DEMO_CTA_LABEL,
  DEMO_CANONICAL as CANONICAL,
  DEMO_DESCRIPTION as DESCRIPTION,
  DEMO_TITLE as TITLE,
  buildDemoFundingReport,
  demoReportJsonLd,
} from "@/lib/funding/demo-report";
import { formatAudCompact } from "@/lib/funding/directory";
import { FUNDING_CRUMBS } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: CANONICAL,
  ogType: "article",
});

function SampleBanner() {
  return (
    <div
      className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-action/40 bg-action/10 px-5 py-4"
      role="note"
      data-testid="demo-report-banner"
    >
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
        <FlaskConical className="h-4 w-4 text-action" aria-hidden /> {DEMO_BANNER}
      </p>
      <Link
        href={DEMO_CTA_HREF}
        className="inline-flex items-center gap-1.5 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover"
        data-testid="demo-report-cta"
      >
        {DEMO_CTA_LABEL} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function BuildMineCard({ upTo }: { upTo: number }) {
  return (
    <section
      className="mt-10 rounded-2xl border border-action/40 bg-surface-raised p-6"
      aria-labelledby="demo-build-mine"
      data-testid="demo-report-cta-card"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-action">This is a sample</p>
      <h2 id="demo-build-mine" className="mt-1 text-xl font-semibold text-primary">
        Your report is built from your answers, not these
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-secondary">
        Three questions — what you are building, where the company is registered, what stage you are at — and the
        same matcher ranks every open grant and program for you, with the checklist, the A$ estimate and the
        12-month plan. {upTo > 0 ? `This sample found up to ${formatAudCompact(upTo)} across its top five grants.` : ""}{" "}
        A$3 once, or included with Founder Radar.
      </p>
      <p className="mt-2 text-sm text-secondary">
        Browse the free lists first:{" "}
        <Link href="/funding/grants" className="font-semibold text-action underline-offset-2 hover:underline">
          every Australian startup grant
        </Link>{" "}
        and{" "}
        <Link href="/funding/programs" className="font-semibold text-action underline-offset-2 hover:underline">
          every accelerator and program
        </Link>
        .
      </p>
      <Link
        href={DEMO_CTA_HREF}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-action px-5 py-2.5 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover"
        data-testid="demo-report-cta-bottom"
      >
        {DEMO_CTA_LABEL} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

export default async function FundingReportDemoPage() {
  const report = buildDemoFundingReport();
  return (
    <MarketingShell>
      <BreadcrumbListJsonLd items={[...FUNDING_CRUMBS.demo]} />
      <FundingJsonLd data={demoReportJsonLd()} />
      <FundingReportView
        report={report}
        signedIn={false}
        banner={<SampleBanner />}
        afterBody={<BuildMineCard upTo={report.meta?.summary?.top_grants_amount_max_aud ?? 0} />}
      />
    </MarketingShell>
  );
}
