/**
 * /features — surfaces platform capabilities that were previously
 * under-promised across marketing pages. Landed 2026-09-07 as
 * Workstream D of the review-t-on-b-foamy-pixel plan.
 *
 * 8 cards grouped into three audience sections (copy in
 * `features-content.ts`):
 *   • For founders — cohort percentile, per-investor tracked links,
 *     dividend engine, 16 free tools, guided journey.
 *   • For investors — evidence completeness, LP anonymisation.
 *   • For everyone — ATO tax invoice at checkout.
 *
 * G17 P2-A: on the unicorn template — PageHero → Section × 3 (FeatureGrid,
 * each card keeps its `id` anchor) → UnlockPreview → CtaBand.
 *
 * Server component. Renders inside `MarketingShell`.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import {
  BarChart3,
  BookOpen,
  Coins,
  FileCheck,
  Link2,
  Receipt,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section, type FeatureItem } from "@/components/marketing/template";
import { UnlockPreview } from "@/components/marketing/unlock-preview";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import {
  EVERYONE_FEATURES,
  FOUNDER_FEATURES,
  INVESTOR_FEATURES,
  type FeatureCopy,
  type FeatureIcon,
} from "./features-content";

export const metadata: Metadata = pageMetadata({
  title: "Platform features most visitors never see",
  description: "Eight platform capabilities most visitors never see — cohort percentile scoring, per-investor tracked share links, ATO tax invoicing, dividend engine, and more.",
  path: "/features",
});

export const revalidate = 300;

const ICONS: Record<FeatureIcon, LucideIcon> = {
  "bar-chart": BarChart3,
  link: Link2,
  coins: Coins,
  wrench: Wrench,
  book: BookOpen,
  "file-check": FileCheck,
  "shield-check": ShieldCheck,
  receipt: Receipt,
};

function items(features: readonly FeatureCopy[]): FeatureItem[] {
  return features.map((f) => ({
    id: f.anchor,
    icon: ICONS[f.icon],
    title: f.title,
    body: f.copy,
    href: f.href,
    cta: f.linkLabel,
    ctaId: `features_${f.anchor.replace(/-/g, "_")}`,
  }));
}

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

      <PageHero
        eyebrow="Features"
        title="The eight things you didn't know we ship"
        sub="BlockID quietly does more than the homepage lets on. Cohort percentile scoring, per-investor tracked share links, ATO-compliant tax invoicing, a franking-credit dividend engine and more."
        ctas={[
          { href: "/pricing", label: "See pricing", ctaId: "features_hero_pricing" },
          { href: "/tbr/demo", label: "See a sample dossier" },
        ]}
        align="start"
      />

      <Section
        id="founders"
        eyebrow="Build, share, get paid"
        title="For founders"
        lede="The full arc from your first SVI score to your first franked dividend — every step lives in the same audit trail."
      >
        <FeatureGrid columns={3} ariaLabel="Founder features" items={items(FOUNDER_FEATURES)} />
      </Section>

      <Section
        id="investors"
        eyebrow="Evidence in, anonymity out"
        title="For investors"
        lede="Investor-facing surfaces refuse to score anything without evidence, and let you share cohort benchmarks with LPs without leaking individual startup names."
        tone="sunken"
      >
        <FeatureGrid columns={3} ariaLabel="Investor features" items={items(INVESTOR_FEATURES)} />
      </Section>

      <Section
        id="everyone"
        eyebrow="Compliance out of the box"
        title="For everyone"
        lede="The moment you pay, you have paperwork your accountant already accepts."
      >
        <FeatureGrid columns={3} ariaLabel="Features for everyone" items={items(EVERYONE_FEATURES)} />
        <div className="mt-10">
          <NotFinancialAdvice kind="not_financial_advice" />
        </div>
      </Section>

      {/* G11 §3c (T0238) — the eight workspace surfaces that left the top
          nav, shown locked with a login deep-link each. */}
      <UnlockPreview tone="sunken" />

      <CtaBand
        title="Ready to see it working?"
        sub="Open a real Trusted Business Report end-to-end — no sign-up — or jump straight to pricing."
        primary={{ href: "/pricing", label: "See pricing", ctaId: "features_final_pricing" }}
        secondary={{ href: "/tbr/demo", label: "See a sample dossier" }}
      />
    </MarketingShell>
  );
}
