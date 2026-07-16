import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";
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
        <HeroV2 />
        <SegmentTabs>
          <PricingMatrix />
        </SegmentTabs>
        <LogoCloud />
        <Bento />
        <FAQV2 />
        <CtaStrip />
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
