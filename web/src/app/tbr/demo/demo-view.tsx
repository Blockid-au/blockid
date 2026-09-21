// /tbr/demo — the public "reference" Trusted Business Report preview, and
// (G28-D) its four verdict-band variants.
//
// Wave 25A shipped /tbr/[token] as the authenticated share URL for a
// founder's persisted SVI snapshot, but there was no anonymous URL an
// investor could open to see what a TBR actually contains before asking
// a founder to mint a token. This view fills that gap.
//
// G13-W1-R1: the preview is the real thing — a fixed `ReportV2` fixture
// (src/lib/report-v2/fixtures.ts) rendered through the same <TbrReportV2>
// chapters the founder workspace and /tbr/[token] use, so investors see the
// exact chapter structure and the 8 deterministic visuals. Every number is
// illustrative and labelled "demo data".
//
// G28-D: `investmentBandFixture("A"–"D")` drives one static variant per
// verdict band (spec § 4 rubric) — /tbr/demo?band=A…D, rewritten by the
// proxy onto app/tbr/demo/band/[band] (lib/report-v2/demo-band-route.ts).
// The bare /tbr/demo is band B (the demo document as stored). The
// `assessment` half of the fixture is passed through `benchmarks` so the
// Assessment Card, the tiles and the verdict all read the one evidence
// number, exactly as the founder page does.
//
// Server component. No DB reads, no auth, safe to CDN-cache.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { TbrReportV2 } from "@/components/tbr/v2/report";
import { VerdictBandBadge } from "@/components/tbr/v2/shared-v3";
import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { DEMO_BANDS, demoBandHref } from "@/lib/report-v2/demo-band-route";
import { investmentBandFixture, type InvestmentBandFixture } from "@/lib/report-v2/fixtures";
import { cn } from "@/lib/utils";

const TITLE = "Sample Trusted Business Report — BlockID SVI preview";
const DESCRIPTION = "See a BlockID Trusted Business Report before requesting one: executive summary, 8 SVI dimension chapters with visuals, valuation range, phase gates, 90-day plan.";
const CANONICAL = "https://blockid.au/tbr/demo";

/** The band the bare /tbr/demo renders (the demo document as stored). */
export const DEFAULT_DEMO_BAND: InvestmentBandFixture = "B";

const BAND_BLURB: Record<InvestmentBandFixture, string> = {
  A: "every gate clear, evidence confidence 80 %, no unverified claims",
  B: "the demo as stored: evidence confidence 59 %, two unverified claims",
  C: "pre-revenue with two dimension floors missed (TRE, IRI)",
  D: "three dimensions pending, so evidence is asked for first",
};

export function demoMetadata(band: InvestmentBandFixture): Metadata {
  const t = getTbrV3Strings("en");
  const isDefault = band === DEFAULT_DEMO_BAND;
  // Site-meta sweep (S12-A): title ≤ 65 incl. " | BlockID.au", description 70–165.
  const title = isDefault ? TITLE : `Sample Trusted Business Report, verdict ${band}`;
  const description = isDefault
    ? DESCRIPTION
    : `The sample Trusted Business Report as verdict band ${band} (${t.bandLabel[band]}): ${BAND_BLURB[band]}. Same 16 sections.`;
  const canonical = isDefault ? CANONICAL : `${CANONICAL}?band=${band}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url: canonical, siteName: "BlockID", locale: "en_AU" },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

/** "See the other verdict bands" — one link per band, the current one marked. */
function BandSwitcher({ current }: { current: InvestmentBandFixture }) {
  const t = getTbrV3Strings("en");
  return (
    <nav aria-label="Verdict band demos" data-testid="tbr-demo-bands" className="rounded-2xl border border-line-subtle bg-surface-sunken p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">See the other verdict bands</p>
      <p className="mt-1 text-sm text-secondary">The same document rendered through the four outcomes of the verdict rubric. This page shows band {current}.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_BANDS.map((band) => {
          const active = band === current;
          return (
            <li key={band}>
              <Link
                href={demoBandHref(band)}
                aria-current={active ? "page" : undefined}
                data-tbr-demo-band={band}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy",
                  active ? "border-action bg-surface" : "border-line-subtle bg-surface hover:border-line",
                )}
              >
                <VerdictBandBadge band={band} label={t.bandLabel[band]} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TbrDemoView({ band }: { band: InvestmentBandFixture }) {
  const { report, assessment } = investmentBandFixture(band);
  const t = getTbrV3Strings("en");
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Demo · Not a real startup"
        title="What a Trusted Business Report looks like"
        subtitle="A fully-populated sample report so investors can see the depth of evidence before asking a founder to mint one: 8 dimension chapters, each owned by a C-level agent with one deterministic chart, plus valuation, phase gates and a 90-day plan. Every number below is illustrative — no real company data is disclosed on this page."
        primaryCta={{ href: "/showcase/atlassian?step=1", label: "Open interactive showcase" }}
        secondaryCta={{ href: "/sample", label: "Browse sample gallery" }}
      />

      <MarketingSection kicker="Sample report" title={`Trusted Business Report — demo startup · verdict band ${band}: ${t.bandLabel[band]}`}>
        <BandSwitcher current={band} />
        <div className="mt-6 rounded-2xl border border-line-subtle bg-surface p-4 text-primary md:p-8" data-tbr-demo-band-view={band}>
          <TbrReportV2
            report={report}
            upgradeHref="/pricing"
            benchmarks={{ evidenceConfidence: assessment.evidenceConfidence ?? null, unverifiedMaterialClaims: assessment.unverifiedMaterialClaims ?? null }}
          />
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
