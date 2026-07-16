import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroV2 } from "@/components/landing/hero-v2";
import { SegmentTabs } from "@/components/landing/segment-tabs";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import { FAQV2 } from "@/components/landing/faq-v2";
import { TrialStrip } from "@/components/landing/trial-strip";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { Bento } from "@/components/landing/bento";
import { CtaStrip } from "@/components/landing/cta-strip";

export const metadata = {
  title: "BlockID.au — The Ownership & Growth Execution Platform",
  description:
    "Turn your AI-built idea into a valuable, investable business. BlockID.au helps AI-native founders, startups, and private companies structure ownership, manage valuation, execute growth, and become investor-ready from day one.",
  alternates: {
    canonical: "https://blockid.au",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  const upgradeV2 = process.env.NEXT_PUBLIC_UPGRADE_V2 === "true";

  if (upgradeV2) {
    return (
      <div data-theme="lux" className="bg-brand-navy min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-navy"
        >
          Skip to content
        </a>
        <NavV2 />
        <main id="main-content">
          <HeroV2 />
          <SegmentTabs>
            <PricingMatrix />
          </SegmentTabs>
          <LogoCloud />
          <Bento />
          <FAQV2 />
          <CtaStrip />
        </main>
        <TrialStrip />
      </div>
    );
  }

  return (
    <Suspense>
      <SVIEntrance />
    </Suspense>
  );
}
