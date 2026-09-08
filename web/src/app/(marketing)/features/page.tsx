/**
 * /features — surfaces platform capabilities that were previously
 * under-promised across marketing pages. Landed 2026-09-07 as
 * Workstream D of the review-t-on-b-foamy-pixel plan.
 *
 * 8 cards grouped into three audience sections:
 *   • For founders — cohort percentile, per-investor tracked links,
 *     dividend engine, 17 free tools, guided journey.
 *   • For investors — evidence completeness, LP anonymisation.
 *   • For everyone — ATO tax invoice at checkout.
 *
 * Server component. Renders inside `MarketingShell` for the standard
 * fintech deep-navy chrome + `NavV2` header + shared footer.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Coins,
  FileCheck,
  Link2,
  Receipt,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

const CANONICAL_URL = "https://blockid.au/features";

export const metadata: Metadata = {
  title: "Features · BlockID.au",
  description:
    "Eight platform capabilities most visitors never see — cohort percentile scoring, per-investor tracked share links, ATO tax invoicing, dividend engine, and more.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Features · BlockID.au",
    description:
      "Eight platform capabilities most visitors never see — cohort percentile scoring, per-investor tracked share links, ATO tax invoicing, dividend engine, and more.",
    url: CANONICAL_URL,
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "https://blockid.au/images/logo-full.png",
        width: 1556,
        height: 880,
        alt: "BlockID.au Features",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Features · BlockID.au",
    description:
      "Eight platform capabilities most visitors never see — cohort percentile scoring, per-investor tracked share links, ATO tax invoicing, dividend engine, and more.",
    images: ["https://blockid.au/images/logo-full.png"],
  },
};

// ---------------------------------------------------------------------------
// Feature model
// ---------------------------------------------------------------------------

type Feature = {
  anchor: string;
  title: string;
  copy: string;
  href: string;
  linkLabel: string;
  Icon: LucideIcon;
};

const FOUNDER_FEATURES: Feature[] = [
  {
    anchor: "cohort-percentile-scoring",
    title: "Cohort percentile scoring",
    copy: "See exactly where your SVI score sits inside your sector cohort — not just a number, a percentile.",
    href: "/how-it-works#svi",
    linkLabel: "How the score works",
    Icon: BarChart3,
  },
  {
    anchor: "per-investor-tracked-share-links",
    title: "Per-investor tracked share links",
    copy: "Every investor gets a unique URL. You see who opened it, when, and how long they read.",
    href: "/sample",
    linkLabel: "See a sample link",
    Icon: Link2,
  },
  {
    anchor: "dividend-engine",
    title: "Dividend engine with franking credits",
    copy: "Pay dividends on-platform with franking-credit calculation baked in — off-chain by default, on-chain optional.",
    href: "/tools",
    linkLabel: "Explore the toolset",
    Icon: Coins,
  },
  {
    anchor: "free-tools",
    title: "17 free tools",
    copy: "From SAFE calculator to R&D-tax checker to ESOP eligibility — 17 focused tools, all free, no login required.",
    href: "/tools",
    linkLabel: "Open the tools hub",
    Icon: Wrench,
  },
  {
    anchor: "guided-journey",
    title: "12-chapter guided journey",
    copy: "A step-by-step operator's manual — 12 chapters from ideation to your first Series A.",
    href: "/guide/reports",
    linkLabel: "Start the guide",
    Icon: BookOpen,
  },
];

const INVESTOR_FEATURES: Feature[] = [
  {
    anchor: "evidence-completeness",
    title: "Evidence completeness engine",
    copy: "Every SVI dimension carries a completeness percentage — no evidence = no confident score.",
    href: "/how-it-works#svi",
    linkLabel: "See how it works",
    Icon: FileCheck,
  },
  {
    anchor: "lp-anonymisation",
    title: "LP report anonymisation",
    copy: "Share benchmark data with LPs without exposing individual startup names.",
    href: "/investor",
    linkLabel: "Investor home",
    Icon: ShieldCheck,
  },
];

const EVERYONE_FEATURES: Feature[] = [
  {
    anchor: "ato-tax-invoice",
    title: "ATO tax invoice at checkout",
    copy: "Your Stripe receipt is an ATO-compliant tax invoice with our ABN 79 659 615 111 and GST amount.",
    href: "/pricing",
    linkLabel: "See pricing",
    Icon: Receipt,
  },
];

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

function FeatureCard({ feature }: { feature: Feature }) {
  const { Icon } = feature;
  return (
    <article
      id={feature.anchor}
      className="group relative flex h-full scroll-mt-24 flex-col rounded-2xl border border-line-subtle bg-surface-raised p-6 transition-colors duration-200 hover:border-line"
    >
      <div
        aria-hidden="true"
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-sunken text-action"
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-lg font-semibold text-primary">
        {feature.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-secondary">
        {feature.copy}
      </p>
      <Link
        href={feature.href}
        className="mt-4 inline-flex items-center gap-1 self-start rounded-md text-sm font-semibold text-action transition-colors duration-200 ease-out hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {feature.linkLabel}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </article>
  );
}

function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <FeatureCard key={f.anchor} feature={f} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <PageViewTracker event="features_viewed" params={{}} />

      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Features", href: "/features" },
        ]}
      />

      <MarketingHero
        eyebrow="Features"
        title={
          <>
            The eight things you didn&apos;t know we ship
          </>
        }
        subtitle="BlockID quietly does more than the homepage lets on. Cohort percentile scoring, per-investor tracked share links, ATO-compliant tax invoicing, a franking-credit dividend engine and more — every capability below is live today."
        primaryCta={{ href: "/pricing", label: "See prices" }}
        secondaryCta={{ href: "/tbr/demo", label: "See a trust report" }}
      />

      <MarketingSection
        title="For founders"
        kicker="Build, share, get paid"
      >
        <p className="text-sm text-secondary">
          The full arc from your first SVI score to your first franked
          dividend — every step lives in the same audit trail.
        </p>
        <div className="mt-8">
          <FeatureGrid features={FOUNDER_FEATURES} />
        </div>
      </MarketingSection>

      <MarketingSection
        tone="elevated"
        title="For investors"
        kicker="Evidence in, anonymity out"
      >
        <p className="text-sm text-secondary">
          Investor-facing surfaces refuse to score anything without
          evidence, and let you share cohort benchmarks with LPs without
          leaking individual startup names.
        </p>
        <div className="mt-8">
          <FeatureGrid features={INVESTOR_FEATURES} />
        </div>
      </MarketingSection>

      <MarketingSection
        title="For everyone"
        kicker="Compliance out of the box"
      >
        <p className="text-sm text-secondary">
          The moment you pay, you have paperwork your accountant already
          accepts.
        </p>
        <div className="mt-8">
          <FeatureGrid features={EVERYONE_FEATURES} />
        </div>
      </MarketingSection>

      <MarketingSection tone="elevated">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-xl font-semibold text-primary sm:text-2xl">
              Ready to see it working?
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Open a real trust report end-to-end — no sign-up — or jump
              straight to pricing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-6 text-sm font-semibold text-on-action transition-colors duration-200 ease-out hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Prices
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/tbr/demo"
              className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-semibold text-primary transition-colors duration-200 ease-out hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              See a trust report
            </Link>
          </div>
        </div>
      </MarketingSection>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <NotFinancialAdvice kind="not_financial_advice" />
      </div>
    </MarketingShell>
  );
}
