// /tbr/demo — public "reference" Trusted Business Report preview.
//
// Wave 25A shipped /tbr/[token] as the authenticated share URL for a
// founder's persisted SVI snapshot, but there was no anonymous URL an
// investor could open to see what a TBR actually contains before asking
// a founder to mint a token. This page fills that gap.
//
// G13-W1-R1: the preview is now the real thing — the fixed `ReportV2`
// fixture (src/lib/report-v2/fixtures.ts) rendered through the same
// <TbrReportV2> chapters the founder workspace and /tbr/[token] use, so
// investors see the exact chapter structure and the 8 deterministic
// visuals. Every number is illustrative and labelled "demo data".
//
// Server component. No DB reads, no auth, safe to CDN-cache.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { TbrReportV2 } from "@/components/tbr/v2/report";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

export const dynamic = "force-static";

const TITLE = "Sample Trusted Business Report — BlockID SVI preview";
const DESCRIPTION = "See a BlockID Trusted Business Report before requesting one: executive summary, 8 SVI dimension chapters with visuals, valuation range, phase gates, 90-day plan.";
const CANONICAL = "https://blockid.au/tbr/demo";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

export default function TbrDemoPage() {
  const report = demoReportV2();
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Demo · Not a real startup"
        title="What a Trusted Business Report looks like"
        subtitle="A fully-populated sample report so investors can see the depth of evidence before asking a founder to mint one: 8 dimension chapters, each owned by a C-level agent with one deterministic chart, plus valuation, phase gates and a 90-day plan. Every number below is illustrative — no real company data is disclosed on this page."
        primaryCta={{ href: "/showcase/atlassian?step=1", label: "Open interactive showcase" }}
        secondaryCta={{ href: "/sample", label: "Browse sample gallery" }}
      />

      <MarketingSection kicker="Sample report" title="Trusted Business Report — demo startup">
        <div className="rounded-2xl border border-line-subtle bg-surface p-4 text-primary md:p-8">
          <TbrReportV2 report={report} upgradeHref="/pricing" />
        </div>
        <p className="mt-4 text-xs text-tertiary">
          The interactive report adds investor views, Peer-5 similarity and a Q&amp;A chat on top of these chapters. Preview the founder journey in the{" "}
          <Link className="text-action underline" href="/showcase/atlassian?step=1">
            Atlassian showcase
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingSection kicker="Ready for a real one?" title="Ask a founder to mint their TBR">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/showcase/atlassian?step=1" className="group block rounded-2xl border border-line-subtle bg-surface p-5 transition-colors hover:border-line">
            <p className="text-sm font-semibold text-secondary">Interactive showcase</p>
            <p className="mt-1 text-xs text-tertiary">Walk through a fully-populated demo report step by step.</p>
          </Link>
          <Link href="/sample" className="group block rounded-2xl border border-line-subtle bg-surface p-5 transition-colors hover:border-line">
            <p className="text-sm font-semibold text-secondary">Sample report gallery</p>
            <p className="mt-1 text-xs text-tertiary">Compare TBR variants across sectors and stages.</p>
          </Link>
          <Link href="/investor" className="group block rounded-2xl border border-line-subtle bg-surface p-5 transition-colors hover:border-line">
            <p className="text-sm font-semibold text-secondary">Investor home</p>
            <p className="mt-1 text-xs text-tertiary">Browse startups with a real SVI grade and request the pack.</p>
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection>
        <NotFinancialAdvice kind="not_financial_advice" />
      </MarketingSection>
    </MarketingShell>
  );
}
